# SQLite backup & restore (deals.madhudadi.in)

Operational runbook for the Deals app database.

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
2. Runs `sqlite3 … .backup` into a `.tmp` file under `BACKUP_DIR` (default:
   `/var/backups/deals` when writable — the same default
   `verify_backup_freshness.sh` watches; container fallback `/app/data/backups`,
   local dev `<repo>/backups`)
3. Runs `PRAGMA integrity_check` on the **tmp copy** (must return `ok`), then
   `mv` to the final `deals-*.db` (a killed write never leaves a partial final `*.db`)
4. Writes `LAST_SUCCESS` in the same `BACKUP_DIR` (ISO-8601 UTC + backup path)
   only after that `mv`
5. Deletes `*-YYYYMMDD….db` backups older than **14 days** (`RETENTION_DAYS`)

Env overrides: `DATABASE_URL`, `BACKUP_DIR`, `RETENTION_DAYS`.

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

Logs: `/var/log/deals-backup.log`. Backups inside a named volume are not
directly accessible from the host — copy files out when needed
(`docker cp deals-app:/app/data/backups/<file> .`); the install output notes
this for the rclone offsite step. Prefer a bind mount of `/app/data` to a host
path (e.g. `/opt/deals/data`) when you want host-side access to the DB and
backups. Setting `BACKUP_DATABASE_URL` forces the host variant — only correct
if that path is a real host file (the install warns on a named-volume
mismatch). See also the comment block in `docker-compose.yml`.

## Restore

1. **Stop writers**: `docker compose stop deals` (or full stack stop). Do **not**
   restore while the app is writing to the DB.
2. Pick a backup file that already passed integrity (backups are named `deals-YYYYMMDDThhmmssZ.db`).
3. Run with **explicit confirmation** (`CONFIRM=YES` is required):

```bash
export DATABASE_URL="file:/app/data/deals.db"   # or file:./dev.db locally
CONFIRM=YES ./scripts/restore-sqlite.sh /path/to/deals-20260809T031500Z.db
```

Optional: set `RESTORE_APP_MARKER=/path/to/marker` and create that file while the
app runs; the script **refuses** restore until the marker is removed (after stop).

4. The script:
   - refuses without `CONFIRM=YES`
   - refuses if `RESTORE_APP_MARKER` path exists
   - integrity-checks the backup
   - copies the current live DB to `*.pre-restore.<timestamp>` when present
   - atomically replaces the live file
   - removes `-wal` / `-shm` sidecars **only after** the confirmed replace
   - integrity-checks the restored live file
5. **Start the app**: `docker compose start deals` (or `up -d`).
6. Smoke-test: home page, admin login, a deal detail URL.

## Verify a backup without restoring

```bash
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

### Local drill (gate G — runs in CI/dev, no DB copy in repo)

There is **no DB copy in the repo**: `data/` is empty and `prisma/dev.db` is
dev-only (never committed). The local drill therefore builds a scratch DB from
the schema + seed, backs it up, and restores it — proving the full
backup→restore path without touching `dev.db`:

```bash
# Scratch DB (never dev.db)
mkdir -p /tmp/restore-drill && cd /tmp/restore-drill
DATABASE_URL="file:/tmp/restore-drill/drill.db" pnpm exec prisma migrate deploy
DATABASE_URL="file:/tmp/restore-drill/drill.db" pnpm seed

# Backup the scratch DB, then restore it over a second scratch target
DATABASE_URL="file:/tmp/restore-drill/drill.db" BACKUP_DIR=/tmp/restore-drill ./scripts/backup-sqlite.sh
LATEST="$(ls -t /tmp/restore-drill/deals-*.db | head -1)"
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
LATEST="$(ls -t /var/backups/deals/*.db | head -1)"
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
- Do not commit `backups/`, `*.db`, or `*.pre-restore.*` to git
- Restrict filesystem permissions on `BACKUP_DIR` (e.g. `chmod 700`)
