/**
 * Offer-validity checker (F-DEAL-001 / D012-A).
 *
 * REPORT-ONLY tool. It never auto-applies status changes, never auto-approves,
 * and never auto-publishes. It prints a JSON report to stdout and exits:
 *   0 = no action needed
 *   1 = findings (expired deals and/or broken offer URLs needing admin review)
 *
 * Rules:
 *  - Deals WITH expiryDate (dated): checked against the clock only. An expired
 *    deal is flagged; the admin marks it status=EXPIRED via the admin UI.
 *  - Deals WITHOUT expiryDate (perpetual): HEAD/GET checked against dealUrl
 *    (10s timeout, max 3 redirects, no credentials). 4xx/5xx and redirect
 *    loops are "broken — review". Cloudflare/bot 403 is "inconclusive"
 *    (site is up, bot is blocked) and does NOT fail the run.
 *  - Scope: status=APPROVED deals — the public offer surface. PENDING,
 *    REJECTED and EXPIRED rows are admin-lifecycle states and are left alone.
 *
 * Intended host cron (deploy-time ops — deliberately NOT wired into the repo):
 *   0 4 * * *  cd /opt/deals && docker compose exec -T deals-app pnpm check:offers
 * (daily 04:00 IST; confirm the compose service name — see docker-compose.yml)
 *
 * Run: pnpm check:offers
 */

import { pathToFileURL } from "node:url";

export const MAX_REDIRECTS = 3;
export const REQUEST_TIMEOUT_MS = 10_000;

/** Injectable fetch seam (narrower than typeof fetch — the checker only ever calls with a string URL). */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type UrlOutcome =
  | { outcome: "ok"; status: number; redirects: number }
  | {
      outcome: "broken";
      status: number | null;
      reason: "http-status" | "redirect-loop";
      redirects: number;
    }
  | {
      outcome: "inconclusive";
      status: number | null;
      reason: "bot-blocked" | "timeout" | "network-error";
      redirects: number;
    };

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Probe one offer URL. HEAD first; falls back to GET when the server rejects
 * HEAD (405/501). Redirects are followed manually (max `maxRedirects` hops) so
 * loops are detected and reported as broken. No cookies, no auth headers.
 */
export async function checkOfferUrl(
  url: string,
  fetchImpl: FetchLike = fetch,
  opts: { timeoutMs?: number; maxRedirects?: number } = {}
): Promise<UrlOutcome> {
  const { timeoutMs = REQUEST_TIMEOUT_MS, maxRedirects = MAX_REDIRECTS } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let redirects = 0;
  let method: "HEAD" | "GET" = "HEAD";
  try {
    let current = url;
    for (;;) {
      let res: Response;
      try {
        res = await fetchImpl(current, {
          method,
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "user-agent":
              "Mozilla/5.0 (compatible; DealsOfferCheck/1.0; +https://deals.madhudadi.in)",
          },
        });
      } catch {
        if (controller.signal.aborted) {
          return { outcome: "inconclusive", status: null, reason: "timeout", redirects };
        }
        return { outcome: "inconclusive", status: null, reason: "network-error", redirects };
      }

      const status = res.status;

      if (REDIRECT_STATUSES.has(status)) {
        const location = res.headers.get("location");
        if (!location) {
          // Redirect with no target is a dead end.
          return { outcome: "broken", status, reason: "http-status", redirects };
        }
        if (redirects >= maxRedirects) {
          return { outcome: "broken", status, reason: "redirect-loop", redirects: redirects + 1 };
        }
        redirects += 1;
        current = new URL(location, current).toString();
        continue;
      }

      // Cloudflare/bot challenge or geo-block: site is likely up — inconclusive.
      if (status === 403) {
        return { outcome: "inconclusive", status, reason: "bot-blocked", redirects };
      }

      // HEAD unsupported — retry the same URL with GET once.
      if ((status === 405 || status === 501) && method === "HEAD") {
        // Drain the HEAD body so undici releases the socket instead of holding it until GC.
        await res.arrayBuffer().catch(() => undefined);
        method = "GET";
        continue;
      }

      if (status >= 400) {
        return { outcome: "broken", status, reason: "http-status", redirects };
      }

      return { outcome: "ok", status, redirects };
    }
  } finally {
    clearTimeout(timer);
  }
}

/** True when a dated offer has passed its expiry (null expiry = perpetual). */
export function isExpired(
  expiryDate: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (expiryDate === null || expiryDate === undefined) return false;
  const t = new Date(expiryDate).getTime();
  if (Number.isNaN(t)) return false;
  return t < now.getTime();
}

async function main(): Promise<void> {
  // Lazy import so the pure functions above stay importable without a DB/env.
  const { prisma } = await import("../lib/prisma");

  const deals = await prisma.deal.findMany({
    where: { status: "APPROVED" },
    select: { slug: true, title: true, dealUrl: true, expiryDate: true },
    orderBy: { slug: "asc" },
  });

  const items: unknown[] = [];
  let expiredCount = 0;
  let brokenCount = 0;
  let inconclusiveCount = 0;

  for (const deal of deals) {
    if (deal.expiryDate) {
      const expired = isExpired(deal.expiryDate);
      if (expired) expiredCount += 1;
      items.push({
        slug: deal.slug,
        title: deal.title,
        kind: "dated",
        expiryDate: deal.expiryDate.toISOString(),
        expired,
        action: expired ? "review: mark status=EXPIRED via admin UI" : "none",
      });
    } else {
      const check = await checkOfferUrl(deal.dealUrl);
      if (check.outcome === "broken") brokenCount += 1;
      if (check.outcome === "inconclusive") inconclusiveCount += 1;
      items.push({
        slug: deal.slug,
        title: deal.title,
        kind: "perpetual",
        dealUrl: deal.dealUrl,
        check,
        action: check.outcome === "broken" ? "review: deal may be dead" : "none",
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    scope: "status=APPROVED deals",
    totals: {
      dealsChecked: deals.length,
      dated: deals.filter((d) => d.expiryDate !== null).length,
      perpetual: deals.filter((d) => d.expiryDate === null).length,
      expired: expiredCount,
      broken: brokenCount,
      inconclusive: inconclusiveCount,
    },
    items,
    notes:
      "Report-only: nothing was auto-approved, auto-expired, or auto-published. " +
      "Dated deals past expiry should be marked status=EXPIRED by an admin; " +
      "broken perpetual URLs should be reviewed/updated. Inconclusive (403 bot " +
      "blocks, timeouts, network errors) needs no immediate action.",
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(expiredCount > 0 || brokenCount > 0 ? 1 : 0);
}

// CLI guard (works under tsx for both ESM and CJS interpretation).
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
