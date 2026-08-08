import { NextRequest, NextResponse } from "next/server";
import { incrementClicks } from "@/lib/data";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/ip";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || typeof id !== "string" || id.length > 64) {
    return NextResponse.json({ success: false, error: "Invalid deal id" }, { status: 400 });
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
