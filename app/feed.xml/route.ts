import { prisma } from "@/lib/prisma";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_LANGUAGE,
  absoluteUrl,
  getSiteUrl,
} from "@/lib/site";

/**
 * RSS 2.0 feed of the latest verified deals.
 * Mirror of app/sitemap.ts: force-dynamic + hourly revalidate so the feed
 * stays fresh without hammering the DB, and a static-only fallback on DB errors.
 */
export const revalidate = 3600;
export const dynamic = "force-dynamic";

const FEED_PATH = "/feed.xml";
const FEED_TITLE = `${SITE_NAME} — Verified Deals, Coupons & Discounts`;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(date: Date): string {
  return date.toUTCString();
}

export async function GET() {
  const site = getSiteUrl();
  const now = new Date();
  const items: string[] = [];

  try {
    const deals = await prisma.deal.findMany({
      where: {
        AND: [
          { status: "APPROVED" },
          { OR: [{ expiryDate: null }, { expiryDate: { gt: now } }] },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        title: true,
        slug: true,
        shortDescription: true,
        description: true,
        discountValue: true,
        discountedPrice: true,
        couponCode: true,
        brandName: true,
        updatedAt: true,
        category: { select: { name: true } },
      },
    });

    for (const deal of deals) {
      const title = escapeXml(deal.title);
      const link = absoluteUrl(`/deals/${deal.slug}`);
      const guid = link;
      const brand = deal.brandName ? escapeXml(deal.brandName) : "";
      const discount = deal.discountValue
        ? escapeXml(deal.discountValue)
        : "";
      const code = deal.couponCode ? escapeXml(deal.couponCode) : "";
      const category = deal.category?.name
        ? escapeXml(deal.category.name)
        : "Deals";

      const summary = [
        deal.shortDescription || deal.description,
        discount ? `Discount: ${discount}.` : "",
        brand ? `Brand: ${brand}.` : "",
        code ? `Coupon code: ${code}.` : "",
        "Verify current terms and eligibility on the merchant's website.",
      ]
        .filter(Boolean)
        .join(" ");

      items.push(`    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${guid}</guid>
      <description>${escapeXml(summary)}</description>
      <category>${category}</category>
      <pubDate>${toRfc822(deal.updatedAt)}</pubDate>
    </item>`);
    }
  } catch (err) {
    console.error("[feed.xml] DB query failed, returning empty feed", err);
  }

  const itemsBlock = items.join("\n");
  const language = SITE_LANGUAGE.toLowerCase();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${absoluteUrl("/deals")}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>${language}</language>
    <atom:link href="${site}${FEED_PATH}" rel="self" type="application/rss+xml"/>
${itemsBlock}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
