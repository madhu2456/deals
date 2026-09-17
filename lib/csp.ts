/**
 * Content-Security-Policy — single source of truth.
 *
 * WHY THIS LIVES HERE (not as a static header in next.config.ts):
 * the site needs a per-request `script-src` nonce. Next.js hydrates the App
 * Router by injecting INLINE bootstrap scripts (`self.__next_f.push(...)`).
 * Under a nonce-less `script-src 'self'` those are blocked, hydration never
 * runs (React error #412), and every client component goes inert — the cookie
 * consent banner can't be dismissed, the submit form and admin login do
 * nothing, and Consent Mode v2 default-deny never executes. The root layout
 * also renders an inline Consent Mode default script.
 *
 * Next reads the nonce back out of the REQUEST's CSP header
 * (`getScriptNonceFromHeader` in next/dist/server/app-render) and stamps it
 * onto its own scripts. proxy.ts therefore sets the CSP on the request headers
 * (so Next can see it) AND on the response headers (so the browser enforces
 * it). The root layout reads the nonce via the `x-nonce` request header for
 * the inline consent script.
 *
 * `script-src` keeps its host allowlist alongside the nonce. Browsers only
 * ignore host sources when `'strict-dynamic'` is ALSO present; this policy
 * deliberately omits `'strict-dynamic'`, so `'self'`, the nonce, and the
 * explicit hosts all remain active.
 */

/** External script origins allowed in addition to `'self'` and the nonce. */
const SCRIPT_HOSTS = [
  // GTM container (env-gated; empty NEXT_PUBLIC_GTM_ID ships no script).
  "https://www.googletagmanager.com",
  // Turnstile widget (env-gated; both keys required to render).
  "https://challenges.cloudflare.com",
] as const;

/** Directives that never depend on the nonce. */
const STATIC_DIRECTIVES = [
  "style-src 'self' 'unsafe-inline'",
  // Merchant logos and deal images come from external CDNs — restrict to HTTPS.
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://challenges.cloudflare.com",
  "frame-src 'self' https://www.googletagmanager.com https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
  // CSP violation reporting (D4): report-uri is the active channel
  // (report-to csp-endpoint needs a Reporting-Endpoints header, which the
  // shared blog pattern deliberately omits — browsers fall back to
  // report-uri). Collector: app/api/csp-report/route.ts.
  "report-uri /api/csp-report",
  "report-to csp-endpoint",
] as const;

/**
 * Build the CSP string. With a nonce, `script-src` carries `'nonce-...'`;
 * without one it degrades to the host allowlist only — which still blocks
 * injected inline scripts but cannot run Next's bootstrap, so callers must
 * always pass a nonce (proxy.ts does).
 */
export function buildCsp(nonce?: string): string {
  const scriptSrc = [
    "script-src",
    "'self'",
    ...(nonce ? [`'nonce-${nonce}'`] : []),
    ...SCRIPT_HOSTS,
  ].join(" ");

  return ["default-src 'self'", scriptSrc, ...STATIC_DIRECTIVES].join("; ");
}

/** Request header carrying the per-request nonce to the root layout. */
export const NONCE_HEADER = "x-nonce";

/**
 * Fresh 128-bit base64 nonce. Web Crypto + btoa are available in the Edge
 * middleware runtime and in Node 22 (tests). Base64 output matches Next's
 * nonce-source regex (`'nonce-([A-Za-z0-9+/_-]+={0,2})'`).
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
