# syntax=docker/dockerfile:1
# Deals — Next.js 16 + Prisma (SQLite) production image

FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# ---------- deps ----------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Prisma schema needed so postinstall/generate can run if configured
COPY prisma ./prisma
# Prefer frozen lockfile; fall back if lock is slightly out of sync in CI
RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile

# ---------- build ----------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time public config. NEXT_PUBLIC_* is inlined by Next at `pnpm build`.
# Empty GTM id disables the client script (pass via compose build.args).
ARG NEXT_PUBLIC_SITE_URL=https://deals.madhudadi.in
ARG NEXT_PUBLIC_GTM_ID
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_GTM_ID=$NEXT_PUBLIC_GTM_ID
ENV DATABASE_URL="file:./build.db"
ENV ADMIN_USERNAME="build"
ENV ADMIN_PASSWORD="build"
ENV ADMIN_SECRET="build-time-placeholder-secret-min-32-chars"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN pnpm exec prisma generate
# Ensure schema exists if any page still touches the DB during build
RUN pnpm exec prisma migrate deploy
RUN pnpm build

# ---------- runner ----------
# Slim runtime: no need for corepack/pnpm — entrypoint uses node_modules/.bin/*
FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates sqlite3 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV HOME=/tmp

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --home /tmp nextjs

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/app ./app
COPY --from=builder /app/components ./components
COPY --from=builder /app/components.json ./components.json
# Ops scripts (backup/restore + verify helpers) for exec/cron inside the image
COPY --from=builder /app/scripts ./scripts

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
  && chmod +x /app/scripts/*.sh 2>/dev/null || true \
  # Standalone server (node .next/standalone/server.js) serves .next/static
  # and public relative to its own dir, so mirror them inside it
  && mkdir -p /app/.next/standalone/.next \
  && cp -r /app/.next/static /app/.next/standalone/.next/static \
  && cp -r /app/public /app/.next/standalone/public \
  && mkdir -p /app/data \
  && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
