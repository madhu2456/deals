/**
 * Click endpoint (F-DEAL-016 & F-DEAL-017): unit tests for:
 * 1. Origin guard: cross-origin POSTs rejected with 403, same-origin and
 *    Origin-less POSTs pass.
 * 2. Bot filtering: bot/crawler user agents are ignored with 200 OK without
 *    incrementing DB click counts or consuming rate-limit tokens.
 * 3. Rate limiting: human requests are subject to per-IP rate limiting (10/min)
 *    in production mode.
 *
 * Static wiring asserts (no DB): the route imports the shared allowlist
 * helper from lib/origin.ts and bot detector from lib/bot.ts; lib/report-deal.ts
 * re-exports the same helper so the report route (F-DEAL-006) keeps its import name.
 *
 * DB-backed behavior uses a temp DB copy (same strategy as
 * scripts/verify-report-endpoint.ts): copies the repo dev.db when present,
 * else provisions a fresh DB via `prisma migrate deploy` + seed. Rate
 * limiting is exercised with NODE_ENV=production.
 *
 * Run: pnpm test:click-origin
 */
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isBotUserAgent } from "../lib/bot";

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
  assert(route.includes("isBotUserAgent"), "click route uses isBotUserAgent for bot filtering");

  const originLib = readFileSync(join(repoRoot, "lib", "origin.ts"), "utf8");
  assert(originLib.includes("getSiteUrl()"), "origin allowlist derives the canonical site URL");
  assert(originLib.includes("https://deals.madhudadi.in"), "origin allowlist covers the prod origin");
  assert(originLib.includes("http://localhost:3000"), "origin allowlist covers localhost dev");

  const reportLib = readFileSync(join(repoRoot, "lib", "report-deal.ts"), "utf8");
  assert(
    reportLib.includes("isReportOriginAllowed"),
    "lib/report-deal.ts keeps the isReportOriginAllowed export (report route parity)"
  );

  // ── Unit tests for isBotUserAgent ──
  const botAgents = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Twitterbot/1.0",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "GPTBot/1.0",
    "ClaudeBot/1.0",
    "curl/8.5.0",
    "Wget/1.21",
    "python-requests/2.31.0",
    "node-fetch/1.0",
    "PostmanRuntime/7.36.0",
    "Mozilla/5.0 (HeadlessChrome/120.0.0.0)",
  ];
  for (const ua of botAgents) {
    assert(isBotUserAgent(ua), `isBotUserAgent correctly flags bot: ${ua}`);
  }

  const humanAgents = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "",
    null,
    undefined,
  ];
  for (const ua of humanAgents) {
    assert(!isBotUserAgent(ua), `isBotUserAgent correctly allows human/empty: ${String(ua)}`);
  }

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
    const humanUa =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

    // Cross-origin → 403, before any id validation or DB work.
    const cross = await clickRoute(
      new NextRequest(url, {
        method: "POST",
        headers: { origin: "https://evil.example.com", "user-agent": humanUa },
      }),
      { params: Promise.resolve({ id: dealId }) }
    );
    assertEqual(cross.status, 403, "cross-origin POST → 403");

    const crossInvalid = await clickRoute(
      new NextRequest(url, {
        method: "POST",
        headers: { origin: "https://evil.example.com", "user-agent": humanUa },
      }),
      { params: Promise.resolve({ id: "x" }) }
    );
    assertEqual(crossInvalid.status, 403, "cross-origin POST rejected before id validation");

    // Bot click filtering: bot requests return 200 with ignored: true, without incrementing clicks.
    const botRes = await clickRoute(
      new NextRequest(url, {
        method: "POST",
        headers: {
          origin: "https://deals.madhudadi.in",
          "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)",
          "x-forwarded-for": "198.51.100.50",
        },
      }),
      { params: Promise.resolve({ id: dealId }) }
    );
    assertEqual(botRes.status, 200, "bot POST → 200");
    const botJson = (await botRes.json()) as { success: boolean; ignored?: boolean };
    assertEqual(botJson.success, true, "bot POST success is true");
    assertEqual(botJson.ignored, true, "bot POST ignored is true");

    const afterBotRow = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { clicks: true },
    });
    assertEqual(afterBotRow?.clicks, baseClicks, "bot click did NOT increment click counter");

    // 15 rapid bot requests from same IP — none are rate-limited (bots bypass token consumption)
    for (let i = 0; i < 15; i++) {
      const floodBot = await clickRoute(
        new NextRequest(url, {
          method: "POST",
          headers: {
            origin: "https://deals.madhudadi.in",
            "user-agent": "Mozilla/5.0 (compatible; bingbot/2.0)",
            "x-forwarded-for": "198.51.100.50",
          },
        }),
        { params: Promise.resolve({ id: dealId }) }
      );
      assertEqual(floodBot.status, 200, `flood bot request ${i + 1} → 200`);
    }

    // Same-origin human request → 200 and counter increments (rate-limit bucket was not consumed by bots)
    const same = await clickRoute(
      new NextRequest(url, {
        method: "POST",
        headers: {
          origin: "https://deals.madhudadi.in",
          "user-agent": humanUa,
          "x-forwarded-for": "198.51.100.50",
        },
      }),
      { params: Promise.resolve({ id: dealId }) }
    );
    assertEqual(same.status, 200, "same-origin human POST → 200");

    // Same-origin human request with missing deal id (404, consumes rate-limit token)
    const missing = await clickRoute(
      new NextRequest(url, {
        method: "POST",
        headers: {
          origin: "https://deals.madhudadi.in",
          "user-agent": humanUa,
          "x-forwarded-for": "198.51.100.50",
        },
      }),
      { params: Promise.resolve({ id: "does-not-exist-123" }) }
    );
    assertEqual(missing.status, 404, "same-origin unknown id → 404");

    // Human rate limit test: send remaining 8 allowed requests (total 10 from 198.51.100.50)
    for (let i = 0; i < 8; i++) {
      const res = await clickRoute(
        new NextRequest(url, {
          method: "POST",
          headers: {
            origin: "https://deals.madhudadi.in",
            "user-agent": humanUa,
            "x-forwarded-for": "198.51.100.50",
          },
        }),
        { params: Promise.resolve({ id: dealId }) }
      );
      assertEqual(res.status, 200, `human request ${i + 3} allowed within limit`);
    }

    // 11th human request from same IP → 429 Too Many Requests
    const rateLimitedRes = await clickRoute(
      new NextRequest(url, {
        method: "POST",
        headers: {
          origin: "https://deals.madhudadi.in",
          "user-agent": humanUa,
          "x-forwarded-for": "198.51.100.50",
        },
      }),
      { params: Promise.resolve({ id: dealId }) }
    );
    assertEqual(rateLimitedRes.status, 429, "11th human request from same IP → 429");

    // Distinct IP human request → 200 (rate limit is per-IP)
    const otherIpRes = await clickRoute(
      new NextRequest(url, {
        method: "POST",
        headers: {
          origin: "https://deals.madhudadi.in",
          "user-agent": humanUa,
          "x-forwarded-for": "198.51.100.51",
        },
      }),
      { params: Promise.resolve({ id: dealId }) }
    );
    assertEqual(otherIpRes.status, 200, "human request from distinct IP → 200");

    const finalRow = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { clicks: true },
    });
    assertEqual(
      finalRow?.clicks,
      baseClicks + 10,
      "click counter incremented exactly by the accepted human POSTs (1 + 8 + 1)"
    );

    await prisma.$disconnect();
    console.log(
      "OK: click endpoint (origin guard, bot filtering, rate limiting, and click counter)"
    );
  } finally {
    delete (process.env as { NODE_ENV?: string }).NODE_ENV;
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

