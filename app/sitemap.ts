import type { MetadataRoute } from "next";
import { MIN_CATEGORY_DEALS_FOR_INDEX } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";

/**
 * Regenerated per request: `dynamic = "force-dynamic"` disables ISR, so the
 * `revalidate` below is inert and every request re-queries the DB. Caching
 * comes from the /sitemap.xml Cache-Control header in next.config.ts
 * (`public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400`),
 * which is what keeps crawler fetches reliable. Switching to real ISR
 * (dropping force-dynamic) is a deliberate, separate decision.
 */
export const revalidate = 3600;
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: site,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${site}/deals`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.95,
    },
    {
      url: `${site}/categories`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    // /submit is noindex,follow (utility form) — omit from sitemap
  ];

  try {
    const approvedNotExpired = {
      status: "APPROVED" as const,
      OR: [{ expiryDate: null }, { expiryDate: { gt: now } }],
    };

    const [categories, deals] = await Promise.all([
      prisma.category.findMany({
        where: {
          isActive: true,
          deals: {
            some: approvedNotExpired,
          },
        },
        select: {
          slug: true,
          updatedAt: true,
          _count: {
            select: {
              deals: {
                where: approvedNotExpired,
              },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.deal.findMany({
        where: approvedNotExpired,
        select: { slug: true, updatedAt: true, approvedAt: true },
        orderBy: { updatedAt: "desc" },
        // Cap for sitemap size safety
        take: 45_000,
      }),
    ]);

    // Thin categories omitted until they have enough deals
    const categoryRoutes: MetadataRoute.Sitemap = categories
      .filter((c) => c._count.deals >= MIN_CATEGORY_DEALS_FOR_INDEX)
      .map((c) => ({
        url: `${site}/categories/${c.slug}`,
        lastModified: c.updatedAt ?? now,
        changeFrequency: "daily" as const,
        priority: 0.85,
      }));

    const dealRoutes: MetadataRoute.Sitemap = deals.map((d) => ({
      url: `${site}/deals/${d.slug}`,
      lastModified: d.updatedAt || d.approvedAt || now,
      changeFrequency: "weekly" as const,
      priority: 0.75,
    }));

    return [...staticRoutes, ...categoryRoutes, ...dealRoutes];
  } catch (err) {
    console.error("[sitemap] DB query failed, returning static routes only", err);
    return staticRoutes;
  }
}
