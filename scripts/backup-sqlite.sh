#!/usr/bin/env bash
#
# backup-sqlite.sh — online SQLite backup via sqlite3 .backup, integrity_check,
# and 14-day retention.
#
# Usage:
#   scripts/backup-sqlite.sh
#   DATABASE_URL=file:/app/data/deals.db BACKUP_DIR=/var/backups/deals scripts/backup-sqlite.sh
#
# Env:
#   DATABASE_URL  — Prisma-style URL (file:./dev.db or file:/app/data/deals.db)
#   BACKUP_DIR    — destination directory (default: /var/backups/deals when
#                   writable — matches verify_backup_freshness.sh; container
#                   fallback /app/data/backups; local dev <repo>/backups)
#   RETENTION_DAYS — days to keep (default: 14)
#
# Exit: 0 success, 1 failure.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

RETENTION_DAYS="${RETENTION_DAYS:-14}"

resolve_db_path() {
  local url="${DATABASE_URL:-}"
  local path=""

  if [[ -n "${url}" ]]; then
    # Strip file: prefix (Prisma: file:./dev.db | file:/abs/path)
    path="${url#file:}"
    # Relative paths in Prisma schema are usually relative to prisma/
    if [[ "${path}" == ./* || "${path}" == ../* || ( "${path}" != /* && "${path}" != "" ) ]]; then
      if [[ -f "${ROOT}/prisma/${path#./}" ]]; then
        path="${ROOT}/prisma/${path#./}"
      elif [[ -f "${ROOT}/${path}" ]]; then
        path="${ROOT}/${path}"
      elif [[ -f "${path}" ]]; then
        path="$(cd "$(dirname "${path}")" && pwd)/$(basename "${path}")"
      fi
    fi
  fi

  # Production Docker volume default
  if [[ -z "${path}" || ! -f "${path}" ]]; then
    if [[ -f "/app/data/deals.db" ]]; then
      path="/app/data/deals.db"
    elif [[ -f "${ROOT}/prisma/dev.db" ]]; then
      path="${ROOT}/prisma/dev.db"
    elif [[ -f "${ROOT}/data/deals.db" ]]; then
      path="${ROOT}/data/deals.db"
    fi
  fi

  if [[ -z "${path}" || ! -f "${path}" ]]; then
    echo "error: SQLite database not found. Set DATABASE_URL (file:...) or place deals.db under /app/data or prisma/dev.db" >&2
    exit 1
  fi

  printf '%s' "${path}"
}

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "error: sqlite3 CLI is required" >&2
  exit 1
fi

DB_PATH="$(resolve_db_path)"

# Default must align with scripts/verify_backup_freshness.sh (F-DEAL-013):
# the host cron convention is /var/backups/deals, so a daily backup + daily
# freshness check watch the SAME directory. Only used when present+writable
# (host runs); containers fall back to /app/data/backups, local dev to
# <repo>/backups. Cron installs always pass BACKUP_DIR explicitly
# (deploy.sh --install-backup-cron).
if [[ -n "${BACKUP_DIR:-}" ]]; then
  DEST="${BACKUP_DIR}"
elif [[ -d "/var/backups/deals" && -w "/var/backups/deals" ]]; then
  DEST="/var/backups/deals"
elif [[ -d "/app/data" ]]; then
  DEST="/app/data/backups"
else
  DEST="${ROOT}/backups"
fi

mkdir -p "${DEST}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="$(basename "${DB_PATH}" .db)"
BACKUP_FILE="${DEST}/${BASE}-${STAMP}.db"

echo "[backup] source=${DB_PATH}"
echo "[backup] dest=${BACKUP_FILE}"

# Online consistent backup (holds a brief read lock)
sqlite3 "${DB_PATH}" ".backup '${BACKUP_FILE}'"

# Integrity check on the backup copy (never modify live DB for verification)
CHECK="$(sqlite3 "${BACKUP_FILE}" "PRAGMA integrity_check;")"
if [[ "${CHECK}" != "ok" ]]; then
  echo "error: integrity_check failed on backup: ${CHECK}" >&2
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# Optional size sanity (empty DB is still valid but worth noting)
SIZE="$(wc -c <"${BACKUP_FILE}" | tr -d ' ')"
echo "[backup] integrity_check=ok size_bytes=${SIZE}"

# Retention: delete backups older than RETENTION_DAYS
find "${DEST}" -type f -name "${BASE}-*.db" -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null || true

echo "[backup] done (retention=${RETENTION_DAYS}d)"
