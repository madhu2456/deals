import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/csp-report — CSP violation collector (D4).
 *
 * The CSP header ships `report-uri /api/csp-report` (+ `report-to
 * csp-endpoint`, inert without a Reporting-Endpoints header — browsers fall
 * back to report-uri). Browsers POST a JSON violation report here; the body
 * is drained but NOT logged or persisted: report bodies can contain
 * user-specific query strings (document-uri / blocked-uri), so storing them
 * would be raw-PII capture. Each POST still lands in the nginx access log,
 * which is the violation counter. Respond 204 so browsers stop retrying.
 */
export async function POST(request: NextRequest) {
  await request.text().catch(() => "");
  return new NextResponse(null, { status: 204 });
}