import { getSiteUrl, PUBLISHER, SITE_NAME } from "@/lib/site";

export const dynamic = "force-static";
export const revalidate = 86400;

export async function GET() {
  const site = getSiteUrl();

  const body = `# Pricing — ${SITE_NAME}

> Free public directory of reviewed software and SaaS discounts.
> Canonical: ${site}
> Author: ${PUBLISHER.name} (${PUBLISHER.url}/)

## Price to use this site

**Free.** There is no subscription, paywall, or listing fee for shoppers.

- Browse, search, and open merchant claim links at no charge.
- Community submissions are free and are reviewed before they go live.
- Some merchant links are affiliates; a purchase may earn a commission at no extra cost to you. See ${site}/affiliate-disclosure.

## Identity

- Site: ${SITE_NAME} — ${site}
- Publisher: ${PUBLISHER.name} — ${PUBLISHER.url}/
- Profile: ${PUBLISHER.profile}
- Related: Udemy Course Enroller — ${PUBLISHER.udemyEnroller}

## Notes

- Offers change. Confirm current price, eligibility, and steps on the deal page and the merchant site.
- This file is a machine-readable pricing statement for a free directory, not a consulting rate card.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
