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
# Writes to *.db.tmp, PRAGMA integrity_check, then mv to the final *.db.
# LAST_SUCCESS (ISO-8601 UTC + backup path) is written only after that mv.
# A failed check or killed write never leaves a partial final *.db.
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
TMP_FILE="${BACKUP_FILE}.tmp"

echo "[backup] source=${DB_PATH}"
echo "[backup] dest=${BACKUP_FILE}"

# Online consistent backup (holds a brief read lock). Stage in .tmp so a
# killed write never publishes a partial final *.db with a fresh mtime.
if ! sqlite3 "${DB_PATH}" ".backup '${TMP_FILE}'"; then
  rm -f -- "${TMP_FILE}"
  echo "error: sqlite backup failed" >&2
  exit 1
fi

# Integrity check on the tmp copy (never modify live DB for verification)
CHECK="$(sqlite3 "${TMP_FILE}" "PRAGMA integrity_check;")"
if [[ "${CHECK}" != "ok" ]]; then
  echo "error: integrity_check failed on backup: ${CHECK}" >&2
  rm -f -- "${TMP_FILE}"
  exit 1
fi

mv -f -- "${TMP_FILE}" "${BACKUP_FILE}"

# Optional size sanity (empty DB is still valid but worth noting)
SIZE="$(wc -c <"${BACKUP_FILE}" | tr -d ' ')"
echo "[backup] integrity_check=ok size_bytes=${SIZE}"

# LAST_SUCCESS only after integrity_check=ok and the final *.db is in place.
{
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${BACKUP_FILE}"
} >"${DEST}/LAST_SUCCESS.tmp"
mv -f -- "${DEST}/LAST_SUCCESS.tmp" "${DEST}/LAST_SUCCESS"
echo "[backup] last_success=${DEST}/LAST_SUCCESS"

# Retention: delete backups older than RETENTION_DAYS (final *.db only)
find "${DEST}" -maxdepth 1 -type f -name "${BASE}-*.db" -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null || true

echo "[backup] done (retention=${RETENTION_DAYS}d)"
