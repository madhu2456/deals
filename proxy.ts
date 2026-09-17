import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { buildCsp, generateNonce, NONCE_HEADER } from "@/lib/csp";

const ADMIN_COOKIE = "admin-session";

// TTL cache: only NON-expired results are cached — a cached entry means "this
// slug is live, fall through". Never cache a 410: a re-activated deal must not
// serve a stale 410 from the window, and correctness beats saving a Prisma
// query on re-crawls of genuinely expired URLs. The TTL bounds how often the
// query runs for live slugs (deindex sweeps re-crawl the same expired URLs),
// and the size cap keeps memory bounded under sweep bursts.
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 2000;
const expiredDealCache = new Map<string, { at: number }>();

/** Drop stale entries past the cap; if everything is still fresh, clear. */
function sweepExpiredDealCache(): void {
  if (expiredDealCache.size <= CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [slug, entry] of expiredDealCache) {
    if (now - entry.at >= CACHE_TTL_MS) expiredDealCache.delete(slug);
  }
  if (expiredDealCache.size > CACHE_MAX_ENTRIES) {
    // All entries still within TTL — drop everything rather than grow unbounded.
    expiredDealCache.clear();
  }
}

/**
 * Lazy-imports lib/data (and with it the Prisma client) ONLY on deal paths, so
 * a load-time Prisma failure can never 500 admin/auth requests.
 */
async function isExpiredApprovedDeal(slug: string): Promise<boolean> {
  sweepExpiredDealCache();
  const cached = expiredDealCache.get(slug);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return false;
  if (cached) expiredDealCache.delete(slug);

  const { getExpiredApprovedDealBySlug } = await import("@/lib/data");
  const expired = (await getExpiredApprovedDealBySlug(slug)) !== null;

  if (!expired) expiredDealCache.set(slug, { at: Date.now() });
  return expired;
}

function getSecret() {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

/**
 * Per-request CSP + nonce. Sets the policy on the forwarded REQUEST headers
 * (Next's `getScriptNonceFromHeader` reads it back and stamps the nonce onto
 * its inline bootstrap scripts — without this, hydration never runs) AND on
 * the RESPONSE headers (so the browser actually enforces the policy).
 *
 * Redirect/410 responses intentionally skip this: they carry no HTML scripts,
 * and the browser re-requests the target URL, which runs this same path.
 */
function nextWithCsp(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

/**
 * Previously-approved deals that have since expired return 410 Gone.
 * Churn-prone coupon URLs: 410 tells Google the specific coupon is gone so it
 * deindexes fast, without the soft-404 signal of a recurring 404. The header
 * reinforces intent. Everything else falls through to the page (200 for live
 * deals, 404 via notFound() for never-approved / PENDING / REJECTED / perpetual).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin auth (migrated from middleware.ts — Next 16 renamed the convention).
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    const secret = getSecret();

    if (!token || !secret) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    try {
      const { payload } = await jwtVerify(token, secret);
      if (payload.role !== "admin") {
        return NextResponse.redirect(new URL("/admin/login", request.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  // Deal detail pages (/deals/<single-segment>). The matcher now covers every
  // HTML route (for the CSP nonce), so guard the single-segment shape here:
  // deeper paths are not deal slugs and must not trigger a DB lookup.
  if (pathname.startsWith("/deals/")) {
    const slug = pathname.slice("/deals/".length);
    if (slug && !slug.includes("/") && (await isExpiredApprovedDeal(slug))) {
      return new NextResponse(null, {
        status: 410,
        headers: { "X-Robots-Tag": "noindex, follow" },
      });
    }
  }

  // Every other HTML route: attach the nonce CSP.
  return nextWithCsp(request);
}

// Runs on every HTML route so each document gets a fresh nonce. Excludes API
// route handlers and any asset/text response (paths ending in an extension,
// plus the Next build/image asset trees) — those carry no executable HTML.
// Both keys are exported: the build validates `matcher` (singular) into the
// functions-config manifest, while the runtime loader reads `matchers`
// (plural) from the compiled chunk when the manifest entry is absent.
export const config = {
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|.*\\.[\\w]+$).*)"],
  matchers: ["/((?!api(?:/|$)|_next(?:/|$)|.*\\.[\\w]+$).*)"],
};
