#!/bin/sh
set -e

# Writable home for any tool that still touches $HOME (never use pnpm/corepack here)
export HOME=/tmp
export npm_config_cache=/tmp/npm-cache
export XDG_CACHE_HOME=/tmp/cache
mkdir -p /tmp/npm-cache /tmp/cache /app/data

# Default SQLite path (persisted via Docker volume at /app/data)
export DATABASE_URL="${DATABASE_URL:-file:/app/data/deals.db}"

echo "[deals] DATABASE_URL=${DATABASE_URL}"
echo "[deals] Running Prisma migrations..."

PRISMA_BIN="./node_modules/.bin/prisma"
if [ ! -x "$PRISMA_BIN" ]; then
  echo "[deals] ERROR: prisma CLI not found in node_modules"
  exit 1
fi

"$PRISMA_BIN" migrate deploy

# Always ensure categories exist (idempotent upserts) — critical for SEO category pages
if [ -x ./node_modules/.bin/tsx ]; then
  echo "[deals] Ensuring categories are seeded..."
  ./node_modules/.bin/tsx prisma/seed.ts || echo "[deals] Seed failed (non-fatal)"
elif [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[deals] tsx missing — cannot seed"
fi

echo "[deals] Starting Next.js on :${PORT:-3000}"
if [ -x ./node_modules/.bin/next ]; then
  exec ./node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
else
  exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
fi
