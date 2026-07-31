/** Canonical site configuration for SEO / AEO / GEO */

/** BCP 47 locale for dates and content language. */
export const SITE_LANGUAGE = "en-IN" as const;

/** Full brand for SEO, schema, titles (entity-disambiguated). */
export const SITE_NAME = "Deals by Madhu Dadi";
/** Compact mark for header/footer chrome. */
export const SITE_NAME_SHORT = "Deals";
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

/** Default social share image (app/opengraph-image.tsx → /opengraph-image). */
export function defaultOgImage() {
  return {
    url: absoluteUrl("/opengraph-image"),
    width: 1200,
    height: 630,
    alt: SITE_NAME,
  } as const;
}

export function defaultOgImages() {
  return [defaultOgImage()];
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
