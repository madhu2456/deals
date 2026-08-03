/**
 * Smoke-test rate limiting + IP trust model + deal URL normalization
 * without a full Next server.
 * Run: pnpm exec tsx scripts/verify-rate-limit.ts
 */
import { getClientIp } from "../lib/ip";
import { normalizeDealUrl } from "../lib/deal-url";
import { isRateLimited, getRateLimiterSize } from "../lib/rate-limit";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── getClientIp: trust model ──
// x-real-ip wins over spoofable x-forwarded-for
assert(
  getClientIp(
    new Headers({ "x-real-ip": "203.0.113.99", "x-forwarded-for": "6.6.6.6, 5.5.5.5" })
  ) === "203.0.113.99",
  "x-real-ip beats spoofed xff"
);
// No x-real-ip → LAST non-empty xff element (nginx appends client IP last)
assert(
  getClientIp(new Headers({ "x-forwarded-for": "203.0.113.1, 198.51.100.7" })) ===
    "198.51.100.7",
  "last xff element wins"
);
// Single xff value
assert(
  getClientIp(new Headers({ "x-forwarded-for": "203.0.113.1" })) === "203.0.113.1",
  "single xff value"
);
// Trailing junk part is trimmed + filtered
assert(
  getClientIp(new Headers({ "x-forwarded-for": "203.0.113.1 , " })) === "203.0.113.1",
  "xff trailing empty parts filtered"
);
// Empty-string x-real-ip falls through to xff
assert(
  getClientIp(new Headers({ "x-real-ip": "", "x-forwarded-for": "198.51.100.7" })) ===
    "198.51.100.7",
  "empty x-real-ip falls back to xff"
);
// All-empty xff parts → unknown
assert(
  getClientIp(new Headers({ "x-forwarded-for": " , , " })) === "unknown",
  "all-empty xff → unknown"
);
// No headers at all → unknown
assert(getClientIp(new Headers()) === "unknown", "no headers → unknown");

// ── normalizeDealUrl: dedupe key matrix ──
assert(
  normalizeDealUrl("https://EXAMPLE.com/Deals?utm_source=x&ref=abc&a=1") ===
    "https://example.com/Deals?a=1",
  "host lowercase + utm_/ref stripped, kept param retained"
);
assert(
  normalizeDealUrl("https://example.com:443/path/") === "https://example.com/path",
  "default https port 443 dropped + trailing slash stripped"
);
assert(
  normalizeDealUrl("http://example.com:80") === "http://example.com",
  "default http port 80 dropped"
);
assert(
  normalizeDealUrl("https://example.com") === normalizeDealUrl("https://example.com/"),
  "root with/without slash equal"
);
assert(
  normalizeDealUrl("https://example.com") === "https://example.com",
  "root → no trailing slash"
);
assert(
  normalizeDealUrl("https://example.com?x=1&y=2") ===
    normalizeDealUrl("https://example.com?y=2&x=1"),
  "query param order ignored"
);
assert(
  normalizeDealUrl("https://example.com?x=1&y=2") === "https://example.com?x=1&y=2",
  "sorted canonical form"
);
assert(
  normalizeDealUrl("https://example.com?gclid=G1&utm_campaign=c&b=2") ===
    "https://example.com?b=2",
  "gclid + utm_ stripped, b kept"
);
assert(
  normalizeDealUrl("https://example.com?ref=1") === normalizeDealUrl("https://example.com"),
  "ref-only query == no query"
);
assert(
  normalizeDealUrl("https://example.com?UTM_SOURCE=x&cs=1&d=2&a=1") ===
    "https://example.com?a=1",
  "case-insensitive tracking strip (UTM_SOURCE/cs/d), a kept"
);
assert(
  normalizeDealUrl("https://example.com/path?a=1#frag") ===
    "https://example.com/path?a=1#frag",
  "hash preserved"
);
assert(
  normalizeDealUrl("http://x.com/a") !== normalizeDealUrl("https://x.com/a"),
  "scheme kept — http ≠ https"
);
assert(
  normalizeDealUrl("https://example.com:8443/a") === "https://example.com:8443/a",
  "non-default port kept"
);
assert(normalizeDealUrl("not-a-url") === null, "non-URL → null (never throws)");
assert(normalizeDealUrl("ftp://example.com/a") === null, "non-http(s) scheme → null");

// ── isRateLimited sweep boundary (exact sizes; runs BEFORE the basic cases so
//    the map starts empty — windowMs=0 keeps everything immediately expired,
//    no wall-clock dependence) ──
async function main() {
  // (a) 1000 distinct keys → no sweep on the 1000th call (sees size 999 ≤ 1000)
  for (let i = 0; i < 1000; i++) {
    assert(!isRateLimited(`sweep-a:${i}`, 5, 0), `sweep (a) call ${i} allowed`);
  }
  assert(getRateLimiterSize() === 1000, "sweep (a) size exactly 1000");

  // (b) 1001st key → sees size 1000 (not > 1000) → no sweep → size 1001
  assert(!isRateLimited("sweep-b:1", 5, 0), "sweep (b) call allowed");
  assert(getRateLimiterSize() === 1001, "sweep (b) size exactly 1001");

  // (c) 1002nd key → sees size 1001 > 1000 → sweep deletes all 1001 expired
  //     entries → size 0 → insert → size 1, call allowed
  assert(!isRateLimited("sweep-c:1", 5, 0), "sweep (c) call allowed after sweep");
  assert(getRateLimiterSize() === 1, "sweep (c) size exactly 1 after sweep");

  // (d) 1001 unexpired keys (60s window) + next call → sweep deletes nothing
  //     (leftover key from (c) was already swept during the 1001st insert)
  for (let i = 0; i < 1001; i++) {
    assert(!isRateLimited(`sweep-d:${i}`, 5, 60_000), `sweep (d) call ${i} allowed`);
  }
  assert(!isRateLimited("sweep-d:final", 5, 60_000), "sweep (d) final call allowed");
  assert(getRateLimiterSize() === 1002, "sweep (d) size exactly 1002 (unexpired kept)");

  // ── isRateLimited: basic behavior (distinct keys; no size assertions) ──
  assert(!isRateLimited("rl:first", 3, 60_000), "first call allowed");
  assert(!isRateLimited("rl:first", 3, 60_000), "second call still allowed");

  // max 5 → calls 1-5 false, 6th true
  const results: boolean[] = [];
  for (let i = 0; i < 7; i++) results.push(isRateLimited("rl:max5", 5, 60_000));
  assert(results[0] === false, "rl:max5 call 1 allowed");
  assert(results[4] === false, "rl:max5 call 5 allowed (at limit)");
  assert(results[5] === true, "rl:max5 call 6 blocked");
  assert(results[6] === true, "rl:max5 call 7 still blocked");

  // distinct keys are independent
  assert(!isRateLimited("rl:indep-a", 2, 60_000), "rl:indep-a call 1 allowed");
  assert(!isRateLimited("rl:indep-a", 2, 60_000), "rl:indep-a call 2 allowed");
  assert(isRateLimited("rl:indep-a", 2, 60_000) === true, "rl:indep-a call 3 blocked");
  assert(!isRateLimited("rl:indep-b", 2, 60_000), "rl:indep-b unaffected by rl:indep-a");

  // window expiry: 5 calls in a 20ms window, sleep 60ms → next call resets
  for (let i = 0; i < 5; i++) {
    assert(!isRateLimited("rl:window", 5, 20), `rl:window call ${i + 1} allowed`);
  }
  await sleep(60);
  assert(!isRateLimited("rl:window", 5, 20), "rl:window call after expiry resets → allowed");

  console.log("OK: rate-limit + IP trust + deal-url normalization verified");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
