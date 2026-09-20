import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSiteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_STATIC_LAST_MODIFIED, PUBLISHER, SEO_PARTNER } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET() {
  const site = getSiteUrl();

  const [dealCount, categoryCount, latestDeal] = await Promise.all([
    prisma.deal.count({
      where: {
        status: "APPROVED",
        OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
      },
    }),
    prisma.category.count({
      where: {
        isActive: true,
        deals: {
          some: {
            status: "APPROVED",
            OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
          },
        },
      },
    }),
    prisma.deal.findFirst({
      where: {
        status: "APPROVED",
        OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
      },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  const lastUpdated = latestDeal?.updatedAt
    ? latestDeal.updatedAt.toISOString()
    : SITE_STATIC_LAST_MODIFIED;

  return NextResponse.json({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${site}/#organization`,
        name: SITE_NAME,
        url: site,
        description: SITE_DESCRIPTION,
        logo: `${site}/icon-512.png`,
        parentOrganization: { "@id": `${PUBLISHER.url}/#organization` },
        founder: {
          "@type": "Person",
          "@id": `${PUBLISHER.url}/#person`,
          name: PUBLISHER.name,
          url: PUBLISHER.profile,
        },
      },
      {
        "@type": "WebSite",
        "@id": `${site}/#website`,
        name: SITE_NAME,
        url: site,
        description: SITE_DESCRIPTION,
        inLanguage: "en-IN",
        publisher: { "@id": `${site}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: `${site}/deals?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "WebPage",
        "@id": `${site}/#webpage`,
        name: SITE_NAME,
        url: site,
        description: SITE_DESCRIPTION,
        isPartOf: { "@id": `${site}/#website` },
        about: {
          "@type": "Thing",
          name: "Verified deals and coupon codes",
          description:
            "Human-reviewed directory of software, SaaS, and product discounts.",
        },
      },
    ],
    stats: {
      approvedDeals: dealCount,
      activeCategories: categoryCount,
      lastUpdated,
    },
    endpoints: {
      llmsFeed: `${site}/llms.txt`,
      sitemap: `${site}/sitemap.xml`,
      robots: `${site}/robots.txt`,
    },
    parent: {
      publisher: PUBLISHER.url,
      blog: PUBLISHER.blog,
    },
    relatedProfiles: [
      `${PUBLISHER.url}/ai-profile.json`,
      `${PUBLISHER.blog}/ai-profile.json`,
      `${PUBLISHER.udemyEnroller}/ai-profile.json`,
      `${SEO_PARTNER.url}/ai-profile.json`,
      `${PUBLISHER.televault}/ai-profile.json`,
    ],
  });
}
