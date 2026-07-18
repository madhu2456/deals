import {
  absoluteUrl,
  getSiteUrl,
  PUBLISHER,
  SAME_AS,
  SITE_DESCRIPTION,
  SITE_NAME,
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
      name: PUBLISHER.name,
      url: PUBLISHER.url,
    },
    sameAs: SAME_AS,
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${getSiteUrl()}/#website`,
    name: SITE_NAME,
    alternateName: ["Deals Directory", SITE_TAGLINE],
    url: getSiteUrl(),
    description: SITE_DESCRIPTION,
    publisher: { "@id": `${getSiteUrl()}/#organization` },
    inLanguage: "en-US",
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
    inLanguage: "en-US",
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
    })),
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
  logoUrl?: string | null;
  expiryDate?: Date | string | null;
  updatedAt?: Date | string | null;
  category: { name: string; slug: string };
}) {
  const url = absoluteUrl(`/deals/${deal.slug}`);
  const availability = deal.expiryDate
    ? new Date(deal.expiryDate) < new Date()
      ? "https://schema.org/OutOfStock"
      : "https://schema.org/InStock"
    : "https://schema.org/InStock";

  const offer: Record<string, unknown> = {
    "@type": "Offer",
    name: deal.title,
    description: deal.shortDescription || deal.description,
    url,
    availability,
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
    ...(deal.discountValue
      ? { priceSpecification: { "@type": "PriceSpecification", description: deal.discountValue } }
      : {}),
    ...(deal.expiryDate
      ? {
          validThrough:
            typeof deal.expiryDate === "string"
              ? deal.expiryDate
              : deal.expiryDate.toISOString(),
        }
      : {}),
  };

  // Prefer Product when we have brand + offer; good for rich results / AI extraction
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: deal.title,
    description: deal.shortDescription || deal.description,
    brand: {
      "@type": "Brand",
      name: deal.brandName,
    },
    category: deal.category.name,
    url,
    image: deal.logoUrl || absoluteUrl("/icon-512.png"),
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
    question: "What is Deals?",
    answer:
      "Deals is a curated directory of verified discounts, coupon codes, and exclusive offers on software, SaaS tools, cloud services, design apps, learning platforms, and everyday products. Every public listing is reviewed before it appears.",
  },
  {
    question: "Are the coupon codes and deals verified?",
    answer:
      "Yes. Community submissions start as pending and only go live after review. Featured and approved deals are checked for a working offer URL, clear terms, and a sensible description so shoppers can claim them confidently.",
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
    question: "Is Deals free to use?",
    answer:
      "Browsing, searching, and claiming listed deals is free. There is no membership fee to view coupons or open offer links. Always confirm final pricing and eligibility on the merchant’s site.",
  },
];
