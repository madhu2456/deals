#!/usr/bin/env bash
#
# restore-sqlite.sh — restore a SQLite backup produced by backup-sqlite.sh.
#
# Usage:
#   CONFIRM=YES scripts/restore-sqlite.sh /path/to/deals-20260809T120000Z.db
#   CONFIRM=YES DATABASE_URL=file:/app/data/deals.db scripts/restore-sqlite.sh ./backups/deals-....db
#
# Safety (critic C3):
#   - CONFIRM=YES is required (refuse otherwise)
#   - Stop the app first (docker compose stop deals); optional RESTORE_APP_MARKER
#     file, if present, causes refuse-until-removed
#   - Pre-restore copy of live DB is kept; WAL/SHM removed only after replace
#
# Steps: CONFIRM → integrity_check → pre-restore copy → atomic replace → drop WAL → integrity_check.
# Exit: 0 success, 1 failure, 2 usage.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ "${1:-}" == "" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "usage: CONFIRM=YES $0 <backup.db>" >&2
  echo "  Restores the given backup over the live DATABASE_URL path." >&2
  echo "  Stop the app first (e.g. docker compose stop deals)." >&2
  echo "  Set CONFIRM=YES to acknowledge a destructive restore." >&2
  exit 2
fi

if [[ "${CONFIRM:-}" != "YES" ]]; then
  echo "error: refusing restore without CONFIRM=YES" >&2
  echo "hint: stop the app first, then: CONFIRM=YES $0 <backup.db>" >&2
  exit 2
fi

# Optional: refuse while an operator/app marker indicates writers are still live.
# Create the marker while the app runs; remove it after stop, before restore.
if [[ -n "${RESTORE_APP_MARKER:-}" && -e "${RESTORE_APP_MARKER}" ]]; then
  echo "error: app marker present (${RESTORE_APP_MARKER}) — stop the app and remove the marker before restore" >&2
  exit 1
fi

BACKUP_SRC="$1"
if [[ ! -f "${BACKUP_SRC}" ]]; then
  echo "error: backup file not found: ${BACKUP_SRC}" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "error: sqlite3 CLI is required" >&2
  exit 1
fi

resolve_db_path() {
  local url="${DATABASE_URL:-}"
  local path=""

  if [[ -n "${url}" ]]; then
    path="${url#file:}"
    if [[ "${path}" == ./* || "${path}" == ../* || ( "${path}" != /* && "${path}" != "" ) ]]; then
      if [[ -f "${ROOT}/prisma/${path#./}" ]] || [[ "${path}" == ./dev.db || "${path}" == "dev.db" ]]; then
        path="${ROOT}/prisma/${path#./}"
      elif [[ -d "$(dirname "${ROOT}/${path}")" ]]; then
        path="${ROOT}/${path}"
      fi
    fi
  fi

  if [[ -z "${path}" ]]; then
    if [[ -d "/app/data" ]]; then
      path="/app/data/deals.db"
    else
      path="${ROOT}/prisma/dev.db"
    fi
  fi

  printf '%s' "${path}"
}

DB_PATH="$(resolve_db_path)"
DB_DIR="$(dirname "${DB_PATH}")"
mkdir -p "${DB_DIR}"

echo "[restore] source=${BACKUP_SRC}"
echo "[restore] target=${DB_PATH}"

CHECK="$(sqlite3 "${BACKUP_SRC}" "PRAGMA integrity_check;")"
if [[ "${CHECK}" != "ok" ]]; then
  echo "error: integrity_check failed on backup (refusing restore): ${CHECK}" >&2
  exit 1
fi

# Atomic-ish replace: copy to temp beside target, then mv
TMP="${DB_PATH}.restore.$$"
cp -f "${BACKUP_SRC}" "${TMP}"
# Re-check the staged copy
CHECK2="$(sqlite3 "${TMP}" "PRAGMA integrity_check;")"
if [[ "${CHECK2}" != "ok" ]]; then
  echo "error: integrity_check failed on staged copy: ${CHECK2}" >&2
  rm -f "${TMP}"
  exit 1
fi

# Preserve previous live DB for emergency rollback (before any replace / WAL drop)
if [[ -f "${DB_PATH}" ]]; then
  ROLLBACK="${DB_PATH}.pre-restore.$(date -u +%Y%m%dT%H%M%SZ)"
  cp -f "${DB_PATH}" "${ROLLBACK}"
  echo "[restore] previous live DB copied to ${ROLLBACK}"
fi

# Confirmed restore: replace main file first, only then drop WAL/SHM so a
# failed pre-step never leaves the live DB without its journal.
mv -f "${TMP}" "${DB_PATH}"

# Remove leftover WAL/SHM so the restored main DB is authoritative
# (only after the confirmed main-file replace above).
rm -f "${DB_PATH}-wal" "${DB_PATH}-shm" 2>/dev/null || true

FINAL="$(sqlite3 "${DB_PATH}" "PRAGMA integrity_check;")"
if [[ "${FINAL}" != "ok" ]]; then
  echo "error: post-restore integrity_check failed: ${FINAL}" >&2
  exit 1
fi

echo "[restore] integrity_check=ok"
echo "[restore] done — restart the app (e.g. docker compose start deals)."
