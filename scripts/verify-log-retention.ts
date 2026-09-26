/**
 * Log retention >= 180d (F055, DE-portion).
 *
 * WHAT THIS PROVES: docker-compose.yml pins the `json-file` driver with a
 * total retained capacity that covers 180 days at the estate planning rate,
 * and that the retention arithmetic this config was sized against is still
 * documented in docs/ops/log-retention.md.
 *
 * WHY A GATE AT ALL: the Docker default is NO rotation, and the caps are
 * easy to "optimize" away — one well-meaning `max-file: 30` silently drops
 * the retained window to 17 days and nobody notices until an incident needs
 * the logs. The caps are a control, so they get a control test.
 *
 * The bound used here (7,000 MB -> >= 180 days at 35 MB/day) is the estate
 * figure from Adticks/docker-compose.prod.yml with a margin; this app
 * measured 0 B of log output per 300 page views, so the real window is far
 * longer. See docs/ops/log-retention.md for the measurement.
 *
 * Run: pnpm test:log-retention
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

/** Parse a docker size such as "20m"/"350"/"1g" into MB. */
function sizeToMb(raw: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*([kmg]?)b?$/i.exec(raw.trim());
  assert(m, `unparseable size "${raw}"`);
  const n = Number(m[1]);
  assert(Number.isFinite(n) && n > 0, `non-positive size "${raw}"`);
  switch ((m[2] ?? "").toLowerCase()) {
    case "g":
      return n * 1024;
    case "m":
      return n;
    case "k":
      return n / 1024;
    default:
      return n / (1024 * 1024);
  }
}

/** The `deals` service block — the only service in this compose file. */
function readDealsService(): string {
  const compose = readFileSync(join(repoRoot, "docker-compose.yml"), "utf8");
  const start = compose.indexOf("\nservices:");
  assert(start >= 0, "docker-compose.yml has no services: block");
  const dealStart = compose.indexOf("\n  deals:", start);
  assert(dealStart >= 0, "docker-compose.yml has no `deals` service");
  // Up to the next top-level key (volumes:, networks:) or EOF.
  const rest = compose.slice(dealStart + 1);
  const end = rest.search(/^\S/m);
  return end === -1 ? rest : rest.slice(0, end);
}

function main(): void {
  const deals = readDealsService();

  // ── 1. Driver pinned ──
  const driver = /logging:\s*\n\s*driver:\s*([\w-]+)/.exec(deals);
  assert(driver, "deals service pins no logging.driver — the Docker default is NO rotation");
  assert(
    driver[1] === "json-file",
    `logging.driver must be json-file (got "${driver[1]}") — other drivers have different rotation semantics`
  );

  // ── 2. Both caps present and numeric ──
  const maxSize = /max-size:\s*["']?([\d.]+\s*[kmg]?)["']?/i.exec(deals);
  const maxFile = /max-file:\s*["']?(\d+)["']?/i.exec(deals);
  assert(maxSize, "logging.options.max-size missing — unbounded single log file");
  assert(maxFile, "logging.options.max-file missing — no rotation at all (Docker default)");

  const perFileMb = sizeToMb(maxSize[1]);
  const files = Number(maxFile[1]);
  assert(files >= 2, `max-file must keep more than one rotated file (got ${files})`);

  // ── 3. Capacity yields >= 180 days at the estate planning rate ──
  // Estate figure: Adticks measured 34.6 MB/day/service; we test the round,
  // slightly conservative 35 MB/day so a future trim is caught, not the
  // current slack absorbed.
  const capacityMb = perFileMb * files;
  const planningMbPerDay = 35;
  const retainedDays = capacityMb / planningMbPerDay;
  assert(
    capacityMb >= 180 * planningMbPerDay,
    `retained capacity ${capacityMb} MB (max-size ${maxSize[1]} x max-file ${files}) is only ` +
      `${retainedDays.toFixed(0)} days at the ${planningMbPerDay} MB/day planning rate — must be >= 180 days. ` +
      "Raise max-file (retention scales linearly) per docs/ops/log-retention.md."
  );

  // ── 4. F010 hardening still present (the two findings ship together) ──
  assert(/no-new-privileges/.test(deals), "security_opt no-new-privileges missing (F010 regression)");
  assert(/cap_drop:/.test(deals), "cap_drop missing (F010 regression)");
  assert(/read_only:\s*true/.test(deals), "read_only: true missing (F010 regression)");

  // ── 5. The arithmetic is documented, so the caps are never tuned blind ──
  const doc = readFileSync(join(repoRoot, "docs/ops/log-retention.md"), "utf8");
  assert(doc.includes(">= 180"), "docs/ops/log-retention.md must state the >= 180d requirement");
  assert(
    doc.includes("300 page views"),
    "docs/ops/log-retention.md must record the measured 0 B/300-views evidence"
  );

  console.log(
    `[log-retention] OK driver=json-file max-size=${maxSize[1]} max-file=${files} -> ` +
      `capacity=${capacityMb} MB, retained=${retainedDays.toFixed(0)} days @ ${planningMbPerDay} MB/day (>= 180d)`
  );
}

main();
