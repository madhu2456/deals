import { NextRequest, NextResponse } from "next/server";
import { incrementClicks } from "@/lib/data";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || typeof id !== "string" || id.length > 64) {
    return NextResponse.json({ success: false, error: "Invalid deal id" }, { status: 400 });
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
