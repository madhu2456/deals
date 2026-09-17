/**
 * CSP nonce wiring (regression gate for the hydration outage).
 *
 * HISTORY: the site shipped a static `script-src 'self'` with NO nonce. Next
 * injects INLINE bootstrap scripts for App Router hydration; the CSP blocked
 * them, so hydration never ran (React error #412) and EVERY client component
 * went inert — cookie banner undismissable, submit + admin login dead, and
 * Consent Mode v2 default-deny never executed. String-only gates passed while
 * the site was broken in real browsers, so this gate proves the MECHANISM:
 *
 *  1. Functional round-trip: the CSP built by lib/csp.ts is fed through Next's
 *     OWN `getScriptNonceFromHeader` — the exact function Next uses to stamp
 *     its bootstrap scripts. If Next cannot extract the nonce, hydration is
 *     broken, and this gate fails.
 *  2. Nonce entropy/uniqueness: two calls never collide.
 *  3. Static wiring: next.config.ts ships NO CSP; proxy.ts sets the CSP on the
 *     REQUEST (so Next reads it) and the RESPONSE (so the browser enforces it)
 *     and mints a fresh nonce per request; app/layout.tsx stamps the inline
 *     consent script with the nonce.
 *  4. Matcher: the proxy matcher includes HTML routes and excludes api/assets.
 *  5. No shared cache on nonce'd HTML: a cache replaying one nonce to many
 *     users lets an attacker reuse it — the nonce'd routes must not carry
 *     `public`/`s-maxage` Cache-Control.
 *
 * Run: pnpm test:csp-nonce
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { buildCsp, generateNonce, NONCE_HEADER } from "../lib/csp";

const repoRoot = join(__dirname, "..");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

/** Next's real nonce extractor (CJS build) — the ground truth for hydration. */
const require_ = createRequire(import.meta.url);
const { getScriptNonceFromHeader } = require_(
  "next/dist/server/app-render/get-script-nonce-from-header"
) as { getScriptNonceFromHeader: (csp: string) => string | undefined };

function main(): void {
  // ── 1. Functional round-trip through Next's own parser ──
  const nonce = generateNonce();
  const csp = buildCsp(nonce);
  const extracted = getScriptNonceFromHeader(csp);
  assert(
    extracted === nonce,
    `Next must extract the nonce from the emitted CSP (got ${String(extracted)}, expected ${nonce}). ` +
      "If this fails, hydration is broken in production."
  );

  // The nonce must live in script-src (not only default-src), and the policy
  // must still allow the host scripts GTM/Turnstile load from.
  const scriptSrc = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith("script-src"));
  assert(scriptSrc, "CSP has a script-src directive");
  assert(scriptSrc!.includes(`'nonce-${nonce}'`), "script-src carries the nonce");
  assert(scriptSrc!.includes("'self'"), "script-src keeps 'self'");
  assert(
    scriptSrc!.includes("https://www.googletagmanager.com"),
    "script-src keeps the GTM host (host allowlist stays active without 'strict-dynamic')"
  );
  assert(
    scriptSrc!.includes("https://challenges.cloudflare.com"),
    "script-src keeps the Turnstile host"
  );
  assert(
    !csp.includes("'strict-dynamic'"),
    "no 'strict-dynamic' — it would silently disable the host allowlist"
  );
  assert(
    csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'"),
    "CSP keeps the hardening directives"
  );

  // ── 2. Nonce freshness ──
  const a = generateNonce();
  const b = generateNonce();
  assert(a !== b, "generateNonce must not repeat across calls");
  assert(a.length >= 16, "nonce has adequate length");
  assert(
    /^[A-Za-z0-9+/]+={0,2}$/.test(a),
    "nonce is valid base64 (matches Next's nonce-source regex)"
  );

  // ── 3. Static wiring ──
  const nextConfig = readFileSync(join(repoRoot, "next.config.ts"), "utf8");
  assert(
    !/Content-Security-Policy/.test(nextConfig.replace(/\/\/.*$/gm, "")),
    "next.config.ts must NOT set a CSP header (the nonce policy lives in proxy.ts)"
  );

  const proxy = readFileSync(join(repoRoot, "proxy.ts"), "utf8");
  assert(proxy.includes("buildCsp"), "proxy.ts builds the CSP via lib/csp.ts");
  assert(proxy.includes("generateNonce"), "proxy.ts mints a per-request nonce");
  // proxy.ts imports the NONCE_HEADER constant (so the literal string is not
  // in its source) — assert the symbol is used, and that it is set on the
  // forwarded request headers.
  assert(
    proxy.includes("NONCE_HEADER") && proxy.includes("requestHeaders.set"),
    `proxy.ts forwards the nonce on the ${NONCE_HEADER} request header`
  );
  // The CSP must be set on the REQUEST headers (Next reads it) — evidenced by
  // NextResponse.next({ request: { headers } }) plus setting the CSP key.
  assert(
    /NextResponse\.next\(\s*\{\s*request:/.test(proxy),
    "proxy.ts sets the CSP on the forwarded request (Next reads the nonce from it)"
  );
  assert(
    /response\.headers\.set\(\s*["']Content-Security-Policy["']/.test(proxy),
    "proxy.ts also sets the CSP on the response (browser enforcement)"
  );

  const layout = readFileSync(join(repoRoot, "app", "layout.tsx"), "utf8");
  assert(
    layout.includes("NONCE_HEADER"),
    "app/layout.tsx reads the nonce header"
  );
  assert(
    /nonce=\{nonce\}/.test(layout),
    "app/layout.tsx stamps the inline consent script with the nonce"
  );
  assert(
    /export default async function RootLayout/.test(layout),
    "RootLayout is async (reads headers() → every route is dynamic with a fresh nonce)"
  );

  // ── 4. Matcher shape ──
  // Extract the matcher regex literal and compile it.
  const m = proxy.match(/matcher:\s*\["((?:[^"\\]|\\.)+)"\]/);
  assert(m, "proxy.ts exports a matcher array");
  const pattern = JSON.parse(`"${m![1]}"`);
  const re = new RegExp(`^${pattern}$`);
  const mustMatch = ["/", "/deals", "/deals/some-slug", "/admin/login", "/submit", "/apixyz", "/categories/travel"];
  const mustNotMatch = ["/api/deals/x/click", "/api", "/_next/static/chunk.js", "/icon.png", "/robots.txt", "/sitemap.xml"];
  for (const p of mustMatch) {
    assert(re.test(p), `matcher must include HTML route: ${p}`);
  }
  for (const p of mustNotMatch) {
    assert(!re.test(p), `matcher must exclude asset/api path: ${p}`);
  }

  // ── 5. Nonce'd HTML must not be shared-cached ──
  // A cache that stores and replays a nonce'd document hands one nonce to many
  // users, letting an attacker read the cached nonce and reuse it. The pages
  // that embed the nonce must therefore not carry a `public`/`s-maxage`
  // Cache-Control. (Regression: the fix first shipped nonce'd HTML with
  // `public, s-maxage=900, stale-while-revalidate=86400`.)
  const nonceHtmlSources = ["/", "/deals", "/categories", "/categories/:slug*", "/deals/:slug*"];
  for (const src of nonceHtmlSources) {
    // Locate the headers() rule for this exact source with plain string ops
    // (deliberately no regex: backslash-heavy patterns are mangling-prone).
    const marker = 'source: "' + src + '"';
    const ruleStart = nextConfig.indexOf(marker);
    assert(ruleStart !== -1, `next.config.ts has a headers() rule for ${src}`);
    const nextRule = nextConfig.indexOf('source: "', ruleStart + marker.length);
    const ruleBlock = nextRule === -1 ? nextConfig.slice(ruleStart) : nextConfig.slice(ruleStart, nextRule);
    const ccKey = ruleBlock.indexOf("Cache-Control");
    assert(ccKey !== -1, `next.config.ts rule for ${src} sets Cache-Control`);
    const valueKey = ruleBlock.indexOf("value:", ccKey);
    const openQuote = ruleBlock.indexOf('"', valueKey);
    const closeQuote = ruleBlock.indexOf('"', openQuote + 1);
    assert(openQuote !== -1 && closeQuote !== -1, `Cache-Control value for ${src} is readable`);
    const cc = ruleBlock.slice(openQuote + 1, closeQuote);
    const tokens = cc.split(" ").join(",").split(";").join(",").split(",").map((t) => t.trim()).filter((t) => t.length > 0);
    const sharedCacheable = tokens.some((t) => t === "public" || t.slice(0, 8) === "s-maxage");
    assert(
      !sharedCacheable,
      `${src} embeds a per-request nonce, so its Cache-Control must not be shared-cacheable (got: ${cc})`
    );
  }

  console.log(
    "OK: CSP nonce round-trips through Next's parser; proxy mints per-request nonce on request+response; layout stamps inline script; matcher scoped to HTML routes; nonce'd HTML not shared-cacheable"
  );
}

main();
