/**
 * Seed idempotency regression (F-DEAL-010): prisma/seed.ts must be
 * create-if-missing ONLY — re-running it must never re-stamp status /
 * approvedAt / updatedAt or overwrite content of existing rows.
 *
 * Strategy: copies the local dev DB (or creates a fresh one via `prisma
 * migrate deploy` when no DB exists — CI-safe), points DATABASE_URL at the
 * copy, then:
 *   1. runs `tsx prisma/seed.ts` (baseline snapshot)
 *   2. mutates one row via Prisma (REJECTED + fixed approvedAt + custom title)
 *   3. runs the seed again
 *   4. asserts NOTHING changed: all rows byte-identical, the mutated row still
 *      REJECTED with the custom title, row count unchanged
 *
 * The live DB is never touched — only a temp-file copy.
 *
 * Run: pnpm test:seed-idempotency
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
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

function runSeed(dbUrl: string): void {
  execFileSync(TSX_BIN, ["prisma/seed.ts"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "inherit",
  });
}

/** Resolve the source DB path from DATABASE_URL (relative = under prisma/) or the repo default. */
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

const SNAPSHOT_FIELDS = {
  slug: true,
  status: true,
  approvedAt: true,
  updatedAt: true,
  title: true,
  shortDescription: true,
  description: true,
  brandName: true,
  brandUrl: true,
  logoUrl: true,
  dealUrl: true,
  discountType: true,
  discountValue: true,
  originalPrice: true,
  discountedPrice: true,
  categoryId: true,
  isFeatured: true,
  couponCode: true,
  notes: true,
} as const;

async function main(): Promise<void> {
  assert(existsSync(TSX_BIN), `tsx not found at ${TSX_BIN} — run pnpm install`);
  assert(existsSync(PRISMA_BIN), `prisma not found at ${PRISMA_BIN} — run pnpm install`);

  const workDir = mkdtempSync(join(tmpdir(), "deals-seed-idem-"));
  const dbPath = join(workDir, "idem.db");
  const dbUrl = `file:${dbPath}`;

  try {
    const source = resolveSourceDb();
    if (source) {
      copyFileSync(source, dbPath);
      // Carry over WAL/SHM companions when the source is a live database.
      for (const suffix of ["-wal", "-shm", "-journal"]) {
        if (existsSync(source + suffix)) copyFileSync(source + suffix, dbPath + suffix);
      }
      console.log(`Using copy of ${source} → ${dbPath}`);
    } else {
      console.log("No source DB found — creating fresh DB via prisma migrate deploy");
      execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: dbUrl },
        stdio: "inherit",
      });
    }

    // Env must be set BEFORE importing lib/prisma below.
    process.env.DATABASE_URL = dbUrl;

    console.log("Seed run #1 (baseline)...");
    runSeed(dbUrl);

    const { prisma } = await import("../lib/prisma");

    async function snapshot(): Promise<{ rows: Map<string, string>; count: number }> {
      const deals = await prisma.deal.findMany({
        select: SNAPSHOT_FIELDS,
        orderBy: { slug: "asc" },
      });
      const rows = new Map<string, string>();
      for (const d of deals) {
        const normalized = {
          slug: d.slug,
          status: d.status,
          approvedAt: d.approvedAt?.toISOString() ?? null,
          updatedAt: d.updatedAt?.toISOString() ?? null,
          title: d.title,
          shortDescription: d.shortDescription,
          description: d.description,
          brandName: d.brandName,
          brandUrl: d.brandUrl,
          logoUrl: d.logoUrl,
          dealUrl: d.dealUrl,
          discountType: d.discountType,
          discountValue: d.discountValue,
          originalPrice: d.originalPrice,
          discountedPrice: d.discountedPrice,
          categoryId: d.categoryId,
          isFeatured: d.isFeatured,
          couponCode: d.couponCode,
          notes: d.notes,
        };
        rows.set(d.slug, JSON.stringify(normalized));
      }
      return { rows, count: deals.length };
    }

    // Mutate one live row so the next seed run has a row to (wrongly) clobber.
    // Snapshot AFTER the mutation: the baseline must include it, because the
    // whole point is that re-running the seed changes NOTHING.
    const mutatedSlug = (await prisma.deal.findFirst({ select: { slug: true } }))?.slug;
    assert(mutatedSlug !== undefined, "at least one deal row exists to mutate");
    const mutatedTitle = "CUSTOM TITLE — seed must not overwrite";
    await prisma.deal.update({
      where: { slug: mutatedSlug },
      data: {
        status: "REJECTED",
        approvedAt: new Date("2020-01-01T00:00:00.000Z"),
        title: mutatedTitle,
      },
    });

    const before = await snapshot();
    assert(before.count > 0, `seed produced deals (got ${before.count})`);

    console.log("Seed run #2 (after mutation)...");
    runSeed(dbUrl);

    const after = await snapshot();

    assertEqual(after.count, before.count, "row count unchanged (no duplicates)");
    for (const [slug, json] of before.rows) {
      assert(
        after.rows.get(slug) === json,
        `row ${slug} unchanged across re-seed (status/approvedAt/updatedAt/content)`
      );
    }

    const mutated = await prisma.deal.findUnique({
      where: { slug: mutatedSlug },
      select: { status: true, approvedAt: true, title: true },
    });
    assertEqual(mutated?.status, "REJECTED", "mutated row stays REJECTED (seed must not re-approve)");
    assertEqual(
      mutated?.approvedAt?.toISOString(),
      "2020-01-01T00:00:00.000Z",
      "mutated row approvedAt not re-stamped"
    );
    assertEqual(mutated?.title, mutatedTitle, "mutated row title not overwritten");

    await prisma.$disconnect();
    console.log("OK: seed is create-if-missing — re-seeds never clobber existing rows");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
