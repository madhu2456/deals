import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site";

/**
 * "Report broken deal" (F-DEAL-006) — user-submitted reports that a deal's
 * offer link is dead or the terms are wrong. No auth by design (public
 * affordance); abuse is bounded by the per-IP rate limit and a honeypot.
 *
 * Storage is minimal: two counters/flags on the Deal row
 * (brokenReportedAt first report, brokenReportCount total). The admin
 * dashboard shows the count; the periodic offer checker
 * (scripts/check-offer-validity.ts) remains the source of truth for link
 * health — user reports are a signal for review, never an auto-status change.
 */

export const REPORT_HONEYPOT_FIELD = "company";
/** Max reports per IP per hour (matches SUBMIT-style per-IP budgets). */
export const REPORT_MAX_PER_IP = 5;
export const REPORT_WINDOW_MS = 60 * 60 * 1000;
/** Mirrors the click-route guard: cuid() ids are ~25 chars, cap at 64. */
export const REPORT_ID_MAX_LEN = 64;

/** Origins allowed to POST the report endpoint (CSRF hardening). */
const REPORT_ALLOWED_ORIGINS = new Set<string>([
  getSiteUrl(),
  "https://deals.madhudadi.in",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3002",
]);

/**
 * CSRF guard for the report route: the endpoint mutates persistent review
 * state (brokenReportedAt/brokenReportCount), so browser POSTs must come from
 * the site itself (or localhost/dev). A missing Origin — curl, uptime
 * monitors, server-to-server — is allowed: such clients cannot be tricked
 * into cross-site state changes. Disallowed origins → route returns 403.
 */
export function isReportOriginAllowed(origin: string | null): boolean {
  return origin === null || REPORT_ALLOWED_ORIGINS.has(origin);
}

export type BrokenReportResult =
  | { success: true }
  | { success: false; status: 400 | 404 | 429 | 500; error: string };

/** Honeypot: a filled hidden field marks a bot (route returns success silently). */
export function reportHoneypotTriggered(form: FormData): boolean {
  return Boolean(String(form.get(REPORT_HONEYPOT_FIELD) ?? "").trim());
}

/**
 * Record one broken-deal report for `id`. Order matters (mirrors
 * submitDealAction): rate limit BEFORE any DB read, so a spammer burns the
 * limiter bucket instead of the DB. NODE_ENV guard: dev/test skips limiting.
 * Returns typed errors so the route can map them to HTTP statuses.
 */
export async function recordBrokenDealReport(
  id: string,
  ip: string
): Promise<BrokenReportResult> {
  if (!id || typeof id !== "string" || id.length > REPORT_ID_MAX_LEN) {
    return { success: false, status: 400, error: "Invalid deal id" };
  }

  if (
    process.env.NODE_ENV === "production" &&
    (await checkRateLimit({
      key: `report:${ip}`,
      limit: REPORT_MAX_PER_IP,
      windowMs: REPORT_WINDOW_MS,
    }))
  ) {
    return {
      success: false,
      status: 429,
      error: "Too many reports from your IP. Please try again later.",
    };
  }

  const deal = await prisma.deal.findUnique({
    where: { id },
    select: { id: true, brokenReportedAt: true },
  });
  if (!deal) return { success: false, status: 404, error: "Deal not found" };

  try {
    // TOCTOU accepted: two concurrent reports may both pass the read — both
    // increment the counter, which is the desired outcome; only the first
    // timestamp wins.
    await prisma.deal.update({
      where: { id },
      data: {
        brokenReportCount: { increment: 1 },
        brokenReportedAt: deal.brokenReportedAt ?? new Date(),
      },
    });
  } catch {
    return { success: false, status: 500, error: "Could not record report" };
  }

  return { success: true };
}
