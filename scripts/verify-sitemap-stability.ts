/**
 * Sitemap lastmod stability (F-DEAL-002 / IER9).
 *
 * No deploy-time restamp may remain: sitemap lastmod for deal/category rows
 * must derive from DB columns (updatedAt/approvedAt), never from the clock,
 * and two consecutive seeds/deploys must leave lastmod unchanged for
 * unchanged rows.
 *
 * Checks:
 *  1. Static source guard on app/sitemap.ts: dynamic entries derive lastmod
 *     from DB fields; `lastModified: now` appears ONLY on the 3 static
 *     routes; no `lastModified: new Date()` churn pattern.
 *  2. DB-backed double-seed (temp DB copy — never the live DB): run the seed
 *     twice, derive the exact sitemap lastmod map (deals + categories) both
 *     times, assert byte-identical. Proves two consecutive seeds leave
 *     sitemap lastmod unchanged for unchanged rows (F-DEAL-010 companion).
 *  3. Optional live fetch: SITEMAP_URL=http://localhost:3000/sitemap.xml
 *     (or the prod URL) parses <lastmod> and flags any /deals/ or
 *     /categories/ lastmod within CHURN_WINDOW_MINUTES (default 30) of fetch
 *     time — the "lastmod == deploy time" churn pattern. With DATABASE_URL
 *     also set, diffs every deal/category lastmod against the DB-derived
 *     value. Skipped when SITEMAP_URL is unset (test:all stays network-free).
 *
 * Run: pnpm test:sitemap-stability
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";

const repoRoot = join(__dirname, "..");
const TSX_BIN = join(repoRoot, "node_modules", ".bin", "tsx");
const PRISMA_BIN = join(repoRoot, "node_modules", ".bin", "prisma");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function assertEqual(actual: unknown, expected: unknown, msg: string): void {
  assert(actual === expected, `${msg} (expected ${String(expected)}, got ${String(actual)})`);
}

function runSeed(dbUrl: string): void {
  execFileSync(TSX_BIN, ["prisma/seed.ts"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "inherit",
  });
}

/** Resolve the source DB path (same strategy as verify-seed-idempotency.ts). */
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

/**
 * Exact mirror of app/sitemap.ts lastmod derivation (updatedAt || approvedAt).
 * The client is passed in so callers control which DB it is bound to: the
 * temp-DB module singleton here, or a fresh client on the live DB.
 */
async function deriveLastmodMap(prismaClient: PrismaClient) {
  const now = new Date();
  const [deals, categories] = await Promise.all([
    prismaClient.deal.findMany({
      select: {
        slug: true,
        status: true,
        expiryDate: true,
        updatedAt: true,
        approvedAt: true,
      },
    }),
    prismaClient.category.findMany({ select: { slug: true, updatedAt: true } }),
  ]);

  const dealMap = new Map<string, string>();
  for (const d of deals) {
    if (d.status !== "APPROVED") continue;
    if (d.expiryDate && d.expiryDate <= now) continue; // approvedNotExpired filter
    const lm = d.updatedAt ?? d.approvedAt ?? now; // mirrors `d.updatedAt || d.approvedAt || now`
    dealMap.set(d.slug, lm.toISOString());
  }
  const categoryMap = new Map<string, string>();
  for (const c of categories) {
    categoryMap.set(c.slug, (c.updatedAt ?? now).toISOString()); // mirrors `c.updatedAt ?? now`
  }
  return { dealMap, categoryMap };
}

function mapsEqual(
  a: Map<string, string>,
  b: Map<string, string>
): { equal: boolean; diffs: string[] } {
  const diffs: string[] = [];
  for (const [k, v] of a) {
    if (b.get(k) !== v) diffs.push(`${k}: ${v} != ${b.get(k) ?? "<missing>"}`);
  }
  for (const k of b.keys()) {
    if (!a.has(k)) diffs.push(`${k}: added in second run`);
  }
  return { equal: diffs.length === 0, diffs };
}

async function main(): Promise<void> {
  assert(existsSync(TSX_BIN), `tsx not found at ${TSX_BIN} — run pnpm install`);
  assert(existsSync(PRISMA_BIN), `prisma not found at ${PRISMA_BIN} — run pnpm install`);

  // ── 1. Static source guard: no deploy-time restamp in app/sitemap.ts ──
  const sitemapSrc = readFileSync(join(repoRoot, "app", "sitemap.ts"), "utf8");
  assert(
    sitemapSrc.includes("d.updatedAt || d.approvedAt"),
    "deal lastmod derives from DB columns (updatedAt || approvedAt)"
  );
  assert(sitemapSrc.includes("c.updatedAt"), "category lastmod derives from updatedAt");
  assert(
    !/lastModified:\s*new Date\(\)/.test(sitemapSrc),
    "no `lastModified: new Date()` deploy-time churn pattern"
  );
  // Exactly the 3 static routes may stamp `now`.
  assertEqual(
    (sitemapSrc.match(/lastModified:\s*now/g) ?? []).length,
    3,
    "`lastModified: now` appears only on the 3 static routes"
  );
  assert(
    sitemapSrc.includes('dynamic = "force-dynamic"'),
    "sitemap stays force-dynamic (per-request DB read, cache via header)"
  );

  // ── 2. DB-backed double-seed: two seeds → identical lastmod derivation ──
  const workDir = mkdtempSync(join(tmpdir(), "deals-sitemap-"));
  const dbPath = join(workDir, "sitemap.db");
  const dbUrl = `file:${dbPath}`;
  // Saved so the live-DB section below runs against the caller's DATABASE_URL,
  // not the temp DB this section clobbers into the env.
  const originalDbUrl = process.env.DATABASE_URL;

  try {
    const source = resolveSourceDb();
    if (source) {
      copyFileSync(source, dbPath);
      for (const suffix of ["-wal", "-shm", "-journal"]) {
        if (existsSync(source + suffix)) copyFileSync(source + suffix, dbPath + suffix);
      }
      console.log(`Using copy of ${source} → ${dbPath}`);
      // Bring the copy up to the latest schema on the scratch DB only.
      execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: dbUrl },
        stdio: "inherit",
      });
    } else {
      console.log("No source DB found — creating fresh DB via prisma migrate deploy");
      execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: dbUrl },
        stdio: "inherit",
      });
    }

    process.env.DATABASE_URL = dbUrl;
    const { prisma } = await import("../lib/prisma");

    console.log("Seed run #1...");
    runSeed(dbUrl);
    const first = await deriveLastmodMap(prisma);

    console.log("Seed run #2 (unchanged rows must keep lastmod)...");
    runSeed(dbUrl);
    const second = await deriveLastmodMap(prisma);

    const dealDiff = mapsEqual(first.dealMap, second.dealMap);
    const catDiff = mapsEqual(first.categoryMap, second.categoryMap);
    assert(
      dealDiff.equal,
      `deal lastmod changed across re-seed (F-DEAL-010 restamp):\n  ${dealDiff.diffs.join("\n  ")}`
    );
    assert(
      catDiff.equal,
      `category lastmod changed across re-seed:\n  ${catDiff.diffs.join("\n  ")}`
    );
    assertEqual(
      first.dealMap.size,
      second.dealMap.size,
      "same number of sitemap deal entries across re-seeds"
    );

    // JSON-LD dateModified/validFrom derive from the same columns — spot-check.
    const { offerSchema } = await import("../lib/seo/json-ld");
    const row = await prisma.deal.findFirst({ where: { status: "APPROVED" } });
    assert(row !== null, "an approved deal exists to spot-check JSON-LD");
    const schema = offerSchema({
      title: row.title,
      slug: row.slug,
      description: row.description,
      brandName: row.brandName,
      dealUrl: row.dealUrl,
      discountType: row.discountType,
      category: { name: "x", slug: "x" },
      updatedAt: row.updatedAt,
      approvedAt: row.approvedAt,
    });
    assert(
      schema.dateModified === row.updatedAt.toISOString() &&
        schema.offers.validFrom === (row.approvedAt ?? row.updatedAt).toISOString(),
      "JSON-LD dateModified/validFrom match DB columns (no clock restamp)"
    );

    await prisma.$disconnect();
    console.log("OK: double-seed leaves sitemap lastmod derivation unchanged");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  // Restore the caller's DATABASE_URL: the temp-DB section clobbered it, and
  // the module-level lib/prisma singleton is bound to the (now deleted)
  // scratch DB — the live section must not diff against it.
  if (originalDbUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDbUrl;

  // ── 3. Optional live fetch: flag lastmod == deploy-time churn ──
  const sitemapUrl = process.env.SITEMAP_URL;
  if (!sitemapUrl) {
    console.log("SITEMAP_URL not set — skipping live sitemap fetch");
    console.log("OK: sitemap lastmod stability verified (static + double-seed)");
    return;
  }

  const res = await fetch(sitemapUrl, {
    signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": "verify-sitemap-stability/1.0 (+https://deals.madhudadi.in)" },
  });
  assert(res.ok, `sitemap fetch failed: HTTP ${res.status} from ${sitemapUrl}`);
  const xml = await res.text();
  const entries = Array.from(xml.matchAll(/<url>[\s\S]*?<\/url>/g)).map((m) => ({
    loc: m[0].match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "",
    lastmod: m[0].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? "",
  }));
  assert(entries.length > 0, "sitemap parsed with at least one <url> entry");

  const fetchedAt = new Date();
  const churnWindowMs = (Number(process.env.CHURN_WINDOW_MINUTES) || 30) * 60_000;
  const dynamic = entries.filter((e) => /\/deals\/|\/categories\//.test(e.loc) && e.lastmod);
  const churn = dynamic.filter(
    (e) => Math.abs(fetchedAt.getTime() - new Date(e.lastmod).getTime()) < churnWindowMs
  );
  assert(
    churn.length === 0,
    `deploy-time churn pattern: ${churn.length} deal/category lastmod values equal fetch time (±${churnWindowMs / 60_000} min): ${churn
      .map((c) => `${c.loc} → ${c.lastmod}`)
      .join(", ")}`
  );
  console.log(`Live sitemap: ${entries.length} entries, ${dynamic.length} dynamic, 0 churn`);

  // Optional DB diff against the serving database (read-only).
  if (process.env.DATABASE_URL) {
    // Fresh client bound to the caller's DB — the module-level lib/prisma
    // singleton is bound to the deleted temp DB and already disconnected.
    const { PrismaClient } = await import("@prisma/client");
    const live = new PrismaClient();
    try {
      const expected = await deriveLastmodMap(live);
      const mismatches: string[] = [];
      for (const e of dynamic) {
        const slug = e.loc.split("/").pop();
        if (!slug) continue;
        let want: string | undefined;
        if (e.loc.includes("/deals/")) want = expected.dealMap.get(slug);
        if (e.loc.includes("/categories/")) want = expected.categoryMap.get(slug);
        if (!want) continue;
        // 1 s tolerance: ISO serialization is identical, but allow clock skew.
        if (Math.abs(new Date(e.lastmod).getTime() - new Date(want).getTime()) > 1000) {
          mismatches.push(`${e.loc}: sitemap ${e.lastmod} != DB ${want}`);
        }
      }
      assert(
        mismatches.length === 0,
        `sitemap lastmod diverges from DB derivation:\n  ${mismatches.join("\n  ")}`
      );
      console.log(`Live DB diff: ${dynamic.length} dynamic entries match DB derivation`);
    } finally {
      await live.$disconnect();
    }
  } else {
    console.log("DATABASE_URL not set — skipping live DB diff");
  }

  console.log("OK: sitemap lastmod stability verified (static + double-seed + live)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
