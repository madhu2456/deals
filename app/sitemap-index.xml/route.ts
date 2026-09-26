import { getSiteUrl } from "@/lib/site";
import { getSitemapChunkIds } from "@/lib/sitemap-chunks";

/**
 * F001: the sitemap INDEX, published at /sitemap.xml via next.config.ts
 * rewrites (`/sitemap.xml` → `/sitemap-index.xml`, because `app/sitemap.ts`
 * reserves the /sitemap.xml path for its metadata route and Next rejects a
 * route handler at that exact path: "Conflicting route and metadata at
 * /sitemap.xml").
 *
 * WHY THIS FILE EXISTS: app/sitemap.ts uses `generateSitemaps()`, so Next
 * serves each chunk at /sitemap/<id>.xml (build output:
 * `/sitemap/[__metadata_id__]` → `/sitemap/0.xml`). Next does NOT emit an
 * index for a root-level `app/sitemap.ts` — /sitemap.xml was a hard 404 with
 * an application/xml content-type pinned by next.config.ts headers(), while
 * app/robots.ts:122 and app/ai-profile.json both advertised
 * `${site}/sitemap.xml`. Every crawler, GSC, and llms.txt consumer therefore
 * hit a 404 where the index was promised (F001).
 *
 * This handler emits the real <sitemapindex> covering EXACTLY the chunks
 * `generateSitemaps()` announces: both derive from lib/sitemap-chunks.ts, so
 * the advertised set and the served routes cannot drift apart. Add chunks and
 * the index grows with them; there are no orphan URLs.
 *
 * The document is never empty — on a DB error getSitemapChunkIds() still
 * returns ["0"], so at least one <loc> is always published. Content-Type is
 * set here explicitly so the response is correct even when the request path
 * is rewritten (next.config.ts pins the same value for /sitemap.xml).
 *
 * ISR mirrors app/sitemap.ts (24h) so the index cannot outlive a chunk-count
 * change; the handler reads a COUNT, not the deal rows themselves.
 */
export const revalidate = 86400;

/** Same escaping as app/feed.xml/route.ts — locs are built from env data. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const site = getSiteUrl();
  const ids = await getSitemapChunkIds();

  const entries = ids
    .map(
      (id) =>
        `    <sitemap>\n      <loc>${escapeXml(`${site}/sitemap/${id}.xml`)}</loc>\n    </sitemap>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
