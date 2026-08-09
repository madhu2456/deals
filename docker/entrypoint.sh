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

# Standalone output: the generated server.js takes PORT/HOSTNAME from env
# (Dockerfile sets PORT=3000 HOSTNAME=0.0.0.0; it does not parse CLI args).
echo "[deals] Starting standalone Next.js server on :${PORT:-3000}"
if [ -f .next/standalone/server.js ]; then
  exec node .next/standalone/server.js
else
  echo "[deals] ERROR: .next/standalone/server.js not found (build with output: standalone)" >&2
  exit 1
fi
