import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const KEY_RE = /^[a-zA-Z0-9-]{8,128}$/;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedKey = searchParams.get("key");

  if (!requestedKey || !KEY_RE.test(requestedKey)) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    });
  }

  const configuredKey = process.env.INDEXNOW_KEY;
  if (!configuredKey || !KEY_RE.test(configuredKey) || requestedKey !== configuredKey) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    });
  }

  return new NextResponse(configuredKey, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
