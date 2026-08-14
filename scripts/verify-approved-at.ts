/**
 * F-DEAL-012: admin-created APPROVED deals must carry an approvedAt
 * timestamp (drives getLatestDeals ordering + JSON-LD validFrom); PENDING
 * rows must keep approvedAt null.
 *
 *  1. Static: lib/actions.ts adminCreateDealAction derives approvedAt from
 *     the submitted status, and adminUpdateDealAction still preserves the
 *     original timestamp on edits (never re-stamps an already-approved row).
 *  2. DB (temp copy — never the live DB): create an APPROVED row the same
 *     way the action does → appears in getLatestDeals and offerSchema()
 *     validFrom === approvedAt; create a PENDING row → approvedAt stays null
 *     and the row is excluded from getLatestDeals.
 *
 * When no dev.db exists (fresh CI checkout — prisma/*.db is gitignored), the
 * temp DB is provisioned via `prisma migrate deploy` + `tsx prisma/seed.ts`
 * before the checks run, so the asserts always have rows to work with.
 *
 * Run: pnpm test:approved-at
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
  // ── 1. Static guards on lib/actions.ts ──
  const actions = readFileSync(join(repoRoot, "lib", "actions.ts"), "utf8");
  assert(
    actions.includes('const approvedAt = data.deal.status === "APPROVED" ? new Date() : null;'),
    "adminCreateDealAction sets approvedAt for APPROVED, null otherwise"
  );
  assert(
    actions.includes('await createDeal({ ...data.deal, slug, approvedAt });'),
    "adminCreateDealAction passes approvedAt into createDeal"
  );
  assert(
    actions.includes('if (deal.status !== "APPROVED" || !deal.approvedAt)'),
    "adminUpdateDealAction preserves the original approval timestamp on edits"
  );

  // ── 2. DB-backed behavior ──
  const workDir = mkdtempSync(join(tmpdir(), "deals-approved-at-"));
  const dbPath = join(workDir, "approved-at.db");
  const dbUrl = `file:${dbPath}`;

  try {
    const source = resolveSourceDb();
    if (source) {
      copyFileSync(source, dbPath);
      for (const suffix of ["-wal", "-shm", "-journal"]) {
        if (existsSync(source + suffix)) copyFileSync(source + suffix, dbPath + suffix);
      }
      // Bring the copy up to the latest schema on the scratch DB only.
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

    process.env.DATABASE_URL = dbUrl;

    const { prisma } = await import("../lib/prisma");
    const { getLatestDeals } = await import("../lib/data");
    const { offerSchema } = await import("../lib/seo/json-ld");

    const category = await prisma.category.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    assert(category !== null, "an active category exists for the test rows");

    const approvedAt = new Date("2026-08-13T12:00:00.000Z");
    const approved = await prisma.deal.create({
      data: {
        title: "Approved-At Test Deal",
        slug: `approved-at-test-${Date.now()}`,
        description: "Created directly to mirror the admin create action path.",
        shortDescription: "Created directly to mirror the admin create action path.",
        categoryId: category.id,
        brandName: "Test Brand",
        dealUrl: "https://example.com/test-offer",
        discountType: "OTHER",
        status: "APPROVED",
        approvedAt,
      },
    });

    const pending = await prisma.deal.create({
      data: {
        title: "Pending Test Deal",
        slug: `pending-test-${Date.now()}`,
        description: "Created directly to mirror the admin create action path.",
        shortDescription: "Created directly to mirror the admin create action path.",
        categoryId: category.id,
        brandName: "Test Brand",
        dealUrl: "https://example.com/pending-offer",
        discountType: "OTHER",
        status: "PENDING",
        approvedAt: null,
      },
    });

    // APPROVED + approvedAt → appears in getLatestDeals, JSON-LD validFrom set.
    const latest = await getLatestDeals(25);
    const inLatest = latest.find((d) => d.id === approved.id);
    assert(inLatest !== undefined, "APPROVED deal with approvedAt appears in getLatestDeals");
    assert(
      latest.find((d) => d.id === pending.id) === undefined,
      "PENDING deal is excluded from getLatestDeals"
    );

    const schema = offerSchema({
      title: approved.title,
      slug: approved.slug,
      description: approved.description,
      brandName: approved.brandName,
      dealUrl: approved.dealUrl,
      discountType: approved.discountType,
      category: { name: "Test", slug: "test" },
      updatedAt: approved.updatedAt,
      approvedAt,
    });
    assertEqual(schema.offers.validFrom, approvedAt.toISOString(), "JSON-LD validFrom = approvedAt");

    const pendingRow = await prisma.deal.findUnique({
      where: { id: pending.id },
      select: { approvedAt: true },
    });
    assertEqual(pendingRow?.approvedAt, null, "PENDING row keeps approvedAt null");

    // PENDING rows never render JSON-LD (getDealBySlug filters APPROVED), so
    // the offerSchema fallback (approvedAt → updatedAt) is legacy-row only —
    // still asserted so the fallback stays honest, not a clock value.
    const pendingSchema = offerSchema({
      title: pending.title,
      slug: pending.slug,
      description: pending.description,
      brandName: pending.brandName,
      dealUrl: pending.dealUrl,
      discountType: pending.discountType,
      category: { name: "Test", slug: "test" },
      updatedAt: pending.updatedAt,
      approvedAt: null,
    });
    assertEqual(
      pendingSchema.offers.validFrom,
      pending.updatedAt.toISOString(),
      "offerSchema fallback for null approvedAt = updatedAt (legacy rows only)"
    );

    await prisma.$disconnect();
    console.log("OK: admin-created APPROVED deal carries approvedAt; PENDING stays null");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
