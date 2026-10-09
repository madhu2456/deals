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
  "Curated, reviewed discounts on software, SaaS, and apps. Small catalog, no spam dumps. Offers change; confirm on each deal page.";

export const SITE_KEYWORDS = [
  "deals",
  "discounts",
  "coupon codes",
  "promo codes",
  "SaaS deals",
  "software discounts",
  "verified coupons",
  "tool discounts",
];

/** Creator / publisher entity for E-E-A-T */
export const PUBLISHER = {
  name: "Madhu Dadi",
  /** Hub apex — parent org / entity @id fragments. */
  url: "https://madhudadi.in",
  /** Person deep link for founder `url`, footer, and about. */
  profile: "https://madhudadi.in/profile/",
  blog: "https://madhudadi.in/blog",
  udemyEnroller: "https://udemyenroller.madhudadi.in",
  televault: "https://televault.madhudadi.in",
};

export const SEO_PARTNER = {
  name: "Adticks",
  url: "https://adticks.com",
  description: "SEO & GEO optimization",
};

/**
 * Fix #8 / F063: the 8 canonical Person identity anchors, in the same order
 * published by the rest of the fleet (portfolio, blog, enroller, televault).
 * `sameAs` is how a knowledge graph resolves "this Person is that Person", so
 * the list holds authority profiles only. No product or property domain is
 * ever allowed here — that would merge the founder entity into the website it
 * is linked from; properties link through publisher / author / creator.
 */
export const PERSON_SAME_AS = [
  "https://www.wikidata.org/wiki/Q139807441",
  "https://github.com/madhu2456",
  "https://www.linkedin.com/in/madhu-dadi-54684531",
  "https://x.com/madhu245",
  "https://medium.com/@madhu.kumar245",
  "https://dev.to/madhudadi",
  "https://www.youtube.com/@madhukumar245",
  "https://maps.google.com/?cid=CXaUijPkQhVkEBM",
] as const;

/**
 * Stable lastmod for static sitemap entries (/, /deals, /categories, /about,
 * /affiliate-disclosure). These pages change only when repo content changes,
 * so a constant beats a generation-time clock stamp: the sitemap must never
 * report "modified just now" (F236). Bump this when static copy changes.
 */
export const SITE_STATIC_LAST_MODIFIED = "2026-08-16T00:00:00.000Z";
