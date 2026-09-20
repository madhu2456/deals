import type { MetadataRoute } from "next";
import { MIN_CATEGORY_DEALS_FOR_INDEX } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { getSiteUrl, SITE_STATIC_LAST_MODIFIED } from "@/lib/site";

/**
 * 24h ISR: revalidate = 86400 with generateSitemaps() chunking (WP-DEALS-08).
 * Note: dynamic = "force-dynamic" was replaced by real ISR and generateSitemaps().
 */
export const revalidate = 86400;

export const DEALS_PER_SITEMAP = 10_000;

export async function generateSitemaps() {
  const approvedNotExpired = {
    status: "APPROVED" as const,
    OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
  };
  try {
    const count = await prisma.deal.count({ where: approvedNotExpired });
    const totalChunks = Math.max(1, Math.ceil(count / DEALS_PER_SITEMAP));
    return Array.from({ length: totalChunks }, (_, id) => ({ id: String(id) }));
  } catch (err) {
    console.error("[generateSitemaps] DB query failed, returning single sitemap", err);
    return [{ id: "0" }];
  }
}

export default async function sitemap(props?: {
  id?: Promise<string | number> | string | number;
}): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  const currentTime = new Date();
  const rawId = props?.id !== undefined ? await props.id : 0;
  const chunkId = Number(rawId) || 0;

  // Static routes use a STABLE content date (SITE_STATIC_LAST_MODIFIED), never
  // the generation clock (F236): two fetches seconds apart must produce
  // byte-identical lastmods. Deal/category rows use DB columns below.
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: site,
      lastModified: SITE_STATIC_LAST_MODIFIED,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${site}/deals`,
      lastModified: SITE_STATIC_LAST_MODIFIED,
      changeFrequency: "hourly",
      priority: 0.95,
    },
    {
      url: `${site}/categories`,
      lastModified: SITE_STATIC_LAST_MODIFIED,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${site}/about`,
      lastModified: SITE_STATIC_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${site}/affiliate-disclosure`,
      lastModified: SITE_STATIC_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${site}/accessibility`,
      lastModified: SITE_STATIC_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${site}/contact`,
      lastModified: SITE_STATIC_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${site}/privacy`,
      lastModified: SITE_STATIC_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${site}/terms`,
      lastModified: SITE_STATIC_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    // /submit is noindex,follow (utility form) — omit from sitemap
  ];

  try {
    const approvedNotExpired = {
      status: "APPROVED" as const,
      OR: [{ expiryDate: null }, { expiryDate: { gt: currentTime } }],
    };

    // Category retention: retained in chunk 0 alongside static routes
    let categoryRoutes: MetadataRoute.Sitemap = [];
    if (chunkId === 0) {
      const categories = await prisma.category.findMany({
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
      });

      // Thin categories omitted until they have enough deals
      categoryRoutes = categories
        .filter((c) => c._count.deals >= MIN_CATEGORY_DEALS_FOR_INDEX)
        .map((c) => ({
          url: `${site}/categories/${c.slug}`,
          // updatedAt is non-nullable in the schema — a clock fallback would
          // reintroduce the deploy-time restamp (F236).
          lastModified: c.updatedAt,
          changeFrequency: "daily" as const,
          priority: 0.85,
        }));
    }

    const deals = await prisma.deal.findMany({
      where: approvedNotExpired,
      select: { slug: true, updatedAt: true, approvedAt: true },
      orderBy: { updatedAt: "desc" },
      skip: chunkId * DEALS_PER_SITEMAP,
      take: DEALS_PER_SITEMAP,
    });

    const dealRoutes: MetadataRoute.Sitemap = deals.map((d) => ({
      url: `${site}/deals/${d.slug}`,
      // DB columns only (updatedAt || approvedAt) — never the clock (F236).
      lastModified: d.updatedAt || d.approvedAt,
      changeFrequency: "weekly" as const,
      priority: 0.75,
    }));

    if (chunkId === 0) {
      return [...staticRoutes, ...categoryRoutes, ...dealRoutes];
    }
    // F-DISC-W6-02: If a chunk yields no deals, fall back to staticRoutes
    // to avoid emitting an empty <urlset> that triggers GSC schema warnings.
    if (dealRoutes.length === 0) {
      return staticRoutes;
    }
    return dealRoutes;
  } catch (err) {
    console.error("[sitemap] DB query failed, returning static routes only", err);
    return staticRoutes;
  }
}
