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

# Seed ONLY on explicit first-time provisioning (RUN_SEED=true). deploy.sh
# bootstrap writes RUN_SEED=true when .env is first created and flips it to
# false after the first container start, so routine --update deploys never
# re-seed. Even if a seed does run, prisma/seed.ts is create-if-missing only
# (F-DEAL-010) — it can never re-stamp or overwrite existing rows.
if [ "${RUN_SEED:-false}" = "true" ]; then
  if [ -x ./node_modules/.bin/tsx ]; then
    echo "[deals] Seeding categories + curated deals (RUN_SEED=true)..."
    ./node_modules/.bin/tsx prisma/seed.ts || echo "[deals] Seed failed (non-fatal)"
  else
    echo "[deals] RUN_SEED=true but tsx not installed — skipping seed"
  fi
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
