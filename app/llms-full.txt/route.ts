import { buildLlmsBody } from "@/lib/llms-body";

/**
 * /llms-full.txt (F219): mirrors /llms.txt exactly — the inventory already
 * covers the full public surface, so the "full" variant is the same content
 * (byte-identical; shared builder in lib/llms-body.ts). Sibling repos serve
 * llms-full.txt with 200; this closes the 404 gap for tools that probe the
 * -full.txt convention first.
 */
export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET() {
  const body = await buildLlmsBody();

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control":
        "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}