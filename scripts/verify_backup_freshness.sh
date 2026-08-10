#!/usr/bin/env bash
# F011: fail if newest SQLite backup is older than MAX_AGE_HOURS (default 48).
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-/var/backups/deals}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-48}"
BACKUP_GLOB="${BACKUP_GLOB:-*.db*}"
if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "FAIL: backup dir missing: $BACKUP_DIR" >&2
  exit 2
fi
newest=$(find "$BACKUP_DIR" -type f -name "$BACKUP_GLOB" -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 || true)
if [[ -z "${newest:-}" ]]; then
  echo "FAIL: no backups matching $BACKUP_GLOB in $BACKUP_DIR" >&2
  exit 1
fi
ts=${newest%% *}
path=${newest#* }
age_h=$(python3 -c "import time; print((time.time()-float('$ts'))/3600)")
echo "Newest: $path age_h=$age_h (max $MAX_AGE_HOURS)"
python3 -c "import sys; sys.exit(0 if float('$age_h') <= float('$MAX_AGE_HOURS') else 1)"
