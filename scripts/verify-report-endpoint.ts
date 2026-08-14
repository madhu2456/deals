/**
 * Report-broken-deal endpoint (F-DEAL-006): unit tests for
 *  lib/report-deal.ts against a temp DB copy (valid id, invalid id, missing
 *  deal, rate limit, honeypot) plus static wiring asserts for the route
 *  handler and the deal-page component.
 *
 * When no dev.db exists (fresh CI checkout — prisma/*.db is gitignored), the
 * temp DB is provisioned via `prisma migrate deploy` + `tsx prisma/seed.ts`
 * before the checks run. The origin guard is exercised by invoking the real
 * route handler with a NextRequest: cross-origin → 403, same-origin and
 * Origin-less requests pass the guard.
 *
 * Rate limiting is exercised with NODE_ENV=production (the same guard the
 * click/submit routes use); the limiter is in-memory and per-process, so the
 * report bucket never leaks into other tests.
 *
 * Run: pnpm test:report-endpoint
 */
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");
const TSX_BIN = join(repoRoot, "node_modules", ".bin", "tsx");
const PRISMA_BIN = join(repoRoot, "node_modules", ".bin", "prisma");

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
  // Static wiring asserts (no DB needed).
  const route = readFileSync(
    join(repoRoot, "app", "api", "deals", "[id]", "report", "route.ts"),
    "utf8"
  );
  assert(route.includes("reportHoneypotTriggered"), "route checks the honeypot");
  assert(route.includes("recordBrokenDealReport"), "route delegates to lib/report-deal");
  assert(route.includes("getClientIp(request.headers)"), "route derives client IP");
  assert(route.includes("isReportOriginAllowed"), "route enforces the origin allowlist");
  assert(route.includes("status: 403"), "route rejects disallowed origins with 403");

  const page = readFileSync(join(repoRoot, "app", "deals", "[slug]", "page.tsx"), "utf8");
  assert(page.includes("ReportBrokenDeal"), "deal page renders ReportBrokenDeal");

  const component = readFileSync(
    join(repoRoot, "app", "deals", "[slug]", "ReportBrokenDeal.tsx"),
    "utf8"
  );
  const reportLib = readFileSync(join(repoRoot, "lib", "report-deal.ts"), "utf8");
  assert(
    component.includes('const HONEYPOT_FIELD = "company"'),
    "client honeypot field name is 'company'"
  );
  assert(
    reportLib.includes('REPORT_HONEYPOT_FIELD = "company"'),
    "lib/report-deal.ts honeypot field name is 'company'"
  );

  // DB-backed tests.
  const workDir = mkdtempSync(join(tmpdir(), "deals-report-"));
  const dbPath = join(workDir, "report.db");
  const dbUrl = `file:${dbPath}`;

  try {
    const source = resolveSourceDb();
    if (source) {
      copyFileSync(source, dbPath);
      for (const suffix of ["-wal", "-shm", "-journal"]) {
        if (existsSync(source + suffix)) copyFileSync(source + suffix, dbPath + suffix);
      }
      // Bring the copy up to the latest schema (e.g. F-DEAL-006 report columns)
      // on the scratch DB only — never the live/dev DB.
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
      // A fresh schema has no rows — seed categories + deals so the
      // behavioral asserts below have data to work with (CI-safe).
      execFileSync(TSX_BIN, ["prisma/seed.ts"], {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: dbUrl },
        stdio: "inherit",
      });
    }

    // Env BEFORE importing the modules that read it.
    process.env.DATABASE_URL = dbUrl;
    // Next augments NODE_ENV as readonly — cast to set it at runtime.
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production"; // exercises the rate-limit guard

    const { prisma } = await import("../lib/prisma");
    const { recordBrokenDealReport, reportHoneypotTriggered } = await import("../lib/report-deal");

    const deal = await prisma.deal.findFirst({ select: { id: true } });
    assert(deal !== null, "at least one deal row exists for the report tests");
    const dealId = deal.id;

    // ── Honeypot ──
    const botForm = new FormData();
    botForm.set("company", "spam");
    assert(reportHoneypotTriggered(botForm) === true, "filled honeypot field → triggered");
    const humanForm = new FormData();
    assert(reportHoneypotTriggered(humanForm) === false, "empty form → not triggered");

    // ── Invalid ids (validated before any DB work) ──
    const empty = await recordBrokenDealReport("", "198.51.100.7");
    assertEqual(empty.success, false, "empty id rejected");
    if (!empty.success) assertEqual(empty.status, 400, "empty id → 400");

    const tooLong = await recordBrokenDealReport("x".repeat(65), "198.51.100.7");
    assertEqual(tooLong.success, false, "65-char id rejected");
    if (!tooLong.success) assertEqual(tooLong.status, 400, "long id → 400");

    // ── Missing deal (own IP: the 404 probe is rate-limited first by
    // design, so it must not consume the main test bucket) ──
    const missing = await recordBrokenDealReport("does-not-exist-123", "198.51.100.9");
    assertEqual(missing.success, false, "unknown id rejected");
    if (!missing.success) assertEqual(missing.status, 404, "unknown id → 404");

    // ── Valid reports: 5 allowed per IP per hour, 6th blocked ──
    const ip = "198.51.100.7";
    for (let i = 1; i <= 5; i += 1) {
      const r = await recordBrokenDealReport(dealId, ip);
      assert(r.success === true, `report #${i} accepted`);
    }
    const sixth = await recordBrokenDealReport(dealId, ip);
    assertEqual(sixth.success, false, "6th report from same IP blocked");
    if (!sixth.success) assertEqual(sixth.status, 429, "rate-limited → 429");

    const row = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { brokenReportCount: true, brokenReportedAt: true },
    });
    assertEqual(row?.brokenReportCount, 5, "counter stores exactly the accepted reports");
    assert(row?.brokenReportedAt instanceof Date, "first-report timestamp stored");

    // Different IP → independent bucket.
    const other = await recordBrokenDealReport(dealId, "198.51.100.8");
    assert(other.success === true, "different IP gets its own budget");
    const row2 = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { brokenReportCount: true },
    });
    assertEqual(row2?.brokenReportCount, 6, "counter incremented across IPs");

    // ── Origin guard: real route handler rejects cross-origin POSTs (403) ──
    const { NextRequest } = await import("next/server");
    const { POST: reportRoute } = await import("../app/api/deals/[id]/report/route");
    const originForm = new FormData();
    originForm.set("note", "origin guard check");

    const crossOrigin = await reportRoute(
      new NextRequest("https://deals.madhudadi.in/api/deals/test/report", {
        method: "POST",
        headers: { origin: "https://evil.example.com" },
        body: originForm,
      }),
      { params: Promise.resolve({ id: "x" }) }
    );
    assertEqual(crossOrigin.status, 403, "cross-origin POST → 403");

    const sameOrigin = await reportRoute(
      new NextRequest("https://deals.madhudadi.in/api/deals/test/report", {
        method: "POST",
        headers: { origin: "https://deals.madhudadi.in" },
        body: originForm,
      }),
      { params: Promise.resolve({ id: "x" }) }
    );
    assert(sameOrigin.status !== 403, "same-origin POST not blocked by the origin guard");

    const noOrigin = await reportRoute(
      new NextRequest("https://deals.madhudadi.in/api/deals/test/report", {
        method: "POST",
        body: originForm,
      }),
      { params: Promise.resolve({ id: "x" }) }
    );
    assert(noOrigin.status !== 403, "Origin-less POST (curl/monitors) not blocked by the origin guard");

    await prisma.$disconnect();
    console.log("OK: report endpoint unit tests (honeypot, validation, rate limit, storage, origin guard)");
  } finally {
    delete (process.env as { NODE_ENV?: string }).NODE_ENV;
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
