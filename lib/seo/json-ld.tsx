import {
  absoluteUrl,
  defaultOgImage,
  getSiteUrl,
  PUBLISHER,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_NAME_SHORT,
  SITE_TAGLINE,
} from "@/lib/site";

type JsonValue = Record<string, unknown> | Record<string, unknown>[];

/** Safe JSON-LD script for Next.js App Router */
export function JsonLd({ data }: { data: JsonValue }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${getSiteUrl()}/#organization`,
    name: SITE_NAME,
    url: getSiteUrl(),
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/icon-512.png"),
      width: 512,
      height: 512,
    },
    image: absoluteUrl("/icon-512.png"),
    description: SITE_DESCRIPTION,
    founder: {
      "@type": "Person",
      // Stable hub fragment for entity identity; public profile is the deep link.
      "@id": `${PUBLISHER.url}/#person`,
      name: PUBLISHER.name,
      url: PUBLISHER.profile,
    },
    parentOrganization: { "@id": `${PUBLISHER.url}/#organization` },
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${getSiteUrl()}/#website`,
    name: SITE_NAME,
    alternateName: [SITE_NAME_SHORT, "Deals Directory", SITE_TAGLINE],
    url: getSiteUrl(),
    description: SITE_DESCRIPTION,
    publisher: { "@id": `${getSiteUrl()}/#organization` },
    inLanguage: "en-IN",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${getSiteUrl()}/deals?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbSchema(
  items: { name: string; path: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function webPageSchema({
  title,
  description,
  path,
  type = "WebPage",
  dateModified,
}: {
  title: string;
  description: string;
  path: string;
  type?: "WebPage" | "CollectionPage" | "AboutPage" | "ContactPage";
  dateModified?: string | Date | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": type,
    "@id": `${absoluteUrl(path)}#webpage`,
    url: absoluteUrl(path),
    name: title,
    description,
    isPartOf: { "@id": `${getSiteUrl()}/#website` },
    about: { "@id": `${getSiteUrl()}/#organization` },
    inLanguage: "en-IN",
    ...(dateModified
      ? {
          dateModified:
            typeof dateModified === "string"
              ? dateModified
              : dateModified.toISOString(),
        }
      : {}),
  };
}

export function itemListSchema({
  name,
  description,
  path,
  items,
}: {
  name: string;
  description: string;
  path: string;
  items: {
    name: string;
    path: string;
    description?: string | null;
    image?: string | null;
    /** Offer facts from dealOfferFacts — same data source as the Offer schema (F240). */
    offer?: {
      price: string | number | null;
      priceCurrency?: string | null;
      availability: string;
      validThrough?: string | null;
    } | null;
  }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    description,
    url: absoluteUrl(path),
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
      ...(item.description ? { description: item.description } : {}),
      ...(item.image ? { image: item.image } : {}),
      // Price + availability per listing item (F240): derived from the same
      // deal data as the deal-page Offer schema so the listing and the page
      // never disagree. Emitted as `item` (an Offer) — the ListItem-level
      // offer facts are omitted when the deal has no parseable price.
      ...(item.offer
        ? {
            item: {
              "@type": "Offer",
              name: item.name,
              url: absoluteUrl(item.path),
              ...(item.offer.price !== null
                ? { price: item.offer.price, priceCurrency: item.offer.priceCurrency ?? "USD" }
                : {}),
              availability: item.offer.availability,
              ...(item.offer.validThrough
                ? { validThrough: item.offer.validThrough }
                : {}),
            },
          }
        : {}),
    })),
  };
}

const CURRENCY_BY_SYMBOL: Record<string, string> = { $: "USD", "₹": "INR", "€": "EUR", "£": "GBP" };
// Full-match, currency-anchored. One optional decimal group, no multi-dot. Optional trailing monthly suffix.
const STRICT_PRICE_RE = /^[$₹€£]\s*\d[\d,]*(?:\.\d+)?\s*(?:\/mo|\/month| per month| monthly)?$/i;

/**
 * Parse a price string ONLY when it is a complete, currency-anchored amount
 * ("$299.99", "₹12,999/mo"). Free-text ("Free (6 months)", "Save 20%") never
 * matches, so a free deal cannot accidentally produce a price.
 */
function parseStrictPrice(
  raw: string | null | undefined
): { price: number | null; currency: string | null; isMonthly: boolean } {
  const s = (raw ?? "").trim();
  const m = STRICT_PRICE_RE.exec(s);
  if (!m) return { price: null, currency: null, isMonthly: false };
  // Digits portion of the match, with the trailing monthly suffix removed.
  const digits = m[0].replace(/(?:\/mo|\/month| per month| monthly)$/i, "");
  // European decimal comma ("€5,50") would misparse as 550 after comma-strip — reject instead of fabricating.
  // Valid thousands groups stay: ₹12,999 / ₹5,00,000 / $1,234 / $1,234.56 (dot present → rule skipped).
  if (!digits.includes(".") && /,\d{1,2}$/.test(digits)) {
    return { price: null, currency: null, isMonthly: false };
  }
  // Strip thousands separators BEFORE parseFloat (₹1,299 → 1299, never 1.299).
  const num = Number.parseFloat(m[0].replace(/,/g, "").replace(/[$₹€£]/g, ""));
  // Belt-and-suspenders — the anchored regex already blocks multi-dot strings.
  if (!Number.isFinite(num)) return { price: null, currency: null, isMonthly: false };
  // Magnitude cap — absurd values like "$99999999999999999999" (→ 1e+23) are data errors, not prices.
  if (num > 1e7) return { price: null, currency: null, isMonthly: false };
  const isMonthly = /(?:\/mo|\/month| per month| monthly)$/i.test(m[0]);
  const currency = CURRENCY_BY_SYMBOL[m[0].charAt(0)] ?? null;
  return { price: num, currency, isMonthly };
}

/** First currency symbol found across the given strings, defaulting to USD. */
function detectCurrency(strings: (string | null | undefined)[]): string {
  for (const s of strings) {
    const symbol = s?.match(/[$₹€£]/)?.[0];
    if (symbol) return CURRENCY_BY_SYMBOL[symbol];
  }
  return "USD";
}

/**
 * Offer facts (price, currency, availability, expiry) shared by the
 * Product/Offer schema and ItemList item offers (F240). ItemList must derive
 * price + availability from the SAME deal data as the Offer schema so the
 * listing and the deal page never disagree.
 *
 * Perpetual deals (no expiryDate) keep `availability: InStock` with NO
 * `validThrough` — they have no end date, and schema.org has no
 * "no end date" value. This is a deliberate, documented policy (F234), not a
 * silent stale flag: `InStock` means "approved and listed, no known expiry"
 * on THIS site; merchant-side availability is monitored separately by
 * scripts/check-offer-validity.ts (daily cron) and admin review. Dated deals
 * past their expiry emit OutOfStock.
 */
export function dealOfferFacts(deal: {
  discountedPrice?: string | null;
  originalPrice?: string | null;
  discountValue?: string | null;
  discountType: string;
  expiryDate?: Date | string | null;
}) {
  const strict = parseStrictPrice(deal.discountedPrice);
  const isFreeTier = deal.discountType === "FREE_TIER";
  const currency = detectCurrency([deal.discountedPrice, deal.originalPrice, deal.discountValue]);
  // FREE_TIER wins over any parseable string (admin mistakes can't fabricate a price on a free deal).
  const priceValue: string | number | null = isFreeTier ? "0" : strict.price;
  const availability = deal.expiryDate
    ? new Date(deal.expiryDate) < new Date()
      ? "https://schema.org/OutOfStock"
      : "https://schema.org/InStock"
    : "https://schema.org/InStock";
  // validThrough ONLY when the deal has an expiry date (F234): emitting one
  // for perpetual deals would falsely claim the offer ends.
  const validThrough = deal.expiryDate
    ? typeof deal.expiryDate === "string"
      ? deal.expiryDate
      : deal.expiryDate.toISOString()
    : null;
  return {
    price: priceValue,
    priceCurrency: currency,
    isMonthly: strict.isMonthly,
    availability,
    validThrough,
  };
}

export function offerSchema(deal: {
  title: string;
  slug: string;
  description: string;
  shortDescription?: string | null;
  brandName: string;
  brandUrl?: string | null;
  dealUrl: string;
  couponCode?: string | null;
  discountValue?: string | null;
  originalPrice?: string | null;
  discountedPrice?: string | null;
  discountType: string;
  logoUrl?: string | null;
  expiryDate?: Date | string | null;
  approvedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  category: { name: string; slug: string };
}) {
  const url = absoluteUrl(`/deals/${deal.slug}`);
  const facts = dealOfferFacts(deal);
  const availability = facts.availability;

  // ── Price extraction (shared with ItemList via dealOfferFacts) ─────────
  const priceValue = facts.price;
  const hasPrice = priceValue !== null;
  const currency = facts.priceCurrency;
  // Monthly billing signal ONLY for real (non-free) prices, derived ONLY from the discountedPrice match.
  const billingDuration = hasPrice && !(deal.discountType === "FREE_TIER") && facts.isMonthly ? "P1M" : null;

  const offer: Record<string, unknown> = {
    "@type": "Offer",
    "@id": `${url}#offer`,
    name: deal.title,
    description: deal.shortDescription || deal.description,
    ...(hasPrice ? { price: priceValue, priceCurrency: currency } : {}),
    // Landing page on our site (mainEntityOfPage) + merchant URL (url)
    url: deal.dealUrl,
    mainEntityOfPage: url,
    // Where the shopper redeems the deal
    ...(deal.dealUrl ? { additionalProperty: {
      "@type": "PropertyValue",
      name: "merchantDealUrl",
      value: deal.dealUrl,
    }} : {}),
    availability,
    // When the offer first went live (approval date or update date)
    ...(deal.approvedAt
      ? {
          validFrom:
            typeof deal.approvedAt === "string"
              ? deal.approvedAt
              : deal.approvedAt.toISOString(),
        }
      : deal.updatedAt
      ? {
          validFrom:
            typeof deal.updatedAt === "string"
              ? deal.updatedAt
              : deal.updatedAt.toISOString(),
        }
      : {}),
    itemOffered: {
      "@type": "Service",
      name: deal.title,
      provider: {
        "@type": "Organization",
        name: deal.brandName,
        ...(deal.brandUrl ? { url: deal.brandUrl } : {}),
      },
    },
    seller: {
      "@type": "Organization",
      name: deal.brandName,
      ...(deal.brandUrl ? { url: deal.brandUrl } : {}),
    },
    category: deal.category.name,
    ...(deal.couponCode
      ? {
          disambiguatingDescription: `Coupon code: ${deal.couponCode}`,
        }
      : {}),
    ...(deal.discountValue && hasPrice
      ? {
          priceSpecification: {
            // billingDuration is a UnitPriceSpecification property (schema.org), not an Offer property
            "@type": "UnitPriceSpecification",
            "@id": `${url}#priceSpec`, // new stable fragment
            price: priceValue,
            priceCurrency: currency,
            ...(billingDuration ? { billingDuration } : {}),
            description: deal.discountValue,
            name: deal.discountValue,
          },
        }
      : {}),
    // validThrough ONLY for dated deals (F234): perpetual deals stay
    // InStock-without-validThrough (see dealOfferFacts policy comment).
    ...(facts.validThrough ? { validThrough: facts.validThrough } : {}),
  };

  // Product + Offer is widely understood by Google & AI extractors
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: deal.title,
    description: deal.shortDescription || deal.description,
    brand: {
      "@type": "Brand",
      name: deal.brandName,
    },
    category: deal.category.name,
    url,
    // Product.image: merchant logoUrl, else the deal OG image — never site icon-512.
    // og:type stays website (Next Metadata OpenGraphType has no "product");
    // this Product JSON-LD is the commerce type.
    image: [deal.logoUrl || defaultOgImage().url],
    offers: offer,
    ...(deal.updatedAt
      ? {
          dateModified:
            typeof deal.updatedAt === "string"
              ? deal.updatedAt
              : deal.updatedAt.toISOString(),
        }
      : {}),
  };
}

export function faqSchema(
  faqs: { question: string; answer: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

/** Homepage FAQs optimized for AEO / GEO citation */
export const HOME_FAQS = [
  {
    question: `What is ${SITE_NAME}?`,
    answer:
      `${SITE_NAME} (also called ${SITE_NAME_SHORT}) is a curated directory of verified software, SaaS, and app discounts. Listings are reviewed before they appear. Offers change; confirm the claim path on each deal page. Founded by Madhu Dadi.`,
  },
  {
    question: "Are the coupon codes and deals verified?",
    answer:
      "Deals are reviewed for clarity and terms; offers with a fixed expiry are checked periodically; some offers have no fixed expiry. Community submissions start as pending and only go live after review, so shoppers can claim them confidently.",
  },
  {
    question: "How do I claim a deal or use a coupon code?",
    answer:
      "Open the deal page, copy the coupon code if one is listed, then click Get Deal to visit the brand’s site. Apply the code at checkout or follow the steps on the offer page. Some deals need no code — just the special link.",
  },
  {
    question: "Can I submit a deal I found?",
    answer:
      "Yes. Use the Submit a Deal form to share a discount you discovered. Include the brand, URL, category, and a short description. We review submissions before publishing them for everyone.",
  },
  {
    question: `Is ${SITE_NAME_SHORT} free to use?`,
    answer:
      `Yes. Browsing, searching, and claiming listed deals on ${SITE_NAME} is free. There is no membership fee to view coupons or open offer links. Always confirm final pricing and eligibility on the merchant’s site.`,
  },
];
