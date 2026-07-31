/**
 * Smoke-test JSON-LD schema generators and OG image helpers.
 * Run: pnpm exec tsx scripts/verify-jsonld.ts
 */
import { organizationSchema, websiteSchema, breadcrumbSchema, webPageSchema, offerSchema, faqSchema, HOME_FAQS } from "../lib/seo/json-ld";
import { defaultOgImage, defaultOgImages, SITE_NAME, SITE_NAME_SHORT, SITE_TAGLINE, PUBLISHER } from "../lib/site";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function assertMatch(text: string, pattern: RegExp, msg: string): void {
  assert(pattern.test(text), msg);
}

// ── Organization schema ──
const org = organizationSchema();
assert(org["@type"] === "Organization", "org type");
assert(org.name === SITE_NAME, "org name matches config");
assert(org.founder["@type"] === "Person", "org founder type");
assert(org.founder.name === PUBLISHER.name, "org founder name");
assert(org.sameAs.length >= 3, "org sameAs links");

// ── Website schema ──
const web = websiteSchema();
assert(web["@type"] === "WebSite", "web type");
assert(web.inLanguage === "en-IN", "web locale");
assert(web.potentialAction["@type"] === "SearchAction", "web search action");

// ── Breadcrumb schema ──
const crumbs = breadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "Deals", path: "/deals" },
  { name: "My Deal", path: "/deals/my-deal" },
]);
assert(crumbs["@type"] === "BreadcrumbList", "breadcrumb type");
assert(crumbs.itemListElement.length === 3, "breadcrumb items count");
assert(crumbs.itemListElement[2].name === "My Deal", "breadcrumb last item");

// ── WebPage schema ──
const wp = webPageSchema({
  title: "Test Page",
  description: "Test desc",
  path: "/deals/test",
  type: "WebPage",
  dateModified: new Date("2026-07-30"),
});
assert(wp["@type"] === "WebPage", "webpage type");
assert(wp.name === "Test Page", "webpage name");
assert(wp.inLanguage === "en-IN", "webpage locale");

// ── Offer/Product schema ──
const offer = offerSchema({
  title: "50% off Adobe CC",
  slug: "adobe-cc-50",
  description: "Get 50% off Adobe Creative Cloud annual plan",
  brandName: "Adobe",
  brandUrl: "https://adobe.com",
  dealUrl: "https://adobe.com/deals/cc",
  couponCode: "CREATIVE50",
  discountValue: "50%",
  originalPrice: "$599.99",
  discountedPrice: "$299.99",
  category: { name: "Software", slug: "software" },
  expiryDate: new Date("2027-01-01"),
  approvedAt: new Date("2026-07-01"),
});
assert(offer["@type"] === "Product", "offer product type");
assert(offer.name === "50% off Adobe CC", "offer name");
assert(offer.offers["@type"] === "Offer", "offer nested offer type");
// couponCode lives in disambiguatingDescription, not as a top-level Offer key
assert(offer.offers.couponCode === undefined, "couponCode not on Offer directly");
const nestedOffer = offer.offers as Record<string, unknown>;
assert(typeof nestedOffer.disambiguatingDescription === "string", "offer has disambiguatingDescription");
assertMatch(nestedOffer.disambiguatingDescription as string, /CREATIVE50/, "offer code in disambiguatingDescription");
assert(offer.brand.name === "Adobe", "brand name");
assert(offer.category === "Software", "category");

// ── FAQ schema ──
const faq = faqSchema([
  { question: "Is this free?", answer: "Yes, absolutely free." },
]);
assert(faq["@type"] === "FAQPage", "faq type");
assert(faq.mainEntity.length === 1, "faq 1 question");
assert(faq.mainEntity[0].name === "Is this free?", "faq question text");

// ── Home FAQs ──
assert(HOME_FAQS.length >= 4, "home faqs count");
assert(HOME_FAQS[0].question.includes(SITE_NAME_SHORT), "home faq0 mentions brand");
for (const faq of HOME_FAQS) {
  assert(faq.question.length > 0, `faq question non-empty: ${faq.question.slice(0, 30)}`);
  assert(faq.answer.length > 20, `faq answer ≥20 chars: ${faq.question.slice(0, 30)}`);
}

// ── OG image ──
const og = defaultOgImage();
assert(og.width === 1200, "og width 1200");
assert(og.height === 630, "og height 630");
assertMatch(og.url, /opengraph-image/, "og url path");
const ogs = defaultOgImages();
assert(ogs.length === 1, "og images array length 1");
assert(ogs[0].alt === SITE_NAME, "og image alt matches site name");

// ── Site tagline ──
assert(SITE_TAGLINE.length > 5, "tagline non-empty");
assert(SITE_NAME_SHORT === "Deals", "short brand");
assert(PUBLISHER.name === "Madhu Dadi", "publisher name");

console.log("OK: JSON-LD schemas + OG images + site config verified");
