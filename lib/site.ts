/** Canonical site configuration for SEO / AEO / GEO */

export const SITE_NAME = "Deals";
export const SITE_TAGLINE = "Verified deals, coupons, and discounts for everyone";

export function getSiteUrl() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://deals.madhudadi.in";
  return raw;
}

export function absoluteUrl(path = "/") {
  const base = getSiteUrl();
  if (!path || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export const SITE_DESCRIPTION =
  "Find verified deals, coupon codes, and exclusive discounts on software, SaaS tools, cloud hosting, design apps, and everyday products. Curated offers updated regularly — no spam.";

export const SITE_KEYWORDS = [
  "deals",
  "discounts",
  "coupon codes",
  "promo codes",
  "SaaS deals",
  "software discounts",
  "verified coupons",
  "tool discounts",
  "exclusive offers",
];

/** Creator / publisher entity for E-E-A-T */
export const PUBLISHER = {
  name: "Madhu Dadi",
  url: "https://madhudadi.in",
  blog: "https://madhudadi.in/blog",
  udemyEnroller: "https://udemyenroller.madhudadi.in",
};

export const SEO_PARTNER = {
  name: "Adticks",
  url: "https://adticks.com",
  description: "SEO & GEO optimization",
};

export const SAME_AS = [
  PUBLISHER.url,
  PUBLISHER.blog,
  PUBLISHER.udemyEnroller,
  SEO_PARTNER.url,
  "https://github.com/madhu2456/deals",
];
