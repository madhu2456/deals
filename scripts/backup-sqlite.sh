#!/usr/bin/env bash
#
# backup-sqlite.sh — online SQLite backup via sqlite3 .backup, integrity_check,
# encrypted-at-rest publishing (F018), and 14-day retention.
#
# Usage:
#   BACKUP_ENCRYPTION_KEY=... scripts/backup-sqlite.sh
#   DATABASE_URL=file:/app/data/deals.db BACKUP_DIR=/var/backups/deals BACKUP_ENCRYPTION_KEY=... scripts/backup-sqlite.sh
#
# Env:
#   DATABASE_URL  — Prisma-style URL (file:./dev.db or file:/app/data/deals.db)
#   BACKUP_DIR    — destination directory (default: /var/backups/deals when
#                   writable — matches verify_backup_freshness.sh; container
#                   fallback /app/data/backups; local dev <repo>/backups)
#   RETENTION_DAYS — days to keep (default: 14)
#   BACKUP_ENCRYPTION_KEY — REQUIRED (fail-closed): openssl passphrase
#                   (generate: openssl rand -base64 32). Without a key the
#                   script REFUSES to write a plaintext backup (F018).
#   BACKUP_AGE_KEYFILE   — optional age identity file; when `age` +
#                   `age-keygen` are installed this wins over openssl and
#                   backups are published as *.db.age instead of *.db.enc.
#
# Writes to *.db.plain.tmp, PRAGMA integrity_check, encrypts to *.db.*.tmp
# (age or openssl enc -aes-256-cbc -pbkdf2 -salt -iter 100000), round-trip-decrypts and
# re-checks integrity, then mv to the final *.db.age / *.db.enc. The
# plaintext staging file is deleted BEFORE the final publish — a plaintext
# copy is never left at rest, and a failed check or killed write never
# leaves a partial final backup. LAST_SUCCESS (ISO-8601 UTC + backup path)
# is written only after that mv.
#
# Exit: 0 success, 1 failure.
set -euo pipefail

# security M-3: encrypted backups + plaintext scratch land 0600 regardless of the
# caller's umask (cron defaults to 022 — world-readable ciphertext).
umask 077
# dba+security M-2: guarantee the plaintext staging + round-trip scratch
# files are removed on ANY exit (success, failure, signal) — plaintext never
# rests outside the backup window (mirrors restore-sqlite.sh's cleanup trap).
PLAIN_TMP=""
VERIFY_TMP=""
cleanup_scratch() {
  if [[ -n "${PLAIN_TMP:-}" && -f "${PLAIN_TMP}" ]]; then
    rm -f -- "${PLAIN_TMP}"
  fi
  if [[ -n "${VERIFY_TMP:-}" && -f "${VERIFY_TMP}" ]]; then
    rm -f -- "${VERIFY_TMP}"
  fi
}
# EXIT: cleanup only. INT/TERM: cleanup then TERMINATE — resuming after a
# kill would re-open the deleted staging path (sqlite creates an empty DB on
# a missing file ⇒ integrity ok ⇒ a bogus empty backup could be published).
trap cleanup_scratch EXIT
trap 'cleanup_scratch; exit 130' INT
trap 'cleanup_scratch; exit 143' TERM

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

sqlite_backup() {
  local src="$1" dest="$2"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${src}" ".backup '${dest}'"
  elif command -v python3 >/dev/null 2>&1; then
    python3 - "${src}" "${dest}" <<'PY'
import sqlite3, sys
src, dest = sys.argv[1], sys.argv[2]
src_conn = sqlite3.connect(src)
try:
    dest_conn = sqlite3.connect(dest)
    try:
        src_conn.backup(dest_conn)
    finally:
        dest_conn.close()
finally:
    src_conn.close()
PY
  else
    echo "error: sqlite3 CLI or python3 is required" >&2
    exit 1
  fi
}

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

# --- F018: encryption method selection (fail-closed on missing key) --------
# age (keyfile) when available, else openssl enc (env passphrase). Either way
# the script refuses to publish a plaintext backup: no key ⇒ exit 1 BEFORE any
# backup file is written (see the key gate below).
CIPHER="openssl"
if command -v age >/dev/null 2>&1 && command -v age-keygen >/dev/null 2>&1; then
  CIPHER="age"
fi

if [[ "${CIPHER}" == "age" ]]; then
  if [[ -z "${BACKUP_AGE_KEYFILE:-}" ]]; then
    echo "error: BACKUP_AGE_KEYFILE is not set — refusing to write a plaintext backup (F018)" >&2
    echo "hint: generate once: age-keygen -o /etc/deals/backup.age && chmod 600 /etc/deals/backup.age" >&2
    echo "hint: then: BACKUP_AGE_KEYFILE=/etc/deals/backup.age scripts/backup-sqlite.sh" >&2
    exit 1
  fi
  if [[ ! -f "${BACKUP_AGE_KEYFILE}" ]]; then
    echo "error: BACKUP_AGE_KEYFILE not found: ${BACKUP_AGE_KEYFILE} (F018 fail-closed)" >&2
    exit 1
  fi
  EXT="db.age"
else
  if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
    echo "error: BACKUP_ENCRYPTION_KEY is not set — refusing to write a plaintext backup (F018 fail-closed)" >&2
    echo "hint: generate once (store in password manager + server env, never in git): openssl rand -base64 32" >&2
    echo "hint: then: BACKUP_ENCRYPTION_KEY=<key> scripts/backup-sqlite.sh" >&2
    exit 1
  fi
  if ! command -v openssl >/dev/null 2>&1; then
    echo "error: neither age nor openssl is available — cannot encrypt backup (F018 fail-closed)" >&2
    exit 1
  fi
  # -pass env: reads the process environment, not the shell variable — make a
  # locally-assigned (unexported) key work too.
  export BACKUP_ENCRYPTION_KEY
  EXT="db.enc"
fi

BACKUP_FILE="${DEST}/${BASE}-${STAMP}.${EXT}"
TMP_FILE="${BACKUP_FILE}.tmp"
PLAIN_TMP="${DEST}/${BASE}-${STAMP}.db.plain.tmp"

echo "[backup] source=${DB_PATH}"
echo "[backup] dest=${BACKUP_FILE} (cipher=${CIPHER})"
echo "[backup] encryption=REQUIRED-at-rest (F018) — key never logged, never on disk"

# Online consistent backup (holds a brief read lock). Stage the plaintext in
# .db.plain.tmp so a killed write never publishes a partial final backup; the
# plaintext staging file is encrypted then deleted BEFORE the final mv — a
# plaintext copy never rests in BACKUP_DIR (F018).
if ! sqlite_backup "${DB_PATH}" "${PLAIN_TMP}"; then
  rm -f -- "${PLAIN_TMP}"
  echo "error: sqlite backup failed" >&2
  exit 1
fi

# Integrity check on the tmp copy (never modify live DB for verification)
CHECK="$(sqlite_integrity "${PLAIN_TMP}")"
if [[ "${CHECK}" != "ok" ]]; then
  echo "error: integrity_check failed on backup: ${CHECK}" >&2
  rm -f -- "${PLAIN_TMP}"
  exit 1
fi

# --- F018: encrypt the staged plaintext, then delete it from disk -----------
if [[ "${CIPHER}" == "age" ]]; then
  # Derive the recipient (public key) from the identity file — identity files
  # are not reliably accepted as recipients-files across age versions.
  if ! AGE_RECIPIENT="$(age-keygen -y "${BACKUP_AGE_KEYFILE}")"; then
    echo "error: cannot derive age recipient from ${BACKUP_AGE_KEYFILE} — not a valid identity file?" >&2
    rm -f -- "${PLAIN_TMP}"
    exit 1
  fi
  if ! age -r "${AGE_RECIPIENT}" -o "${TMP_FILE}" "${PLAIN_TMP}"; then
    echo "error: age encryption failed" >&2
    rm -f -- "${PLAIN_TMP}" "${TMP_FILE}"
    exit 1
  fi
else
  if ! openssl enc -aes-256-cbc -pbkdf2 -salt -iter 100000 -in "${PLAIN_TMP}" -out "${TMP_FILE}" -pass env:BACKUP_ENCRYPTION_KEY; then
    echo "error: openssl encryption failed" >&2
    rm -f -- "${PLAIN_TMP}" "${TMP_FILE}"
    exit 1
  fi
fi
rm -f -- "${PLAIN_TMP}"

# Round-trip verification: decrypt the ciphertext to a scratch copy and
# re-run integrity_check — a bad key, truncated ciphertext, or corrupt
# payload fails here and the backup is never published.
VERIFY_TMP="${BACKUP_FILE}.verify.tmp"
if [[ "${CIPHER}" == "age" ]]; then
  age -d -i "${BACKUP_AGE_KEYFILE}" -o "${VERIFY_TMP}" "${TMP_FILE}"
else
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in "${TMP_FILE}" -out "${VERIFY_TMP}" -pass env:BACKUP_ENCRYPTION_KEY
fi
VCHECK="$(sqlite_integrity "${VERIFY_TMP}")"
if [[ "${VCHECK}" != "ok" ]]; then
  echo "error: round-trip decrypt/integrity_check failed (backup not published): ${VCHECK}" >&2
  rm -f -- "${VERIFY_TMP}" "${TMP_FILE}"
  exit 1
fi
rm -f -- "${VERIFY_TMP}"

mv -f -- "${TMP_FILE}" "${BACKUP_FILE}"

# Optional size sanity (empty DB is still valid but worth noting)
SIZE="$(wc -c <"${BACKUP_FILE}" | tr -d ' ')"
echo "[backup] integrity_check=ok (round-trip decrypt verified) size_bytes=${SIZE}"

# LAST_SUCCESS only after integrity_check=ok and the final encrypted backup is
# in place.
{
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${BACKUP_FILE}"
} >"${DEST}/LAST_SUCCESS.tmp"
mv -f -- "${DEST}/LAST_SUCCESS.tmp" "${DEST}/LAST_SUCCESS"
echo "[backup] last_success=${DEST}/LAST_SUCCESS"

# Retention: delete backups older than RETENTION_DAYS — final encrypted
# (*.db.age / *.db.enc) plus legacy pre-F018 plaintext (*.db) files; never
# the live staging sidecars (*.tmp / *.plain.tmp / *.verify.tmp).
find "${DEST}" -maxdepth 1 -type f -name "${BASE}-*.db.age" -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null || true
find "${DEST}" -maxdepth 1 -type f -name "${BASE}-*.db.enc" -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null || true
find "${DEST}" -maxdepth 1 -type f -name "${BASE}-*.db" -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null || true

echo "[backup] done (retention=${RETENTION_DAYS}d)"
