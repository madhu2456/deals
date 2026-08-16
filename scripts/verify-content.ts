/**
 * Smoke-test content modules without a full Next server.
 * Run: pnpm exec tsx scripts/verify-content.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCategoryIntro } from "../lib/category-intro";
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_NAME_SHORT } from "../lib/site";
import { SECURITY_AND_PRIVACY_SEO } from "../lib/categories";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function assertMatch(text: string, pattern: RegExp, msg: string): void {
  assert(pattern.test(text), msg);
}

// ── Site config ──
assert(SITE_NAME === "Deals by Madhu Dadi", "SITE_NAME brand");
assert(SITE_NAME_SHORT === "Deals", "SITE_NAME_SHORT");
assert(SITE_NAME.length <= 60, "SITE_NAME ≤ 60 chars");
assert(SITE_NAME.includes("Madhu Dadi"), "SITE_NAME contains author");
assert(SITE_DESCRIPTION.length >= 80 && SITE_DESCRIPTION.length <= 160, "SITE_DESCRIPTION ~120-char complete sentence");
assert(/[.!?]$/.test(SITE_DESCRIPTION.trim()), "SITE_DESCRIPTION ends on a sentence");
assert(!/udemy/i.test(SITE_DESCRIPTION), "SITE_DESCRIPTION has no Udemy");
assert(!/exclusive/i.test(SITE_DESCRIPTION), "SITE_DESCRIPTION has no exclusive");
assert(SITE_KEYWORDS.every((k) => !/exclusive/i.test(k)), "SITE_KEYWORDS has no exclusive");

// Public copy + seed must not invent exclusivity (no deal record proves it).
const repoRoot = join(__dirname, "..");
const noExclusiveSurfaces = [
  "app/about/page.tsx",
  "app/submit/page.tsx",
  "lib/seo/json-ld.tsx",
  "lib/site.ts",
  "lib/category-intro.ts",
  "app/opengraph-image.tsx",
  "prisma/seed.ts",
] as const;
for (const rel of noExclusiveSurfaces) {
  const src = readFileSync(join(repoRoot, rel), "utf8");
  assert(!/exclusive/i.test(src), `${rel} has no exclusive`);
}

assert(SECURITY_AND_PRIVACY_SEO.h1 === "Security and privacy deals", "VPN owner H1");
assert(/password-manager/i.test(SECURITY_AND_PRIVACY_SEO.description), "VPN owner meta names password managers");
assert(/VPN/i.test(SECURITY_AND_PRIVACY_SEO.description), "VPN owner meta names VPN");
assert(
  SECURITY_AND_PRIVACY_SEO.description.includes("reviewed"),
  "VPN owner meta is a sentence, not a title clone"
);

// ── Category intro: zero deals ──
const zero = buildCategoryIntro({ name: "Travel", dealCount: 0, brandNames: [] });
assertMatch(zero.heading, /What Travel deals/, "zero heading");
assert(zero.body.includes("no live"), "zero body has 'no live'");
assert(zero.bullets.length === 3, "3 bullets always");
assert(zero.lead.length > 20, "zero lead non-empty");

// ── Category intro: one deal ──
const one = buildCategoryIntro({ name: "Food", dealCount: 1, brandNames: ["Swiggy"] });
assertMatch(one.body, /there is 1 live/i, "one body singular");
assertMatch(one.body, /including Swiggy/, "one body brand");
assert(!one.body.includes("no live"), "one body not 'no live'");

// ── Category intro: multiple deals with brands ──
const multi = buildCategoryIntro({
  name: "Electronics",
  dealCount: 5,
  brandNames: ["Amazon", "Flipkart", "Croma"],
});
assertMatch(multi.body, /there are 5 live/i, "multi body count");
assertMatch(multi.body, /Amazon.*Flipkart.*Croma/, "multi body brands");
assertMatch(multi.lead, /human-reviewed/i, "lead mentions review");
assert(!/exclusive/i.test(multi.lead), "category lead has no exclusive");
assert(multi.bullets[0].includes("approved"), "bullet 0 includes approved");

// ── Category intro: empty/missing fields ──
const empty = buildCategoryIntro({ name: "", dealCount: -1, brandNames: [""] });
assertMatch(empty.heading, /What this category/, "empty name fallback");
assert(empty.lead.length > 40, "empty description fallback lead");
assert(empty.body.includes("no live"), "negative count → zero body");

// ── Category intro: description override ──
const withDesc = buildCategoryIntro({
  name: "Gadgets",
  dealCount: 3,
  brandNames: [],
  description: "Curated gadget deals hand-picked weekly.",
});
assert(withDesc.lead.includes("Curated gadget deals"), "description override used");

// ── Category intro: brand limit (max 5) ──
const manyBrands = buildCategoryIntro({
  name: "Books",
  dealCount: 10,
  brandNames: ["A", "B", "C", "D", "E", "F", "G"],
});
const brandMentions = (manyBrands.body.match(/including/g) || []).length;
assert(brandMentions <= 1, "brand list mentioned once");
// Should only include first 5
assert(manyBrands.body.includes("A, B, C, D and E"), "only 5 brands");

console.log("OK: content modules verified (category-intro + site config)");
