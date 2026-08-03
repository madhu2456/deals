/**
 * Smoke-test format helpers used across deal pages + lists.
 * Run: pnpm exec tsx scripts/verify-format.ts
 */
import { formatDate, formatRelativeDate, discountLabel, statusColor } from "../lib/format";
import { SITE_LANGUAGE } from "../lib/site";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function assertMatch(text: string | null, pattern: RegExp, msg: string): void {
  assert(text !== null && pattern.test(text), msg);
}

// ── formatDate ──
const d1 = formatDate("2026-07-30T12:00:00Z");
assert(d1 !== null, "formatDate string input");
assertMatch(d1!, /\d{1,2}\s\w{3}\s\d{4}/, `formatDate output format: ${d1}`); // e.g. "30 Jul 2026"
// locale check: SITE_LANGUAGE is en-IN so month should be abbreviated in English
assert(d1!.includes("Jul") || d1!.includes("Dec"), "formatDate month abbreviation");

const d2 = formatDate(new Date("2026-01-15T00:00:00Z"));
assert(d2 !== null, "formatDate Date input");
assert(d2!.includes("2026"), "formatDate year present");

const dNull = formatDate(null);
assert(dNull === null, "formatDate null → null");

const dUndef = formatDate(undefined);
assert(dUndef === null, "formatDate undefined → null");

const dBad = formatDate("not-a-date");
assert(dBad === null, "formatDate invalid string → null");

// ── formatRelativeDate ──
// Future: 3 days ahead
const threeDays = new Date();
threeDays.setDate(threeDays.getDate() + 3);
const rel = formatRelativeDate(threeDays.toISOString());
assertMatch(rel, /Ends in 3 days/, `relative 3 days: ${rel}`);

// Today (1 second in the past so diffDays = 0 after Math.ceil)
const today = new Date(Date.now() - 1000);
const relToday = formatRelativeDate(today.toISOString());
assert(relToday === "Ends today", `relative today: ${relToday}`);

// Tomorrow — midnight-based so diffDays is exactly 1 regardless of the run time of day
const now = new Date();
const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
const relTomorrow = formatRelativeDate(tomorrow.toISOString());
assert(relTomorrow === "Ends tomorrow", `relative tomorrow: ${relTomorrow}`);

// Past → Expired
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const relPast = formatRelativeDate(yesterday.toISOString());
assert(relPast === "Expired", `relative past: ${relPast}`);

// 8+ days → formatted date
const eightDays = new Date();
eightDays.setDate(eightDays.getDate() + 8);
const relFar = formatRelativeDate(eightDays.toISOString());
assert(relFar !== null && relFar.startsWith("Ends ") && !relFar.includes("days"), `far future: ${relFar}`);

// null/undefined
assert(formatRelativeDate(null) === null, "relative null");
assert(formatRelativeDate(undefined) === null, "relative undefined");

// ── discountLabel ──
assert(discountLabel("PERCENTAGE") === "% Off", "pct no value");
assert(discountLabel("FIXED") === "$ Off", "fixed no value");
assert(discountLabel("FREE_TIER") === "Free", "free tier");
assert(discountLabel("LIFETIME") === "Lifetime", "lifetime");
assert(discountLabel("UNKNOWN") === "Deal", "unknown fallback");
assert(discountLabel("PERCENTAGE", "50% off") === "50% off", "pct with value — returns value");
assert(discountLabel("FIXED", "$10 off") === "$10 off", "fixed with value");

// ── statusColor ──
for (const s of ["APPROVED", "PENDING", "REJECTED", "EXPIRED"]) {
  const c = statusColor(s);
  assert(c.length > 10, `statusColor ${s} non-empty`);
  assert(c.includes("bg-"), `statusColor ${s} has bg class`);
}
assert(statusColor("FOO").length > 0, "unknown status returns default");

// ── SITE_LANGUAGE ──
assert(SITE_LANGUAGE === "en-IN", "site language en-IN");

console.log("OK: format helpers verified (date, relative, discount, status)");
