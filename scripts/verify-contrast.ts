/**
 * WCAG AA contrast table for category chips + grep-delete of local helpers.
 * Run: pnpm exec tsx scripts/verify-contrast.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CATEGORIES } from "../lib/categories";
import {
  CONTRAST_DARK,
  CONTRAST_WHITE,
  MIN_CONTRAST_RATIO,
  contrastRatioHex,
  contrastText,
} from "../lib/contrast";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const repoRoot = join(__dirname, "..");

const table: Array<{ name: string; bg: string }> = [
  ...DEFAULT_CATEGORIES.map((c) => ({ name: c.name, bg: c.color })),
  { name: "white", bg: "#ffffff" },
  { name: "black", bg: "#000000" },
  { name: "mid-gray", bg: "#808080" },
  { name: "amber", bg: "#F59E0B" },
  { name: "indigo", bg: "#6366F1" },
];

for (const row of table) {
  const pair = contrastText(row.bg);
  const ratio = contrastRatioHex(pair.color, pair.backgroundColor);
  assert(ratio !== null, `${row.name}: contrast ratio computed`);
  assert(
    ratio >= MIN_CONTRAST_RATIO,
    `${row.name}: ${pair.color} on ${pair.backgroundColor} contrast ${ratio.toFixed(2)} < ${MIN_CONTRAST_RATIO}`
  );
  assert(
    pair.color === CONTRAST_WHITE || pair.color === CONTRAST_DARK,
    `${row.name}: text is only #fff or #1e1b4b`
  );
}

const whiteOnBlack = contrastText("#000000");
assert(whiteOnBlack.color === CONTRAST_WHITE, "black bg picks white text");
assert(whiteOnBlack.backgroundColor === "#000000", "black bg is not adjusted");

const darkOnWhite = contrastText("#ffffff");
assert(darkOnWhite.color === CONTRAST_DARK, "white bg picks dark text");
assert(darkOnWhite.backgroundColor === "#ffffff", "white bg is not adjusted");

const mid = contrastText("#808080");
const midRatio = contrastRatioHex(mid.color, mid.backgroundColor);
assert(midRatio !== null && midRatio >= MIN_CONTRAST_RATIO, "mid-gray is adjusted to AA");
assert(mid.backgroundColor.toLowerCase() !== "#808080", "mid-gray background is adjusted");

const sources = [
  "app/components/DealCard.tsx",
  "app/components/CategoryCard.tsx",
  "app/categories/[slug]/page.tsx",
];
for (const rel of sources) {
  const src = readFileSync(join(repoRoot, rel), "utf8");
  assert(!/function textColorFor/.test(src), `${rel} has no local textColorFor`);
  assert(/contrastText\(/.test(src), `${rel} uses shared contrastText`);
}

const dealCardSrc = readFileSync(join(repoRoot, "app/components/DealCard.tsx"), "utf8");
assert(!/text-primary\/70/.test(dealCardSrc), "DealCard Save is not text-primary/70");
assert(
  /uppercase tracking-wider text-primary/.test(dealCardSrc),
  "DealCard Save uses text-primary",
);

// Save label: --primary #4f46e5 on bg-primary/10 over white card (#edecfc).
const saveFg = "#4f46e5";
const saveBg = "#edecfc";
const saveRatio = contrastRatioHex(saveFg, saveBg);
assert(saveRatio !== null, "Save chip contrast computed");
assert(
  saveRatio >= MIN_CONTRAST_RATIO,
  `Save chip ${saveFg} on ${saveBg} contrast ${saveRatio.toFixed(2)} < ${MIN_CONTRAST_RATIO}`,
);

console.log(
  `OK: contrast AA ≥ ${MIN_CONTRAST_RATIO} on ${table.length} colors; Save ${saveRatio.toFixed(2)}:1; local textColorFor deleted`
);
