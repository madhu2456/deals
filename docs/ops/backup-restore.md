# SQLite backup & restore (deals.madhudadi.in)

Operational runbook for the Deals app database.

## Database location

| Environment | Typical `DATABASE_URL` | On-disk path |
|-------------|------------------------|--------------|
| Local dev | `file:./dev.db` | `prisma/dev.db` (relative to Prisma schema dir) |
| Docker / production | `file:/app/data/deals.db` | `/app/data/deals.db` inside the container; host volume `deals_data` |

Scripts resolve the path from `DATABASE_URL` when set, otherwise fall back to `/app/data/deals.db` (container) or `prisma/dev.db` (local).

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
2. Runs `sqlite3 … .backup` into `BACKUP_DIR` (default `./backups` or `/app/data/backups`)
3. Runs `PRAGMA integrity_check` on the **backup file** (must return `ok`)
4. Deletes `*-YYYYMMDD….db` backups older than **14 days** (`RETENTION_DAYS`)

Env overrides: `DATABASE_URL`, `BACKUP_DIR`, `RETENTION_DAYS`.

### Suggested cron (host)

Optional daily backup — add after deploy if the data volume is reachable from the host:

```cron
# Example: daily 03:15 UTC, retain 14 days (script default)
15 3 * * * cd /opt/deals && DATABASE_URL=file:/opt/deals/data/deals.db BACKUP_DIR=/opt/deals/backups ./scripts/backup-sqlite.sh >>/var/log/deals-backup.log 2>&1
```

If the DB lives only in a named Docker volume, either:

- `docker compose exec deals … backup-sqlite.sh` from cron, or  
- bind-mount `/app/data` to a host path and point `DATABASE_URL` / `BACKUP_DIR` at that path.

See also the comment block in `docker-compose.yml`.

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
