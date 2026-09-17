# SQLite backup & restore (deals.madhudadi.in)

Operational runbook for the Deals app database.

## RTO / RPO Objectives

Objectives are **derived from the backup cadence implemented in this runbook** — they are factual properties of the current mechanism, not aspirational SLAs:

| Objective | Value | Source (this runbook) |
|---|---|---|
| **RPO** | **≤ 24 hours** (worst case: up to 24h of data at risk) | Automated daily backup at 03:15 UTC (cron `15 3 * * *`, no continuous WAL archiving). A failure at 03:14 UTC loses ~24h of writes; a failure just after the backup loses minutes. The 03:45 UTC freshness check (`MAX_AGE_HOURS=26`) alerts on a broken chain within ~26h. |
| **RTO** | **≤ 4 hours** (database restore path) | Restore is script-driven: `restore-sqlite.sh` (CONFIRM gate → decrypt → integrity check → pre-restore copy → atomic replace → WAL drop → integrity check). The scratch drill (`verify-restore-scratch.sh`) measures the mechanical restore in milliseconds-to-seconds; the 4h budget covers stop-app → key retrieval → restore → restart → smoke-test with an on-call operator in the loop. |
| **RTO** | **~1 hour** (full host loss with fresh backup available) | Provision/reuse host → pull repo → recover `.env` + `BACKUP_ENCRYPTION_KEY` from the secret store → `./deploy.sh` bootstrap → `docker compose start deals` → restore latest `*.db.enc` → smoke-test. Assume 1h on-call + hardware provisioning variance. |

**What the objectives mean in practice:**
- Point-in-time recovery is **not available** (no WAL archiving) — restore always lands on the last daily 03:15 UTC snapshot.
- The deploy-time fail-closed freshness gate (`deploy.sh --update` → `backup_freshness_gate`) blocks deploys when the newest backup is > 26h old, so a deploy can never proceed over a stale backup chain.
- **First deploy on a fresh host** (bootstrap, not `--update`): the gate is exempt by design — no data to protect yet, no backup chain exists. The first `./deploy.sh --install-backup-cron` (with `BACKUP_ENCRYPTION_KEY` in the container env per the cron section below) establishes the chain; every `--update` after bootstrap is freshness-gated normally.
- Monthly restore drills (`verify-restore-scratch.sh`) are what keep the RTO honest — an untested restore path is an unmeasured RTO.

## Database location

| Environment | Typical `DATABASE_URL` | On-disk path |
|-------------|------------------------|--------------|
| Local dev | `file:./dev.db` | `prisma/dev.db` (relative to Prisma schema dir) |
| Docker / production | `file:/app/data/deals.db` | `/app/data/deals.db` inside the container; host volume `deals_data` |

Scripts resolve the path from `DATABASE_URL` when set, otherwise fall back to `/app/data/deals.db` (container) or `prisma/dev.db` (local).

## Production host layout (as of 2026-08-16)

On the production single host (Netcup/DO box), Deals and Enroller share the box.

- Live DB: Docker **named volume** `deals_data` (`deals_deals_data`). There is **no** `/opt/deals/data`.
- Backups: host `/var/backups/deals`. Cron copies from the volume `_data` file (`…/deals_deals_data/_data/deals.db`).
- F011 last-success **proven** ~2026-08-16T07:39:19Z: newest `/var/backups/deals/deals-20260816T011501Z.db`, age **6.405 h**, `PRAGMA integrity_check=ok`, explicit `MAX_AGE_HOURS=26` freshness exit 0. Cron present (2026-08-15). Restore **not** run.
- Host `LAST_SUCCESS` stamp files are **absent** (deployed scripts predate the local stamp patch). Proof is newest-file mtime + integrity + freshness.
- Host freshness script default is still **48 h** until new scripts deploy; the 26 h check above was explicit.
- Documented `deploy.sh --install-backup-cron` does **not** match this host (it would target in-volume `/app/data/backups` or missing `/opt/deals/data`). **Do not** run it blindly — leave the working `_data` → `/var/backups/deals` cron in place.

## Production host layout (as of 2026-09-17 — supersedes the 2026-08-16 note above)

- The pre-Sep-2026 root-run cron is gone (no madhu crontab, no root entries, no log when investigated 2026-09-17). Backups are now madhu-owned end to end.
- Live DB: Docker named volume `deals_deals_data`. madhu cannot read `/var/lib/docker/volumes/...` directly (root-owned — a host-side `sqlite3` against the `_data` file fails with "database not found"), so the backup runs INSIDE the container where `/app/data` is native.
- Cron (madhu, `crontab -l`): hybrid — 03:15 UTC `docker compose exec -T deals ... backup-sqlite.sh` (key from the container env, baked out of server `.env` at deploy time) → `/app/data/backups`, then `docker cp deals-app:/app/data/backups/. /var/backups/deals`, then a host-side `find ... -mtime +14 -delete` mirroring the script's retention (the script only sweeps its own `BACKUP_DIR`). 03:45 UTC freshness check on `/var/backups/deals` (`MAX_AGE_HOURS=26`). Both log to `/var/log/deals-backup.log` (madhu-owned) and echo alerts outside the redirect on failure.
- `/var/backups/deals` is `madhu:madhu` / 700 (repaired 2026-09-17; was root-owned residue). The deploy freshness gate watches this dir.
- Do NOT switch this host to `--install-backup-cron` auto-detect: it would install container-only entries writing where the gate doesn't look, re-creating the Sep-2026 deploy block.

## Prerequisites

- `sqlite3` CLI installed on the host or in the container
- App may stay running for **backup** (uses SQLite online `.backup`)
- Prefer **stopping or restarting** the app around **restore** so no writers race the file replace

## Backup

```bash
# Local (repo root)
export DATABASE_URL="file:./dev.db"
./scripts/backup-sqlite.sh

# Production (on server, from host against the Docker volume mount or exec)
docker compose exec deals sh -c 'DATABASE_URL=file:/app/data/deals.db /app/scripts/backup-sqlite.sh'
# If scripts are only on the host and the volume is bind-mounted:
# DATABASE_URL=file:/path/to/deals.db BACKUP_DIR=/var/backups/deals ./scripts/backup-sqlite.sh
```

What the script does:

1. Resolves the live DB path
2. **Fails closed without an encryption key** (F018): `BACKUP_ENCRYPTION_KEY`
   (openssl) or `BACKUP_AGE_KEYFILE` (age) must be set — the script refuses to
   write a plaintext backup and exits 1 before anything is written
3. Runs `sqlite3 ... .backup` into a `.db.plain.tmp` file under `BACKUP_DIR`
   (default: `/var/backups/deals` when writable — the same default
   `verify_backup_freshness.sh` watches; container fallback `/app/data/backups`,
   local dev `<repo>/backups`)
4. Runs `PRAGMA integrity_check` on the **tmp plaintext copy** (must return
   `ok`), encrypts it (`openssl enc -aes-256-cbc -pbkdf2 -salt -iter 100000`
   or `age`), **deletes the plaintext staging file**, round-trip-decrypts and
   re-checks integrity, then `mv` to the final `deals-*.db.enc` (or `*.db.age`)
5. Writes `LAST_SUCCESS` in the same `BACKUP_DIR` (ISO-8601 UTC + backup path)
   only after that `mv`
6. Deletes `*.db.enc` / `*.db.age` and legacy `*.db` backups older than
   **14 days** (`RETENTION_DAYS`)

Env overrides: `DATABASE_URL`, `BACKUP_DIR`, `RETENTION_DAYS`,
`BACKUP_ENCRYPTION_KEY` (**required**, openssl path),
`BACKUP_AGE_KEYFILE` (age path — wins when `age` + `age-keygen` are installed).

### Encryption key management (F018)

```bash
# Generate a key ONCE — store it in the password manager AND the server env
# (e.g. root crontab or /etc/deals/backup.env sourced by the cron entry).
# NEVER commit it; losing the key = losing every encrypted backup.
openssl rand -base64 32
```

- Backups are **encrypted at rest**: `openssl enc -aes-256-cbc -pbkdf2 -salt
  -iter 100000`
  keyed from `BACKUP_ENCRYPTION_KEY` (or `age -R <keyfile>` when installed).
- The backup script **fails closed**: unset key ⇒ exit 1, no plaintext written.
- The key is read from the environment (`-pass env:BACKUP_ENCRYPTION_KEY`); it
  is never written to disk by the scripts and never appears in logs.
- Rotation: generate a new key, re-encrypt existing backups
  (`openssl enc -d ... -iter 100000 -in old.enc -pass env:OLD | openssl enc -aes-256-cbc -pbkdf2 -salt -iter 100000 -pass env:NEW > new.enc`), verify, then retire the old key.
- `deploy.sh --update` runs a **fail-closed freshness gate** before
  `compose up`: a missing/stale (> `MAX_AGE_HOURS`, default 26h) newest backup
  aborts the deploy (F018 / critic C2).

### Automated cron (host, recommended)

`deploy.sh --install-backup-cron` installs both crontab entries idempotently
(re-runs replace, never duplicate) and auto-detects the deployment type from
`docker-compose.yml`. **Do not** run that installer blindly on the 2026-08-16
production host — see **Production host layout** above; the live cron already
backs up the named-volume `_data` file to `/var/backups/deals`.

**Bind-mount deployment** (`/app/data` on a host path) — plain host entries run
the scripts directly against `/opt/deals/data/deals.db` (override with
`BACKUP_DATABASE_URL=<host path>`; the install warns when the file is missing):

| Time (UTC) | Entry | Purpose |
|------------|-------|---------|
| 03:15 daily | `backup-sqlite.sh` → `BACKUP_DIR=/var/backups/deals` | integrity-checked backup, 14-day retention |
| 03:45 daily | `verify_backup_freshness.sh` → `BACKUP_DIR=/var/backups/deals MAX_AGE_HOURS=26` | fails (non-zero) if newest backup is > 26 h old |

**Named-volume deployment** (compose mounts `deals_data:/app/data`) — the live
DB is not reachable from the host, so the install switches to container
(`docker compose exec`) entries; both scripts run inside the `deals` container
against `/app/data` (DB + backups live in the named volume):

```cron
# Example: daily 03:15 UTC, retain 14 days (script default)
15 3 * * * cd /opt/deals && docker compose exec -T deals sh -c 'DATABASE_URL=file:/app/data/deals.db BACKUP_DIR=/app/data/backups /app/scripts/backup-sqlite.sh' >>/var/log/deals-backup.log 2>&1
45 3 * * * cd /opt/deals && docker compose exec -T deals sh -c 'BACKUP_DIR=/app/data/backups MAX_AGE_HOURS=26 /app/scripts/verify_backup_freshness.sh' >>/var/log/deals-backup.log 2>&1
```

Logs: `/var/log/deals-backup.log`. Alerting: on failure either entry echoes an
alert line OUTSIDE the log redirect, which cron mails to `MAILTO` (default:
crontab owner; override with `BACKUP_MAILTO=you@example.com` before re-running
the installer). Backups inside a named volume are not
directly accessible from the host — copy files out when needed
(`docker cp deals-app:/app/data/backups/<file> .`); the install output notes
this for the rclone offsite step. Prefer a bind mount of `/app/data` to a host
path (e.g. `/opt/deals/data`) when you want host-side access to the DB and
backups. Setting `BACKUP_DATABASE_URL` forces the host variant — only correct
if that path is a real host file (the install warns on a named-volume
mismatch). See also the comment block in `docker-compose.yml`.

**F018 encryption key in the cron environment (required):** the backup script
fails closed without a key, so the key must be present wherever the cron runs:

- **Container (exec) entries**: add `BACKUP_ENCRYPTION_KEY=...` to the server
  `.env` — `env_file` bakes it into the container environment, and
  `docker compose exec` inherits it. Never put the key in the crontab line
  itself (crontabs are world-­readable in some setups; prefer the container env).
- **Host entries**: put the key in a `chmod 600` env file (e.g.
  `/etc/deals/backup.env`) and prefix the crontab entry with
  `. /etc/deals/backup.env &&` — do NOT inline the key in the crontab.

The freshness cron (`verify_backup_freshness.sh`) needs **no key** — it only
stats file mtimes of the published `.db.enc` / `.db.age` / `.db` files.

## Restore

1. **Stop writers**: `docker compose stop deals` (or full stack stop). Do **not**
   restore while the app is writing to the DB.
2. Pick a backup file that already passed integrity (backups are named
   `deals-YYYYMMDDThhmmssZ.db.enc` — or `.db.age` on age hosts; legacy
   pre-F018 files are `deals-*.db` plaintext).
3. Run with **explicit confirmation** (`CONFIRM=YES` is required):

```bash
export DATABASE_URL="file:/app/data/deals.db"   # or file:./dev.db locally
# Encrypted backup (F018) — the key is REQUIRED (fail-closed):
export BACKUP_ENCRYPTION_KEY="REPLACE_WITH_GENERATED_KEY"
CONFIRM=YES ./scripts/restore-sqlite.sh /path/to/deals-20260809T031500Z.db.enc

# Legacy plaintext backup (pre-F018) — restores directly, no key needed:
CONFIRM=YES ./scripts/restore-sqlite.sh /path/to/deals-20260809T031500Z.db
```

The script decrypts `.enc`/`.age` inputs to a temp scratch file, integrity-checks
it, restores, and deletes the scratch copy on any exit path (trap) — plaintext
never rests outside the restore window.

Optional: set `RESTORE_APP_MARKER=/path/to/marker` and create that file while the
app runs; the script **refuses** restore until the marker is removed (after stop).

4. The script:
    - refuses without `CONFIRM=YES`
    - refuses if `RESTORE_APP_MARKER` path exists
    - refuses `.enc`/`.age` inputs without the matching key (F018 fail-closed)
    - decrypts to a scratch file (encrypted inputs) and integrity-checks it
    - copies the current live DB to `*.pre-restore.<timestamp>` when present
    - atomically replaces the live file
    - removes `-wal` / `-shm` sidecars **only after** the confirmed replace
    - integrity-checks the restored live file
5. **Start the app**: `docker compose start deals` (or `up -d`).
6. Smoke-test: home page, admin login, a deal detail URL.

## Migrate-fail runbook (bad deploy / bad migration)

`prisma migrate deploy` is the **only** migration path that ever touches the
production DB (docker/entrypoint.sh, up-only contract). If a deploy ships a
bad migration or the new image is broken after `migrate deploy` ran:

1. **Stop** the app so no writers race the fix:
   ```bash
   cd /opt/deals && docker compose stop deals
   ```
2. **Verify the backup chain is fresh** — the restore must come from a
   freshness-gated encrypted backup (deploy's own gate standard,
   `MAX_AGE_HOURS=26`):
   ```bash
   BACKUP_DIR=/var/backups/deals MAX_AGE_HOURS=26 ./scripts/verify_backup_freshness.sh
   # named-volume deployment: docker compose start deals first is NOT needed;
   # run the same script inside the container:
   #   docker compose exec -T deals sh -c 'BACKUP_DIR=/app/data/backups ./scripts/verify_backup_freshness.sh'
   ```
   If this fails, **stop**: restore the chain first (manual encrypted backup
   with `BACKUP_ENCRYPTION_KEY` set) — never restore from an ungated backup.
3. **Restore** the newest fresh encrypted backup (freshness-gated + integrity
   re-verified by the restore script itself):
   ```bash
   export BACKUP_ENCRYPTION_KEY="REPLACE_WITH_GENERATED_KEY"
   CONFIRM=YES DATABASE_URL="file:/app/data/deals.db" \
     ./scripts/restore-sqlite.sh /var/backups/deals/deals-<stamp>.db.enc
   ```
   (Named-volume deployment: `docker cp` the `.enc` out of `/app/data/backups`
   first, or run the restore inside the container.)
4. **Revert the image** to the last known-good one — the DB is now back at the
   pre-deploy state, so the old image's schema expectations match:
   ```bash
   cd /opt/deals
   git checkout <last-good-commit>        # or: git reset --hard origin/main@{1}
   ./deploy.sh --update                   # rebuild + recreate from last good source
   # If the bad commit is already on origin/main and must be reverted there,
   # revert the commit on GitHub first; never `migrate dev` on the server DB.
   ```
5. **Redeploy** and smoke-test (home page, admin login, deal detail). The
   freshness gate runs automatically as part of `--update` (fail-closed).
6. **Prove the restore path** (monthly cadence, or after any real restore):
   ```bash
   bash scripts/verify-restore-scratch.sh   # end-to-end encrypted drill, RTO logged
   ```

Key rule: **rollback = image revert + encrypted backup restore** — never
`prisma migrate dev` against production (it can reset the DB on drift) and
never a hand-written down-migration.

## Verify a backup without restoring

```bash
# Encrypted backup (F018) — decrypt to stdout and pipe into sqlite3:
BACKUP_ENCRYPTION_KEY="REPLACE_WITH_GENERATED_KEY" openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in /path/to/deals-....db.enc -pass env:BACKUP_ENCRYPTION_KEY \
  | sqlite3 :memory: "PRAGMA integrity_check; SELECT COUNT(*) FROM deals;"
# expect: ok / non-zero count

# Legacy plaintext backup:
sqlite3 /path/to/backup.db "PRAGMA integrity_check;"
# expect: ok
sqlite3 /path/to/backup.db "SELECT COUNT(*) FROM deals;"
```

## Offsite backups (rclone / S3)

On-site backups (`/var/backups/deals`) survive disk failure only if the disk
survives — copy them off the server daily. `rclone` example (S3-compatible):

```bash
# One-time setup (as the deploy user)
rclone config          # name the remote "deals-backup", provider "S3" (or B2/Drive)

# Daily offsite copy — add to crontab (deploy.sh --install-backup-cron prints this)
30 3 * * * rclone copy /var/backups/deals deals-backup:deals --log-file=/var/log/rclone-deals.log 2>&1
#     ^ 03:30 UTC = 15 min after the 03:15 backup, so the freshest copy is included
```

Verify the offsite copy exists and is fresh monthly (owner-ops):

```bash
rclone lsl deals-backup:deals | sort -r | head -3
```

## Restore drill (monthly, owner-ops)

Restoring is the only way to prove backups are restorable. The drill follows
the exact `restore-sqlite.sh` protocol: **CONFIRM=YES** (refuses without it),
optional **RESTORE_APP_MARKER** (create while the app runs; the script refuses
until the marker is removed after stop), and a **pre-restore copy** of the
live DB (`*.pre-restore.<timestamp>`) kept before the atomic replace — so a
failed drill can always roll back.

### Local drill (gate G — automated & manual scratch drill)

There is **no DB copy in the repo**: `data/` is empty and `prisma/dev.db` is
dev-only (never committed).

#### 1. Automated Scratch Drill (Recommended)

`scripts/verify-restore-scratch.sh` provides an end-to-end automated disaster recovery drill:
- Deploys Prisma migrations onto an ephemeral scratch SQLite DB.
- Enables WAL mode and spawns a background concurrent writer inserting canary rows.
- Generates an ephemeral throwaway key and executes `scripts/backup-sqlite.sh` **encrypted** (proves the F018 fail-closed encrypt + round-trip verify path; `sqlite3` CLI fallback if absent).
- Restores via `scripts/restore-sqlite.sh`, measures and logs RTO, and verifies canary row data.
- Simulates target DB and dirty WAL corruption and verifies clean destructive restore.
- Deterministically cleans up scratch directories on exit.

```bash
bash scripts/verify-restore-scratch.sh
```

#### 2. Manual Scratch Drill (Fallback)

```bash
# Scratch DB (never dev.db)
mkdir -p /tmp/restore-drill && cd /tmp/restore-drill
DATABASE_URL="file:/tmp/restore-drill/drill.db" pnpm exec prisma migrate deploy
DATABASE_URL="file:/tmp/restore-drill/drill.db" pnpm seed

# Backup the scratch DB, then restore it over a second scratch target
# (F018: backups are encrypted — the scratch drill needs a throwaway key)
export BACKUP_ENCRYPTION_KEY="$(openssl rand -base64 32)"
DATABASE_URL="file:/tmp/restore-drill/drill.db" BACKUP_DIR=/tmp/restore-drill ./scripts/backup-sqlite.sh
LATEST="$(ls -t /tmp/restore-drill/deals-*.db.enc /tmp/restore-drill/deals-*.db.age /tmp/restore-drill/deals-*.db 2>/dev/null | head -1)"
CONFIRM=YES DATABASE_URL="file:/tmp/restore-drill/restored.db" ./scripts/restore-sqlite.sh "${LATEST}"
sqlite3 /tmp/restore-drill/restored.db "SELECT COUNT(*) FROM deals;"   # expect non-zero, matches drill.db
rm -rf /tmp/restore-drill                        # drill DBs are scratch
```

Gate G = the drill above completes with `integrity_check=ok` and a non-zero
deal count. It is a **restore-path proof**, not a production-data proof.


### Host drill (owner-ops — production data)

Monthly, on the production host, against a real backup (no downtime, scratch
target):

```bash
mkdir -p /tmp/restore-drill && cd /tmp/restore-drill
# Encrypted production backups (F018) — restore with the real key; the scratch
# target never touches the live DB. Legacy plaintext backups restore directly.
LATEST="$(ls -t /var/backups/deals/*.db.enc /var/backups/deals/*.db.age /var/backups/deals/*.db 2>/dev/null | head -1)"
BACKUP_ENCRYPTION_KEY="REPLACE_WITH_GENERATED_KEY" \
  CONFIRM=YES DATABASE_URL="file:./drill.db" /opt/deals/scripts/restore-sqlite.sh "${LATEST}"
sqlite3 drill.db "SELECT COUNT(*) FROM deals;"   # expect non-zero, matches prod count
rm -rf /tmp/restore-drill                        # drill DB is scratch
```

Track drills in this table (append a row each month — a drill is not done
until it is recorded). **Log fields: date (UTC), backup file restored, deal
count, restore OK?, and RTO** (restore time objective — wall-clock minutes
from starting the restore to `integrity_check=ok`):

| Date (UTC) | Backup file restored | `SELECT COUNT(*) FROM deals` | Restore OK? | RTO (min) |
|------------|----------------------|------------------------------|-------------|-----------|
| 2026-08-01 | `deals-20260801T031500Z.db` | 9 | yes | 1 |
|            |                      |                              |             |           |

## Failure modes

| Symptom | Action |
|---------|--------|
| `sqlite3: command not found` | Install `sqlite3` on host/image |
| `database not found` | Export correct `DATABASE_URL` or pass a path that exists |
| `integrity_check failed` on backup | Discard that file; restore an older good backup |
| App errors after restore | Restart container; if still broken, restore the `*.pre-restore.*` copy |

## Security notes

- Backups may contain submitter emails and admin-related data — treat as **confidential**
- **Backups are encrypted at rest** (F018): `*.db.enc` (openssl AES-256-CBC +
  PBKDF2) or `*.db.age`; the backup script fails closed without
  `BACKUP_ENCRYPTION_KEY` / `BACKUP_AGE_KEYFILE` — a plaintext backup is never
  produced. Legacy `deals-*.db` files (pre-F018) on the 2026-08 host are
  retained by the 14-day retention sweep only; pull-and-re-encrypt or delete
  them on sight during the next host drill.
- Do not commit `backups/`, `*.db`, `*.db.enc`, `*.db.age`, or `*.pre-restore.*` to git
- Restrict filesystem permissions on `BACKUP_DIR` (e.g. `chmod 700`)
