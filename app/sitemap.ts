import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    {
      url: `${site}/submit`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  try {
    const [categories, deals] = await Promise.all([
      prisma.category.findMany({
        where: { isActive: true },
        select: { slug: true, updatedAt: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.deal.findMany({
        where: {
          status: "APPROVED",
          OR: [{ expiryDate: null }, { expiryDate: { gt: now } }],
        },
        select: { slug: true, updatedAt: true, approvedAt: true },
        orderBy: { updatedAt: "desc" },
        // Cap for sitemap size safety
        take: 45_000,
      }),
    ]);

    const categoryRoutes: MetadataRoute.Sitemap = categories.map((c) => ({
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
