#!/bin/sh
set -e

# Default SQLite path (persisted via Docker volume at /app/data)
export DATABASE_URL="${DATABASE_URL:-file:/app/data/deals.db}"

echo "[deals] DATABASE_URL=${DATABASE_URL}"
echo "[deals] Running Prisma migrations..."
pnpm exec prisma migrate deploy

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[deals] Seeding categories..."
  pnpm seed || echo "[deals] Seed skipped/failed (non-fatal)"
fi

echo "[deals] Starting Next.js on :${PORT:-3000}"
exec pnpm start
