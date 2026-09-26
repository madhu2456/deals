import { prisma } from "@/lib/prisma";

/**
 * Approved, unexpired deals per generated sitemap chunk (WP-DEALS-08).
 *
 * Lives here (not in app/sitemap.ts) because BOTH app/sitemap.ts
 * (`generateSitemaps`) and app/sitemap-index.xml/route.ts (the index served
 * at /sitemap.xml) must derive from the same row set — otherwise the index
 * could advertise a chunk count that no longer matches the routes Next
 * actually serves (F001).
 */
export const DEALS_PER_SITEMAP = 10_000;

/** Approved + unexpired predicate — rebuilt per call so the expiry bound is fresh. */
function approvedNotExpired() {
  return {
    status: "APPROVED" as const,
    OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
  };
}

/**
 * Ids of every sitemap chunk `generateSitemaps()` will announce
 * ("0".."n-1"), ordered. Falls back to a single chunk on a DB error so
 * /sitemap.xml always advertises at least one <loc> (F001) — a missing index
 * breaks crawler discovery, an empty one does the same.
 */
export async function getSitemapChunkIds(): Promise<string[]> {
  try {
    const count = await prisma.deal.count({ where: approvedNotExpired() });
    const totalChunks = Math.max(1, Math.ceil(count / DEALS_PER_SITEMAP));
    return Array.from({ length: totalChunks }, (_, id) => String(id));
  } catch (err) {
    console.error("[getSitemapChunkIds] DB query failed, returning single sitemap", err);
    return ["0"];
  }
}
