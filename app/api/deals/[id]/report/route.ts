import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/ip";
import {
  isReportOriginAllowed,
  recordBrokenDealReport,
  reportHoneypotTriggered,
} from "@/lib/report-deal";

/**
 * POST /api/deals/[id]/report — user "broken deal" report (F-DEAL-006).
 *
 * - No auth (public affordance), rate-limited 5/hr/IP (see lib/report-deal.ts)
 * - Origin guard: rejects browser cross-site POSTs with 403 (the endpoint
 *   mutates persistent review state); Origin-less clients are allowed
 * - Honeypot field: bots that fill it get a silent success, no DB write
 * - Stores a flag/counter on the Deal row; never changes deal status
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isReportOriginAllowed(request.headers.get("origin"))) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ success: false, error: "Invalid form" }, { status: 400 });
  }

  // Honeypot: accept silently (no rate-limit burn, no DB write).
  if (reportHoneypotTriggered(form)) {
    return NextResponse.json({ success: true });
  }

  const ip = getClientIp(request.headers);
  const result = await recordBrokenDealReport(id, ip);
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({ success: true });
}
