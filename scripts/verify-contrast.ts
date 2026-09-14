/**
 * WCAG AA contrast table for category chips + grep-delete of local helpers.
 * Run: pnpm exec tsx scripts/verify-contrast.ts
 */
import { readFileSync, readdirSync } from "node:fs";
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

// FM-038 AAA 7:1 badges/chips — pinned audit colors
const aaaChecks: Array<{ fg: string; bg: string; min: number; label: string }> = [
  { fg: "#7A1FA2", bg: "#ffffff", min: 7, label: "AAA badge #7A1FA2 on white" },
  { fg: "#024A8A", bg: "#ffffff", min: 7, label: "AAA badge #024A8A on white" },
];
for (const { fg, bg, min, label } of aaaChecks) {
  const r = contrastRatioHex(fg, bg);
  assert(r !== null, `${label}: ratio computed`);
  assert(r >= min, `${label}: ${r.toFixed(2)} < ${min}`);
}
// Expected pinned ratios from audit: #7A1FA2 8.25, #024A8A 8.94
const r1 = contrastRatioHex("#7A1FA2", "#ffffff");
const r2 = contrastRatioHex("#024A8A", "#ffffff");
assert(r1 !== null && Math.abs(r1 - 8.25) < 0.3, `#7A1FA2 ratio ${r1?.toFixed(2)} not ~8.25`);
assert(r2 !== null && Math.abs(r2 - 8.94) < 0.3, `#024A8A ratio ${r2?.toFixed(2)} not ~8.94`);

// ── Live destructive-text surfaces (D3 follow-up): text-red-700 light /
// dark:text-red-300 pattern pinned on the ACTUAL composited backgrounds. ──
// Compositing: destructive/10 over a base = #dc2626 at 10% alpha over the
// base (light), #ef4444 at 10-20% over the base (dark). Same math as
// lib/contrast.ts: mix fg·alpha + base·(1-alpha), then WCAG 2.1 ratio.
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}
function composite(overHex: string, alpha: number, baseHex: string): string {
  const o = hexToRgb(overHex);
  const b = hexToRgb(baseHex);
  const mix = (x: number, y: number) =>
    Math.round(x * alpha + y * (1 - alpha));
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${toHex(mix(o.r, b.r))}${toHex(mix(o.g, b.g))}${toHex(mix(o.b, b.b))}`;
}

const RED_700 = "#b91c1c";
const RED_300 = "#fca5a5";
const LIGHT_DESTRUCTIVE = "#dc2626";
const DARK_DESTRUCTIVE = "#ef4444";
const PAGE_BG_LIGHT = "#f5f3ff";
const PAGE_BG_DARK = "#0f0e2a";
const CARD_LIGHT = "#ffffff";
const CARD_DARK = "#1e1b4b";

const destructiveSurfaces: Array<{ fg: string; bg: string; label: string }> = [
  // Badge destructive variant (components/ui/badge.tsx)
  {
    fg: RED_700,
    bg: composite(LIGHT_DESTRUCTIVE, 0.1, CARD_LIGHT),
    label: "badge destructive light red-700 on destructive/10 over white",
  },
  {
    fg: RED_300,
    bg: composite(DARK_DESTRUCTIVE, 0.2, CARD_DARK),
    label: "badge destructive dark red-300 on destructive/20 over #1e1b4b",
  },
  // Admin login error banner (LoginForm.tsx): destructive/10 over card
  {
    fg: RED_700,
    bg: composite(LIGHT_DESTRUCTIVE, 0.1, CARD_LIGHT),
    label: "LoginForm error light red-700 on destructive/10 over card white",
  },
  {
    fg: RED_300,
    bg: composite(DARK_DESTRUCTIVE, 0.1, CARD_DARK),
    label: "LoginForm error dark red-300 on destructive/10 over #1e1b4b",
  },
  // Public submit-form error banners (SubmitDealForm.tsx): destructive/5 over page bg
  {
    fg: RED_700,
    bg: composite(LIGHT_DESTRUCTIVE, 0.05, PAGE_BG_LIGHT),
    label: "SubmitDealForm alert light red-700 on destructive/5 over #f5f3ff",
  },
  {
    fg: RED_300,
    bg: composite(DARK_DESTRUCTIVE, 0.05, PAGE_BG_DARK),
    label: "SubmitDealForm alert dark red-300 on destructive/5 over #0f0e2a",
  },
  // SubmitDealForm field errors: solid page bg (no destructive tint)
  { fg: RED_700, bg: PAGE_BG_LIGHT, label: "SubmitDealForm field light red-700 on #f5f3ff" },
  { fg: RED_300, bg: PAGE_BG_DARK, label: "SubmitDealForm field dark red-300 on #0f0e2a" },
  // Admin deal-form error banner (DealForm.tsx): destructive/10 over page bg
  {
    fg: RED_700,
    bg: composite(LIGHT_DESTRUCTIVE, 0.1, PAGE_BG_LIGHT),
    label: "DealForm form error light red-700 on destructive/10 over #f5f3ff",
  },
  {
    fg: RED_300,
    bg: composite(DARK_DESTRUCTIVE, 0.1, PAGE_BG_DARK),
    label: "DealForm form error dark red-300 on destructive/10 over #0f0e2a",
  },
  // Admin broken-deal badge (app/admin/page.tsx): text on solid card bg
  { fg: RED_700, bg: CARD_LIGHT, label: "admin broken badge light red-700 on #ffffff card" },
  { fg: RED_300, bg: CARD_DARK, label: "admin broken badge dark red-300 on #1e1b4b card" },
];

const destructiveRatios: string[] = [];
for (const { fg, bg, label } of destructiveSurfaces) {
  const r = contrastRatioHex(fg, bg);
  assert(r !== null, `${label}: ratio computed`);
  assert(
    r >= MIN_CONTRAST_RATIO,
    `${label}: ${fg} on ${bg} contrast ${r.toFixed(2)} < ${MIN_CONTRAST_RATIO}`
  );
  destructiveRatios.push(`${label.split(" light ")[0].split(" dark ")[0]}=${r.toFixed(2)}`);
}

// The fixed tokens must be present in the live sources (guards against
// regression back to raw text-destructive on these surfaces).
const liveSources: Array<{ rel: string; needle: string }> = [
  {
    rel: "app/admin/login/LoginForm.tsx",
    needle: "bg-destructive/10 p-3 text-sm text-red-700 dark:text-red-300",
  },
  {
    rel: "app/submit/SubmitDealForm.tsx",
    needle: "bg-destructive/5 p-4 text-sm text-red-700 dark:text-red-300",
  },
  {
    rel: "app/admin/components/DealForm.tsx",
    needle: "bg-destructive/10 p-3 text-sm text-red-700 dark:text-red-300",
  },
  {
    rel: "app/admin/page.tsx",
    needle: "border-destructive/40 text-red-700 dark:text-red-300",
  },
  {
    rel: "components/ui/badge.tsx",
    needle: "bg-destructive/10 text-red-700",
  },
];
for (const { rel, needle } of liveSources) {
  const src = readFileSync(join(repoRoot, rel), "utf8");
  assert(src.includes(needle), `${rel} keeps the AA destructive-text tokens`);
}

// ── Negative sweep (D3 loop 2): no raw destructive-TEXT tokens may appear in
// app/ or components/ sources outside an explicit allowlist. Catches new
// regressions of the exact class fixed in D3 (raw text-destructive /
// hover:text-destructive). Scope: TEXT tokens only (text-destructive,
// hover:text-destructive, focus:text-destructive, …); NOT bg-/ring-/border-
// destructive (those are fills/outlines, not text) and not dark:-only
// variants which are always paired with a light-mode counterpart token.
// Allowlist rationale:
// - app/admin/AdminActions.tsx:71 — icon-only Trash2 delete button (aria-label
//   "Delete deal", no visible text). WCAG 1.4.11 non-text contrast ≥3:1:
//   #dc2626 on light bgs 4.40–4.83:1; #ef4444 on dark bgs 4.25–5.00:1 — all
//   pass, and 1.4.11 (not 1.4.3 4.5:1 text) governs icon-only affordances.
// - components/ui/dropdown-menu.tsx / badge.tsx destructive VARIANTS use
//   data-[variant=destructive]:text-destructive / aria-invalid tokens —
//   dormant UI-primitive styling hooks with zero call sites passing the
//   destructive variant in this repo (verified: no variant="destructive"
//   usages exist in app/), so no rendered text uses them.
const ALLOWED_DESTRUCTIVE_TEXT: Array<{ rel: string; why: string }> = [
  {
    rel: "app/admin/AdminActions.tsx",
    why: "icon-only delete button — WCAG 1.4.11 ≥3:1 (4.40–5.00:1 both modes)",
  },
  {
    rel: "components/ui/dropdown-menu.tsx",
    why: "dormant variant hook — zero destructive-variant call sites in app/",
  },
  {
    rel: "components/ui/badge.tsx",
    why: "dormant aria-invalid/variant hook — zero destructive-variant call sites",
  },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...walk(full));
    } else if (/\.(tsx|ts)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const sweepDirs = [join(repoRoot, "app"), join(repoRoot, "components")];
const allowedRels = new Set(ALLOWED_DESTRUCTIVE_TEXT.map((a) => a.rel));
const offenders: string[] = [];
for (const dir of sweepDirs) {
  for (const file of walk(dir)) {
    const rel = file.slice(repoRoot.length + 1);
    const src = readFileSync(file, "utf8");
    // Strip comments (WCAG rationale notes mention the token without using it)
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const usesDestructiveText = /(?<![\w-])((?:hover|focus|active|group-hover|data-\[[^\]]*\]|aria-invalid):)*text-destructive(?![\w-])/.test(code);
    const onAllowlist = allowedRels.has(rel);
    if (usesDestructiveText && !onAllowlist) {
      offenders.push(rel);
    }
  }
}
assert(
  offenders.length === 0,
  `negative sweep: raw destructive-TEXT tokens found (off allowlist) in: ${offenders.join(", ")}`
);
if (offenders.length > 0) {
  offenders.forEach((rel) => console.error(`  offender: ${rel}`));
}

console.log(
  `OK: contrast AA ≥ ${MIN_CONTRAST_RATIO} on ${table.length} colors; Save ${saveRatio.toFixed(2)}:1; AAA #7A1FA2 ${r1?.toFixed(2)}:1 #024A8A ${r2?.toFixed(2)}:1; destructive surfaces ${destructiveRatios.length} pairs ≥ ${MIN_CONTRAST_RATIO} (badge ${contrastRatioHex(RED_700, composite(LIGHT_DESTRUCTIVE, 0.1, CARD_LIGHT))?.toFixed(2)}/${contrastRatioHex(RED_300, composite(DARK_DESTRUCTIVE, 0.2, CARD_DARK))?.toFixed(2)}, login ${contrastRatioHex(RED_700, composite(LIGHT_DESTRUCTIVE, 0.1, CARD_LIGHT))?.toFixed(2)}/${contrastRatioHex(RED_300, composite(DARK_DESTRUCTIVE, 0.1, CARD_DARK))?.toFixed(2)}, submit ${contrastRatioHex(RED_700, composite(LIGHT_DESTRUCTIVE, 0.05, PAGE_BG_LIGHT))?.toFixed(2)}/${contrastRatioHex(RED_300, composite(DARK_DESTRUCTIVE, 0.05, PAGE_BG_DARK))?.toFixed(2)}, dealform ${contrastRatioHex(RED_700, composite(LIGHT_DESTRUCTIVE, 0.1, PAGE_BG_LIGHT))?.toFixed(2)}/${contrastRatioHex(RED_300, composite(DARK_DESTRUCTIVE, 0.1, PAGE_BG_DARK))?.toFixed(2)}, admin badge ${contrastRatioHex(RED_700, CARD_LIGHT)?.toFixed(2)}/${contrastRatioHex(RED_300, CARD_DARK)?.toFixed(2)}); local textColorFor deleted`
);
