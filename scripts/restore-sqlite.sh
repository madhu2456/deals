#!/usr/bin/env bash
#
# restore-sqlite.sh — restore a SQLite backup produced by backup-sqlite.sh.
#
# Usage:
#   CONFIRM=YES scripts/restore-sqlite.sh /path/to/deals-20260809T120000Z.db
#   CONFIRM=YES DATABASE_URL=file:/app/data/deals.db scripts/restore-sqlite.sh ./backups/deals-....db
#   CONFIRM=YES BACKUP_ENCRYPTION_KEY=... scripts/restore-sqlite.sh ./backups/deals-....db.enc
#
# Encrypted backups (F018): *.db.enc requires BACKUP_ENCRYPTION_KEY (openssl),
# *.db.age requires BACKUP_AGE_KEYFILE (age) — fail-closed without the key.
# Legacy plaintext *.db backups still restore directly.
#
# Safety (critic C3):
#   - CONFIRM=YES is required (refuse otherwise)
#   - Stop the app first (docker compose stop deals); optional RESTORE_APP_MARKER
#     file, if present, causes refuse-until-removed
#   - Pre-restore copy of live DB is kept; WAL/SHM removed only after replace
#
# Steps: CONFIRM → (decrypt if encrypted) → integrity_check → pre-restore copy
#        → atomic replace → drop WAL → integrity_check.
# Exit: 0 success, 1 failure, 2 usage.
set -euo pipefail

# F018: guarantee the decrypted scratch copy is removed on ANY exit (success,
# failure, signal) — plaintext never rests outside the restore window.
DECRYPT_TMP=""
cleanup_scratch() {
  if [[ -n "${DECRYPT_TMP:-}" && -f "${DECRYPT_TMP}" ]]; then
    rm -f -- "${DECRYPT_TMP}"
  fi
}
trap cleanup_scratch EXIT INT TERM

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

# --- F018: symmetric decrypt for encrypted backups (fail-closed) -----------
# Decrypt to a scratch file under the system temp dir, integrity-check it,
# then restore from the scratch copy; the decrypted plaintext lives only for
# the duration of this restore and is deleted on both success and failure.
RESTORE_SRC="${BACKUP_SRC}"
if [[ "${BACKUP_SRC}" == *.db.enc ]]; then
  if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
    echo "error: ${BACKUP_SRC} is encrypted — BACKUP_ENCRYPTION_KEY is not set (F018 fail-closed)" >&2
    echo "hint: restore the key from the password manager, then re-run with BACKUP_ENCRYPTION_KEY=<key>" >&2
    exit 1
  fi
  DECRYPT_TMP="$(mktemp "${TMPDIR:-/tmp}/deals-restore-decrypted-XXXXXX.db")"
  # -pass env: reads the process environment, not the shell variable — make a
  # locally-assigned (unexported) key work too.
  export BACKUP_ENCRYPTION_KEY
  if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in "${BACKUP_SRC}" -out "${DECRYPT_TMP}" -pass env:BACKUP_ENCRYPTION_KEY; then
    echo "error: openssl decrypt failed (wrong key or corrupt backup?) — refusing restore" >&2
    rm -f -- "${DECRYPT_TMP}"
    exit 1
  fi
  RESTORE_SRC="${DECRYPT_TMP}"
  echo "[restore] decrypted ${BACKUP_SRC##*/} to scratch ${DECRYPT_TMP}"
elif [[ "${BACKUP_SRC}" == *.db.age ]]; then
  if [[ -z "${BACKUP_AGE_KEYFILE:-}" ]]; then
    echo "error: ${BACKUP_SRC} is age-encrypted — BACKUP_AGE_KEYFILE is not set (F018 fail-closed)" >&2
    exit 1
  fi
  if [[ ! -f "${BACKUP_AGE_KEYFILE}" ]]; then
    echo "error: BACKUP_AGE_KEYFILE not found: ${BACKUP_AGE_KEYFILE} (F018 fail-closed)" >&2
    exit 1
  fi
  DECRYPT_TMP="$(mktemp "${TMPDIR:-/tmp}/deals-restore-decrypted-XXXXXX.db")"
  if ! age -d -i "${BACKUP_AGE_KEYFILE}" -o "${DECRYPT_TMP}" "${BACKUP_SRC}"; then
    echo "error: age decrypt failed (wrong keyfile or corrupt backup?) — refusing restore" >&2
    rm -f -- "${DECRYPT_TMP}"
    exit 1
  fi
  RESTORE_SRC="${DECRYPT_TMP}"
  echo "[restore] decrypted ${BACKUP_SRC##*/} to scratch ${DECRYPT_TMP}"
fi

sqlite_integrity() {
  local db="$1"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${db}" "PRAGMA integrity_check;"
  elif command -v python3 >/dev/null 2>&1; then
    python3 - "${db}" <<'PY'
import sqlite3, sys
conn = sqlite3.connect(sys.argv[1])
try:
    print(conn.execute("PRAGMA integrity_check;").fetchone()[0])
finally:
    conn.close()
PY
  else
    echo "error: sqlite3 CLI or python3 is required" >&2
    exit 1
  fi
}

if ! command -v sqlite3 >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
  echo "error: sqlite3 CLI or python3 is required" >&2
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

CHECK="$(sqlite_integrity "${RESTORE_SRC}")"
if [[ "${CHECK}" != "ok" ]]; then
  echo "error: integrity_check failed on backup (refusing restore): ${CHECK}" >&2
  exit 1
fi

# Atomic-ish replace: copy to temp beside target, then mv
TMP="${DB_PATH}.restore.$$"
cp -f "${RESTORE_SRC}" "${TMP}"
# Re-check the staged copy
CHECK2="$(sqlite_integrity "${TMP}")"
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

FINAL="$(sqlite_integrity "${DB_PATH}")"
if [[ "${FINAL}" != "ok" ]]; then
  echo "error: post-restore integrity_check failed: ${FINAL}" >&2
  exit 1
fi

echo "[restore] integrity_check=ok"
# F018: scratch decrypted copy (if any) is removed only after the restore
# succeeded — a failed restore above exits set -e before this line, but the
# trap below still guarantees cleanup on any exit path.
if [[ -n "${DECRYPT_TMP:-}" && -f "${DECRYPT_TMP}" ]]; then
  rm -f -- "${DECRYPT_TMP}"
  echo "[restore] scratch decrypted copy removed"
fi

echo "[restore] done — restart the app (e.g. docker compose start deals)."
