import { NextRequest, NextResponse } from "next/server";
import { incrementClicks } from "@/lib/data";
import { isOriginAllowed } from "@/lib/origin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/ip";
import { isBotUserAgent } from "@/lib/bot";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // CSRF guard (F-DEAL-016): the endpoint mutates persistent state (click
  // counter), so browser POSTs must come from the site itself. Origin-less
  // clients (curl, monitors) pass — they cannot be tricked cross-site.
  if (!isOriginAllowed(request.headers.get("origin"))) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (!id || typeof id !== "string" || id.length > 64) {
    return NextResponse.json({ success: false, error: "Invalid deal id" }, { status: 400 });
  }

  // Bot filtering (F-DEAL-017): automated bots, crawlers, and scrapers are
  // ignored immediately without consuming rate-limit tokens or incrementing DB
  // click counters.
  const userAgent = request.headers.get("user-agent");
  if (isBotUserAgent(userAgent)) {
    return NextResponse.json({ success: true, ignored: true });
  }

  // Rate limit: max 10 clicks per minute per IP. NODE_ENV guard: dev/test
  // skips limiting — direct connections share the "unknown" bucket.
  const ip = getClientIp(request.headers);

  if (
    process.env.NODE_ENV === "production" &&
    (await checkRateLimit({ key: `click:${ip}`, limit: 10, windowMs: 60 * 1000 }))
  ) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429 }
    );
  }

  try {
    const updated = await incrementClicks(id);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Deal not found or not available" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
