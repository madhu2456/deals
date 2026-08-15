/**
 * Click endpoint (F-DEAL-016): unit tests for the origin guard on
 * app/api/deals/[id]/click/route.ts — cross-origin POSTs must be rejected
 * with 403, same-origin and Origin-less POSTs must pass, and only accepted
 * POSTs may increment the click counter.
 *
 * Static wiring asserts (no DB): the route imports the shared allowlist
 * helper from lib/origin.ts and returns 403; lib/report-deal.ts re-exports
 * the same helper so the report route (F-DEAL-006) keeps its import name.
 *
 * DB-backed behavior uses a temp DB copy (same strategy as
 * scripts/verify-report-endpoint.ts): copies the repo dev.db when present,
 * else provisions a fresh DB via `prisma migrate deploy` + seed. Rate
 * limiting is exercised with NODE_ENV=production (same guard the report
 * test uses); the limiter is in-memory and per-process, so the click bucket
 * never leaks into other tests.
 *
 * Run: pnpm test:click-origin
 */
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");
const PRISMA_BIN = join(repoRoot, "node_modules", ".bin", "prisma");
const TSX_BIN = join(repoRoot, "node_modules", ".bin", "tsx");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function assertEqual(actual: unknown, expected: unknown, msg: string): void {
  assert(actual === expected, `${msg} (expected ${String(expected)}, got ${String(actual)})`);
}

function resolveSourceDb(): string | null {
  const raw = process.env.DATABASE_URL;
  if (raw && raw.startsWith("file:")) {
    const p = raw.slice("file:".length);
    const abs = p.startsWith("/") ? p : join(repoRoot, "prisma", p);
    if (existsSync(abs)) return abs;
  }
  const fallback = join(repoRoot, "prisma", "dev.db");
  return existsSync(fallback) ? fallback : null;
}

async function main(): Promise<void> {
  // ── Static wiring asserts (no DB needed) ──
  const route = readFileSync(
    join(repoRoot, "app", "api", "deals", "[id]", "click", "route.ts"),
    "utf8"
  );
  assert(route.includes("isOriginAllowed"), "click route enforces the shared origin allowlist");
  assert(route.includes("status: 403"), "click route rejects disallowed origins with 403");

  const originLib = readFileSync(join(repoRoot, "lib", "origin.ts"), "utf8");
  assert(originLib.includes("getSiteUrl()"), "origin allowlist derives the canonical site URL");
  assert(originLib.includes("https://deals.madhudadi.in"), "origin allowlist covers the prod origin");
  assert(originLib.includes("http://localhost:3000"), "origin allowlist covers localhost dev");

  const reportLib = readFileSync(join(repoRoot, "lib", "report-deal.ts"), "utf8");
  assert(
    reportLib.includes("isReportOriginAllowed"),
    "lib/report-deal.ts keeps the isReportOriginAllowed export (report route parity)"
  );

  // ── DB-backed behavior ──
  const workDir = mkdtempSync(join(tmpdir(), "deals-click-"));
  const dbPath = join(workDir, "click.db");
  const dbUrl = `file:${dbPath}`;

  try {
    const source = resolveSourceDb();
    if (source) {
      copyFileSync(source, dbPath);
      for (const suffix of ["-wal", "-shm", "-journal"]) {
        if (existsSync(source + suffix)) copyFileSync(source + suffix, dbPath + suffix);
      }
      execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: dbUrl },
        stdio: "inherit",
      });
    } else {
      console.log("No source DB found — creating fresh DB via prisma migrate deploy + seed");
      execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: dbUrl },
        stdio: "inherit",
      });
      execFileSync(TSX_BIN, ["prisma/seed.ts"], {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: dbUrl },
        stdio: "inherit",
      });
    }

    process.env.DATABASE_URL = dbUrl;
    // Next augments NODE_ENV as readonly — cast to set it at runtime.
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production"; // exercises the rate-limit guard

    const { prisma } = await import("../lib/prisma");
    const { POST: clickRoute } = await import("../app/api/deals/[id]/click/route");
    const { NextRequest } = await import("next/server");

    const deal = await prisma.deal.findFirst({ select: { id: true, clicks: true } });
    assert(deal !== null, "at least one deal row exists for the click tests");
    const dealId = deal.id;
    const baseClicks = deal.clicks ?? 0;

    const url = "https://deals.madhudadi.in/api/deals/test/click";

    // Cross-origin → 403, before any id validation or DB work.
    const cross = await clickRoute(
      new NextRequest(url, {
        method: "POST",
        headers: { origin: "https://evil.example.com" },
      }),
      { params: Promise.resolve({ id: dealId }) }
    );
    assertEqual(cross.status, 403, "cross-origin POST → 403");

    const crossInvalid = await clickRoute(
      new NextRequest(url, {
        method: "POST",
        headers: { origin: "https://evil.example.com" },
      }),
      { params: Promise.resolve({ id: "x" }) }
    );
    assertEqual(crossInvalid.status, 403, "cross-origin POST rejected before id validation");

    // Same-origin → 200 and counter increments.
    const same = await clickRoute(
      new NextRequest(url, {
        method: "POST",
        headers: { origin: "https://deals.madhudadi.in" },
      }),
      { params: Promise.resolve({ id: dealId }) }
    );
    assertEqual(same.status, 200, "same-origin POST → 200");

    const missing = await clickRoute(
      new NextRequest(url, {
        method: "POST",
        headers: { origin: "https://deals.madhudadi.in" },
      }),
      { params: Promise.resolve({ id: "does-not-exist-123" }) }
    );
    assertEqual(missing.status, 404, "same-origin unknown id → 404");

    // Origin-less (curl/uptime monitors) → 200.
    const noOrigin = await clickRoute(
      new NextRequest(url, { method: "POST" }),
      { params: Promise.resolve({ id: dealId }) }
    );
    assertEqual(noOrigin.status, 200, "Origin-less POST (curl/monitors) → 200");

    const row = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { clicks: true },
    });
    assertEqual(
      row?.clicks,
      baseClicks + 2,
      "click counter incremented exactly by the accepted POSTs"
    );

    await prisma.$disconnect();
    console.log("OK: click endpoint origin guard (403 cross-origin, 200 same/origin-less, counter)");
  } finally {
    delete (process.env as { NODE_ENV?: string }).NODE_ENV;
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
