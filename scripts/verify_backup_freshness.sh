#!/usr/bin/env bash
# F011: fail if newest SQLite backup is older than MAX_AGE_HOURS (default 48).
# awk/date only — no python3 dependency (the node:22-bookworm-slim runner
# image ships none, and this script runs inside the container for
# named-volume deploys; see deploy.sh --install-backup-cron).
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
now=$(date +%s)
age_h=$(awk -v now="$now" -v t="$ts" 'BEGIN { printf "%.3f", (now - t) / 3600 }')
echo "Newest: $path age_h=$age_h (max $MAX_AGE_HOURS)"
awk -v a="$age_h" -v m="$MAX_AGE_HOURS" 'BEGIN { exit (a <= m ? 0 : 1) }'
