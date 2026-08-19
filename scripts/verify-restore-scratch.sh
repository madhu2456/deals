#!/usr/bin/env bash
#
# verify-restore-scratch.sh (F211)
#
# End-to-end SQLite disaster recovery drill from scratch:
# 1. Creates an isolated temporary directory under /tmp.
# 2. Deploys Prisma migrations onto a fresh scratch SQLite database.
# 3. Enables WAL mode, inserts canary rows, and verifies WAL dirty-write state.
# 4. Executes scripts/backup-sqlite.sh to generate an online consistent backup.
# 5. Restores the backup via scripts/restore-sqlite.sh and logs Recovery Time Objective (RTO).
# 6. Validates restored database integrity via PRAGMA integrity_check and canary verification.
# 7. Simulates a corrupted target database and verifies clean destructive restore.
# 8. Cleans up all scratch files, background processes, and directories on exit.
#
# Exit codes: 0 = success, 1 = failure.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

WRITER_PID=""

cleanup() {
  if [[ -n "${WRITER_PID:-}" ]]; then
    kill "${WRITER_PID}" 2>/dev/null || true
    wait "${WRITER_PID}" 2>/dev/null || true
  fi
  if [[ -n "${WORK_DIR:-}" && -d "${WORK_DIR}" ]]; then
    rm -rf "${WORK_DIR}"
  fi
}
trap cleanup EXIT INT TERM

run_sqlite_exec() {
  local db="$1"
  local sql="$2"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${db}" "${sql}"
  elif command -v python3 >/dev/null 2>&1; then
    python3 - "${db}" "${sql}" <<'PY'
import sqlite3, sys
db_path, script = sys.argv[1], sys.argv[2]
conn = sqlite3.connect(db_path)
try:
    cursor = conn.cursor()
    cursor.executescript(script)
    conn.commit()
finally:
    conn.close()
PY
  else
    echo "error: sqlite3 CLI or python3 is required" >&2
    exit 1
  fi
}

run_sqlite_query() {
  local db="$1"
  local sql="$2"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${db}" "${sql}"
  elif command -v python3 >/dev/null 2>&1; then
    python3 - "${db}" "${sql}" <<'PY'
import sqlite3, sys
db_path, query = sys.argv[1], sys.argv[2]
conn = sqlite3.connect(db_path)
try:
    cursor = conn.cursor()
    cursor.execute(query)
    for row in cursor.fetchall():
        print("|".join(str(v) if v is not None else "" for v in row))
finally:
    conn.close()
PY
  else
    echo "error: sqlite3 CLI or python3 is required" >&2
    exit 1
  fi
}

PRISMA_CMD=("${ROOT}/node_modules/.bin/prisma")
if [[ ! -x "${PRISMA_CMD[0]}" ]]; then
  if command -v prisma >/dev/null 2>&1; then
    PRISMA_CMD=("prisma")
  elif command -v pnpm >/dev/null 2>&1; then
    PRISMA_CMD=("pnpm" "exec" "prisma")
  elif command -v npx >/dev/null 2>&1; then
    PRISMA_CMD=("npx" "prisma")
  else
    echo "error: prisma CLI not found" >&2
    exit 1
  fi
fi

# 1. Create temporary directory under /tmp
WORK_DIR="$(mktemp -d /tmp/deals-restore-scratch-XXXXXX)"
echo "[verify-restore-scratch] Workdir: ${WORK_DIR}"

SCRATCH_DB="${WORK_DIR}/deals-source.db"
BACKUP_DIR="${WORK_DIR}/backups"
RESTORE_TARGET="${WORK_DIR}/deals-restored.db"
mkdir -p "${BACKUP_DIR}"

# 2. Deploy Prisma migrations to fresh scratch DB
echo "[verify-restore-scratch] Deploying migrations to scratch DB..."
DATABASE_URL="file:${SCRATCH_DB}" "${PRISMA_CMD[@]}" migrate deploy

# 3. Enable WAL mode and insert canary records
echo "[verify-restore-scratch] Enabling WAL mode and writing canary records..."
CANARY_CAT_ID="cat-canary-f211"
CANARY_DEAL_ID="deal-canary-f211"
CANARY_TITLE="WAL Dirty Write Canary Deal $(date +%s)"

FIFO="${WORK_DIR}/canary.fifo"
mkfifo "${FIFO}"

python3 - "${SCRATCH_DB}" "${CANARY_CAT_ID}" "${CANARY_DEAL_ID}" "${CANARY_TITLE}" "${FIFO}" <<'PY' &
import sqlite3, sys, time, signal

db_path = sys.argv[1]
cat_id = sys.argv[2]
deal_id = sys.argv[3]
title = sys.argv[4]
fifo_path = sys.argv[5]

conn = sqlite3.connect(db_path)
conn.execute("PRAGMA journal_mode=WAL;")
conn.execute("""
INSERT INTO categories (id, name, slug, description, icon, color, sortOrder, isActive, createdAt, updatedAt)
VALUES (?, 'Canary Category', 'canary-category', 'F211 Canary Category', 'tag', '#6366F1', 1, 1, datetime('now'), datetime('now'));
""", (cat_id,))
conn.execute("""
INSERT INTO deals (id, title, slug, description, shortDescription, categoryId, brandName, dealUrl, status, clicks, createdAt, updatedAt)
VALUES (?, ?, 'wal-canary-deal', 'F211 WAL Dirty Write Canary', 'WAL Canary', ?, 'CanaryBrand', 'https://example.com/canary', 'APPROVED', 77, datetime('now'), datetime('now'));
""", (deal_id, title, cat_id))
conn.commit()

with open(fifo_path, 'w') as f:
    f.write("READY\n")

def shutdown(signum, frame):
    try:
        conn.close()
    finally:
        sys.exit(0)

signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)

while True:
    time.sleep(0.5)
PY
WRITER_PID=$!

READ_SIGNAL="$(cat "${FIFO}")"
if [[ "${READ_SIGNAL}" != "READY" ]]; then
  echo "error: canary background writer failed to initialize" >&2
  exit 1
fi

# Verify WAL file exists and dirty-write canary is active
if [[ ! -f "${SCRATCH_DB}-wal" ]]; then
  echo "error: expected WAL file ${SCRATCH_DB}-wal to exist after WAL writes" >&2
  exit 1
fi
WAL_BYTES="$(wc -c < "${SCRATCH_DB}-wal" | tr -d ' ')"
echo "[verify-restore-scratch] WAL canary verified: ${SCRATCH_DB}-wal size=${WAL_BYTES} bytes"

# 4. Generate consistent backup via scripts/backup-sqlite.sh (online backup while WAL writer is live)
echo "[verify-restore-scratch] Running backup-sqlite.sh..."
DATABASE_URL="file:${SCRATCH_DB}" BACKUP_DIR="${BACKUP_DIR}" bash "${ROOT}/scripts/backup-sqlite.sh"

if [[ ! -f "${BACKUP_DIR}/LAST_SUCCESS" ]]; then
  echo "error: LAST_SUCCESS was not created by backup script" >&2
  exit 1
fi

BACKUP_FILE="$(awk '{print $2}' "${BACKUP_DIR}/LAST_SUCCESS")"
if [[ -z "${BACKUP_FILE:-}" || ! -f "${BACKUP_FILE}" ]]; then
  echo "error: backup file resolved from LAST_SUCCESS not found: ${BACKUP_FILE:-none}" >&2
  exit 1
fi
echo "[verify-restore-scratch] Backup verified at: ${BACKUP_FILE}"

# Stop background writer cleanly
kill "${WRITER_PID}" 2>/dev/null || true
wait "${WRITER_PID}" 2>/dev/null || true
WRITER_PID=""

# 5. Restore backup onto fresh target and measure RTO
echo "[verify-restore-scratch] Restoring backup to fresh target..."
START_TIME_MS="$(date +%s%3N 2>/dev/null || echo "")"
if [[ -z "${START_TIME_MS}" || "${#START_TIME_MS}" -lt 13 ]]; then
  START_TIME_MS="$(date +%s)"
  UNIT="s"
else
  UNIT="ms"
fi

CONFIRM=YES DATABASE_URL="file:${RESTORE_TARGET}" bash "${ROOT}/scripts/restore-sqlite.sh" "${BACKUP_FILE}"

END_TIME_MS="$(date +%s%3N 2>/dev/null || date +%s)"
RTO=$(( END_TIME_MS - START_TIME_MS ))
echo "[verify-restore-scratch] Recovery Time Objective (RTO): ${RTO} ${UNIT} (RTO logged)"

# 6. Verify restored database integrity and canary contents
INTEGRITY="$(run_sqlite_query "${RESTORE_TARGET}" "PRAGMA integrity_check;")"
if [[ "${INTEGRITY}" != "ok" ]]; then
  echo "error: integrity_check on restored DB failed: ${INTEGRITY}" >&2
  exit 1
fi

TITLE_CHECK="$(run_sqlite_query "${RESTORE_TARGET}" "SELECT title FROM deals WHERE id='${CANARY_DEAL_ID}';")"
if [[ "${TITLE_CHECK}" != "${CANARY_TITLE}" ]]; then
  echo "error: canary deal title mismatch in restored DB (expected '${CANARY_TITLE}', got '${TITLE_CHECK}')" >&2
  exit 1
fi

CLICKS_CHECK="$(run_sqlite_query "${RESTORE_TARGET}" "SELECT clicks FROM deals WHERE id='${CANARY_DEAL_ID}';")"
if [[ "${CLICKS_CHECK}" != "77" ]]; then
  echo "error: canary deal clicks mismatch in restored DB (expected 77, got '${CLICKS_CHECK}')" >&2
  exit 1
fi
echo "[verify-restore-scratch] Restored database integrity and canary records verified"

# 7. Test destructive restore over corrupted live target
echo "[verify-restore-scratch] Testing restore over corrupted live target..."
# Corrupt the target database file and leave a dirty WAL file beside it
echo "CORRUPTED DATA" > "${RESTORE_TARGET}"
echo "DIRTY WAL" > "${RESTORE_TARGET}-wal"
echo "DIRTY SHM" > "${RESTORE_TARGET}-shm"

CONFIRM=YES DATABASE_URL="file:${RESTORE_TARGET}" bash "${ROOT}/scripts/restore-sqlite.sh" "${BACKUP_FILE}"

CORRUPT_INTEGRITY="$(run_sqlite_query "${RESTORE_TARGET}" "PRAGMA integrity_check;")"
if [[ "${CORRUPT_INTEGRITY}" != "ok" ]]; then
  echo "error: integrity_check failed after restore over corrupted target: ${CORRUPT_INTEGRITY}" >&2
  exit 1
fi

CORRUPT_CANARY_CHECK="$(run_sqlite_query "${RESTORE_TARGET}" "SELECT title FROM deals WHERE id='${CANARY_DEAL_ID}';")"
if [[ "${CORRUPT_CANARY_CHECK}" != "${CANARY_TITLE}" ]]; then
  echo "error: canary check failed after restore over corrupted target" >&2
  exit 1
fi

if [[ -f "${RESTORE_TARGET}-wal" || -f "${RESTORE_TARGET}-shm" ]]; then
  echo "error: restore should have dropped dirty WAL/SHM sidecars" >&2
  exit 1
fi
echo "[verify-restore-scratch] Destructive restore over corrupted target verified"

echo "OK: verify-restore-scratch passed (migration, WAL canary, backup, restore RTO, integrity check)"
