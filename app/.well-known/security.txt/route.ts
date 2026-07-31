import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-static";
export const revalidate = 86400;

/**
 * RFC 9116 security.txt for deals.madhudadi.in
 */
export async function GET() {
  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const expires = new Date();
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  expires.setUTCHours(0, 0, 0, 0);

  const body = [
    "Contact: mailto:hello@madhudadi.in",
    "Contact: https://madhudadi.in/contact/",
    "Preferred-Languages: en",
    `Canonical: ${siteUrl}/.well-known/security.txt`,
    `Expires: ${expires.toISOString().replace(/\.\d{3}Z$/, "Z")}`,
    "# Deals by Madhu Dadi (deals.madhudadi.in) — curated deals directory",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
