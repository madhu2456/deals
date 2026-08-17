/**
 * Unit tests for scripts/check-offer-validity.ts (mocked fetch — NO network)
 * plus copy-consistency for the F-DEAL-001 FAQ/About wording.
 *
 * Run: pnpm test:offer-checker
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkOfferUrl,
  isExpired,
  MAX_REDIRECTS,
  type FetchLike,
  type UrlOutcome,
} from "./check-offer-validity";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function assertEqual(actual: unknown, expected: unknown, msg: string): void {
  assert(actual === expected, `${msg} (expected ${String(expected)}, got ${String(actual)})`);
}

function expectBroken(o: UrlOutcome): Extract<UrlOutcome, { outcome: "broken" }> {
  if (o.outcome !== "broken") throw new Error(`FAIL: expected broken, got ${JSON.stringify(o)}`);
  return o;
}
function expectInconclusive(o: UrlOutcome): Extract<UrlOutcome, { outcome: "inconclusive" }> {
  if (o.outcome !== "inconclusive")
    throw new Error(`FAIL: expected inconclusive, got ${JSON.stringify(o)}`);
  return o;
}
function expectOk(o: UrlOutcome): Extract<UrlOutcome, { outcome: "ok" }> {
  if (o.outcome !== "ok") throw new Error(`FAIL: expected ok, got ${JSON.stringify(o)}`);
  return o;
}

function fakeResponse(status: number, headers: Record<string, string> = {}): Response {
  return {
    status,
    headers: new Headers(headers),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

async function main(): Promise<void> {
  // ── URL outcomes ──
  const ok = expectOk(await checkOfferUrl("https://x.dev/deal", async () => fakeResponse(200)));
  assertEqual(ok.status, 200, "200 status preserved");

  const notFound = expectBroken(await checkOfferUrl("https://x.dev/deal", async () => fakeResponse(404)));
  assertEqual(notFound.status, 404, "404 status preserved");
  assertEqual(notFound.reason, "http-status", "404 reason http-status");

  expectBroken(await checkOfferUrl("https://x.dev/deal", async () => fakeResponse(410))); // 410 → broken
  expectBroken(await checkOfferUrl("https://x.dev/deal", async () => fakeResponse(500))); // 500 → broken

  const botBlock = expectInconclusive(
    await checkOfferUrl("https://x.dev/deal", async () => fakeResponse(403))
  );
  assertEqual(botBlock.reason, "bot-blocked", "403 reason bot-blocked");

  // Redirect chain: 302 → 200
  const redirect = expectOk(
    await checkOfferUrl("https://x.dev/a", async (url: string) =>
      url === "https://x.dev/a" ? fakeResponse(302, { location: "https://x.dev/b" }) : fakeResponse(200)
    )
  );
  assertEqual(redirect.redirects, 1, "one redirect hop counted");

  // Redirect loop: capped at MAX_REDIRECTS
  const loop = expectBroken(
    await checkOfferUrl("https://x.dev/loop", async (url: string) =>
      fakeResponse(302, { location: url })
    )
  );
  assertEqual(loop.reason, "redirect-loop", "loop reason redirect-loop");
  assertEqual(loop.redirects, MAX_REDIRECTS + 1, "loop capped at MAX_REDIRECTS + 1");

  // Redirect with no Location header = dead end
  expectBroken(await checkOfferUrl("https://x.dev/a", async () => fakeResponse(301)));

  // HEAD rejected (405) → GET fallback succeeds
  const methods: string[] = [];
  const headThenGet = await checkOfferUrl("https://x.dev/deal", async (_url, init) => {
    methods.push(String(init?.method ?? "GET"));
    return String(init?.method) === "HEAD" ? fakeResponse(405) : fakeResponse(200);
  });
  expectOk(headThenGet); // 405 HEAD → GET fallback ok
  assertEqual(methods.join(","), "HEAD,GET", "HEAD then GET fallback order");

  // Timeout → inconclusive (never-fetching stub that respects the abort signal)
  const neverFetch: FetchLike = async (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError"))
      );
    });
  const timedOut = expectInconclusive(
    await checkOfferUrl("https://x.dev/slow", neverFetch, { timeoutMs: 100 })
  );
  assertEqual(timedOut.reason, "timeout", "timeout reason");

  // Network error → inconclusive
  const netError = expectInconclusive(
    await checkOfferUrl("https://x.dev/down", async () => {
      throw new TypeError("fetch failed");
    })
  );
  assertEqual(netError.reason, "network-error", "network-error reason");

  // ── Expiry ──
  const now = new Date("2026-08-12T00:00:00.000Z");
  assertEqual(isExpired(new Date("2026-08-11T23:59:59.000Z"), now), true, "past date → expired");
  assertEqual(isExpired(new Date("2026-08-12T00:00:00.000Z"), now), false, "exact now → not expired");
  assertEqual(isExpired(new Date("2026-08-13T00:00:00.000Z"), now), false, "future date → not expired");
  assertEqual(isExpired(null, now), false, "null expiry (perpetual) → not expired");
  assertEqual(isExpired(undefined, now), false, "undefined expiry → not expired");
  assertEqual(isExpired("not-a-date", now), false, "garbage date string → not expired");

  // ── Copy consistency (F-DEAL-001 D012-A + F-DEAL-005 sweep): no unbacked
  // URL-verification claim anywhere in the public surfaces ──
  const repoRoot = join(__dirname, "..");
  const jsonld = readFileSync(join(repoRoot, "lib", "seo", "json-ld.tsx"), "utf8");
  const about = readFileSync(join(repoRoot, "app", "about", "page.tsx"), "utf8");
  const llms = readFileSync(join(repoRoot, "lib", "llms-body.ts"), "utf8");
  const aiProfile = readFileSync(join(repoRoot, "app", "ai-profile.json", "route.ts"), "utf8");
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
  const siteLib = readFileSync(join(repoRoot, "lib", "site.ts"), "utf8");
  const hero = readFileSync(join(repoRoot, "app", "components", "Hero.tsx"), "utf8");
  const footer = readFileSync(join(repoRoot, "app", "components", "Footer.tsx"), "utf8");

  // The banned pattern: claiming offers are checked for a working URL.
  const surfaces: Array<[string, string]> = [
    ["lib/seo/json-ld.tsx", jsonld],
    ["app/about/page.tsx", about],
    ["lib/llms-body.ts", llms],
    ["app/ai-profile.json/route.ts", aiProfile],
    ["README.md", readme],
    ["lib/site.ts", siteLib],
    ["app/components/Hero.tsx", hero],
    ["app/components/Footer.tsx", footer],
  ];
  for (const [name, src] of surfaces) {
    assert(
      !/checked for a working offer URL/i.test(src),
      `${name} no longer claims URL verification`
    );
    assert(
      !/verified working offer/i.test(src) && !/verified working URL/i.test(src),
      `${name} has no "verified working offer/URL" claim`
    );
    assert(
      !/moderated for validity/i.test(src) && !/checked for validity/i.test(src),
      `${name} has no validity-check claim`
    );
  }

  assert(
    /const categoryLines = indexableCategories/.test(llms),
    "llms.txt category links come from indexableCategories only"
  );
  assert(
    !/const categoryLines = activeCategories/.test(llms),
    "llms.txt does not link active (possibly noindex) categories"
  );

  assert(/reviewed for clarity and terms/i.test(jsonld), "HOME_FAQS has new review wording");
  assert(/reviewed for clarity and terms/i.test(about), "About page has new review wording");
  assert(
    /reviewed for clarity and terms/i.test(llms),
    "llms.txt uses the honest review wording"
  );
  assert(
    /Human-reviewed directory of software, SaaS, and product discounts/i.test(aiProfile),
    "ai-profile.json describes human review, not URL verification"
  );
  assert(
    /\bsome\s+offers\s+have\s+no\s+fixed\s+expiry/i.test(jsonld) &&
      /\bsome\s+offers\s+have\s+no\s+fixed\s+expiry/i.test(about),
    "both sources mention offers with no fixed expiry"
  );
  assert(
    /offers with a fixed expiry are checked periodically/i.test(jsonld),
    "HOME_FAQS mentions periodic checks for dated offers"
  );

  console.log("OK: offer checker (mocked fetch) + copy consistency verified");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
