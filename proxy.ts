import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const ADMIN_COOKIE = "admin-session";

// TTL cache: 410s are uncached, and deindex sweeps re-crawl the same expired
// URLs repeatedly. Avoids re-running the Prisma query for hits within 60s.
const CACHE_TTL_MS = 60_000;
const expiredDealCache = new Map<string, { at: number; expired: boolean }>();

/**
 * Lazy-imports lib/data (and with it the Prisma client) ONLY on deal paths, so
 * a load-time Prisma failure can never 500 admin/auth requests.
 */
async function isExpiredApprovedDeal(slug: string): Promise<boolean> {
  const cached = expiredDealCache.get(slug);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.expired;

  const { getExpiredApprovedDealBySlug } = await import("@/lib/data");
  const expired = (await getExpiredApprovedDealBySlug(slug)) !== null;

  expiredDealCache.set(slug, { at: Date.now(), expired });
  return expired;
}

function getSecret() {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
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

  // Matcher scopes this to /deals/:slug (single segment); the page handles
  // everything that is not an expired, previously-approved deal.
  if (pathname.startsWith("/deals/")) {
    const slug = pathname.slice("/deals/".length);
    if (await isExpiredApprovedDeal(slug)) {
      return new NextResponse(null, {
        status: 410,
        headers: { "X-Robots-Tag": "noindex, follow" },
      });
    }
  }

  return undefined; // fall through to the page
}

// Both keys exported: the build validates `matcher` (singular) into the
// functions-config manifest, while the runtime loader reads `matchers`
// (plural) from the compiled chunk when the manifest entry is absent.
export const config = {
  matcher: ["/admin/:path*", "/deals/:slug"],
  matchers: ["/admin/:path*", "/deals/:slug"],
};
