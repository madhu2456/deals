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
assert(
  org.parentOrganization["@id"] === "https://madhudadi.in/#organization",
  "org parentOrganization"
);
assert(org.founder["@id"] === "https://madhudadi.in/#person", "org founder @id");
assert(!("sameAs" in org), "org has no sameAs (Fix #8)");

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
  discountType: "PERCENTAGE",
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
// strict price parse: "$299.99" → 299.99 (number), USD, no monthly signal
assert(nestedOffer.price === 299.99, "adobe price parsed as number");
assert(nestedOffer.priceCurrency === "USD", "adobe currency is USD");
assert(!JSON.stringify(offer).includes("billingDuration"), "adobe has no billingDuration");
const adobeSpec = nestedOffer.priceSpecification as Record<string, unknown>;
assert(adobeSpec["@type"] === "UnitPriceSpecification", "adobe priceSpecification type is UnitPriceSpecification");
assert(adobeSpec.price === 299.99, "adobe priceSpecification price");
assert(adobeSpec.description === "50%", "adobe priceSpecification description");
assertMatch(nestedOffer["@id"] as string, /#offer$/, "offer @id ends #offer");
assertMatch(adobeSpec["@id"] as string, /#priceSpec$/, "priceSpec @id ends #priceSpec");

// ── Free-tier fixtures: price "0", USD, never a monthly signal ──
function freeTierSchema(
  title: string,
  slug: string,
  discountValue: string,
  discountedPrice: string,
  originalPrice?: string
) {
  const s = offerSchema({
    title,
    slug,
    description: `${title} — free tier deal`,
    brandName: title,
    dealUrl: "https://example.com/deal",
    discountType: "FREE_TIER",
    discountValue,
    discountedPrice,
    ...(originalPrice ? { originalPrice } : {}),
    category: { name: "Software", slug: "software" },
  });
  const o = s.offers as Record<string, unknown>;
  assert(o.price === "0", `${title}: free tier price is string "0"`);
  assert(o.priceCurrency === "USD", `${title}: free tier currency is USD`);
  assert(!JSON.stringify(s).includes("billingDuration"), `${title}: no billingDuration on free tier`);
  return s;
}

const dashlane = freeTierSchema("Dashlane Premium", "dashlane-6mo", "6 months free", "Free (6 months)", "Premium");
const dashlaneSpec = (dashlane.offers as Record<string, unknown>).priceSpecification as Record<string, unknown>;
assert(dashlaneSpec.description === "6 months free", "dashlane priceSpec description is discountValue");

// 12 months free (Google AI Plus) and 4 years free (Down Dog)
freeTierSchema("Google AI Plus", "google-ai-plus-12mo", "12 months free", "Free (12 months)", "Google AI Plus");
freeTierSchema("Down Dog", "down-dog-4y", "4 years free", "Free (4 years)", "Subscription");

// originalPrice "$75/mo" must NOT leak a monthly signal onto a free offer
freeTierSchema("GenieAI Pro", "genieai-1mo", "1 month free", "Free (1 month)", "$75/mo");

// 12-month free deal must never say P1M (regression for the substring bug)
freeTierSchema("Hidely VPN", "hidely-12mo", "12 months free", "Free", "Premium (12 mo)");

freeTierSchema("PDF2Go", "pdf2go-free", "Free Premium", "Free", "Premium");

// FREE_TIER wins over a parseable discountedPrice — admin mistakes can't fabricate a price on a free deal
const freeTierParseable = freeTierSchema("Free Tier Parseable Deal", "freetier-parseable", "6 months free", "$29.99");
const ftSpec = (freeTierParseable.offers as Record<string, unknown>).priceSpecification as Record<string, unknown>;
assert(ftSpec.description === "6 months free", "freetier-parseable priceSpec description is discountValue");

// ── FIXED deals: strict price parse ──
const opencode = offerSchema({
  title: "OpenCode — AI coding agent from $5/month",
  slug: "opencode-5",
  description: "AI coding agent from $5 per month",
  brandName: "OpenCode",
  dealUrl: "https://example.com/opencode",
  discountType: "FIXED",
  discountValue: "$5/mo",
  discountedPrice: "$5/mo",
  category: { name: "Software", slug: "software" },
});
const ocOffer = opencode.offers as Record<string, unknown>;
assert(ocOffer.price === 5, "opencode price 5");
assert(ocOffer.priceCurrency === "USD", "opencode currency USD");
assert(ocOffer.billingDuration === undefined, "opencode billingDuration NOT on the offer");
const ocSpec = ocOffer.priceSpecification as Record<string, unknown>;
assert(ocSpec["@type"] === "UnitPriceSpecification", "opencode priceSpecification type is UnitPriceSpecification");
assert(ocSpec.price === 5, "opencode priceSpecification price");
assert(ocSpec.billingDuration === "P1M", "opencode billingDuration P1M on priceSpecification");

const inrDeal = offerSchema({
  title: "INR Deal",
  slug: "inr-deal",
  description: "INR priced deal",
  brandName: "INR Brand",
  dealUrl: "https://example.com/inr",
  discountType: "FIXED",
  discountValue: "₹12,999/mo",
  discountedPrice: "₹12,999/mo",
  category: { name: "Software", slug: "software" },
});
const inrOffer = inrDeal.offers as Record<string, unknown>;
assert(inrOffer.price === 12999, "INR comma-strip: ₹12,999/mo → 12999 (not 1.299)");
assert(inrOffer.priceCurrency === "INR", "INR currency");
assert(inrOffer.billingDuration === undefined, "INR billingDuration NOT on the offer");
const inrSpec = inrOffer.priceSpecification as Record<string, unknown>;
assert(inrSpec["@type"] === "UnitPriceSpecification", "INR priceSpecification type is UnitPriceSpecification");
assert(inrSpec.billingDuration === "P1M", "INR billingDuration P1M on priceSpecification");

const fiveDotZeroMo = offerSchema({
  title: "Five Dot Zero Deal",
  slug: "five-dot-zero",
  description: "Fixed deal with decimal monthly price",
  brandName: "Sample Brand",
  dealUrl: "https://example.com/five",
  discountType: "FIXED",
  discountValue: "$5.00/mo",
  discountedPrice: "$5.00/mo",
  category: { name: "Software", slug: "software" },
});
const fdzOffer = fiveDotZeroMo.offers as Record<string, unknown>;
assert(fdzOffer.price === 5, "five-dot-zero price 5");
assert(fdzOffer.priceCurrency === "USD", "five-dot-zero currency USD");
assert(fdzOffer.billingDuration === undefined, "five-dot-zero billingDuration NOT on the offer");
const fdzSpec = fdzOffer.priceSpecification as Record<string, unknown>;
assert(fdzSpec["@type"] === "UnitPriceSpecification", "five-dot-zero priceSpecification type is UnitPriceSpecification");
assert(fdzSpec.billingDuration === "P1M", "five-dot-zero billingDuration P1M on priceSpecification");

// ── Unparseable price strings: price omitted, offer stays valid ──
function expectNoPrice(
  title: string,
  slug: string,
  discountedPrice: string,
  discountValue: string,
  discountType = "FIXED"
) {
  const s = offerSchema({
    title,
    slug,
    description: `${title} — sample offer`,
    brandName: title,
    dealUrl: "https://example.com/deal",
    discountType,
    discountValue,
    discountedPrice,
    category: { name: "Software", slug: "software" },
  });
  const o = s.offers as Record<string, unknown>;
  assert(o.price === undefined, `${title}: no price`);
  assert(o.priceCurrency === undefined, `${title}: no priceCurrency`);
  assert(o.priceSpecification === undefined, `${title}: no priceSpecification`);
  assert(!("price" in o), `${title}: offer has no "price" key`);
  return s;
}

// "$20 off" — free-text discount, no parseable price
expectNoPrice("Twenty Off Deal", "twenty-off", "$20 off", "$20 off");
// "$1.2.3" — multi-dot rejected
expectNoPrice("Multi Dot Deal", "multi-dot", "$1.2.3", "$1.2.3");
// "€1.000,50" — European comma-decimal is intentionally rejected (documented limitation)
expectNoPrice("Euro Decimal Deal", "euro-decimal", "€1.000,50", "€1.000,50");
// "€5,50" — European decimal comma rejected (would otherwise misparse as 550)
expectNoPrice("Euro 550 Deal", "euro-550", "€5,50", "€5,50");
// "$5/mo." — trailing period breaks the anchored match (documented contract: omission, never fabrication)
expectNoPrice("Trailing Period Deal", "trailing-period", "$5/mo.", "$5/mo.");
// "US$5" — currency prefix not anchored at the start (documented contract)
expectNoPrice("Currency Prefix Deal", "currency-prefix", "US$5", "US$5");

// "Save 20%" — unparseable PERCENTAGE; Offer still valid
const save20 = offerSchema({
  title: "Save 20% Sample",
  slug: "save-20",
  description: "Percentage discount sample",
  brandName: "Sample Brand",
  dealUrl: "https://example.com/save20",
  discountType: "PERCENTAGE",
  discountValue: "Save 20%",
  discountedPrice: "Save 20%",
  category: { name: "Software", slug: "software" },
  expiryDate: new Date("2027-01-01"),
});
const save20Offer = save20.offers as Record<string, unknown>;
assert(save20Offer["@type"] === "Offer", "save20 offer type still valid");
assertMatch(save20Offer["@id"] as string, /#offer$/, "save20 offer @id ends #offer");
assert(save20Offer.availability === "https://schema.org/InStock", "save20 availability present");
assert(save20Offer.price === undefined, "save20 has no price");

// LIFETIME is intentionally NOT treated as free-tier in this fix (no LIFETIME deals exist in seed)
const lifetime = offerSchema({
  title: "Lifetime Deal",
  slug: "lifetime-deal",
  description: "Lifetime access sample",
  brandName: "Sample Brand",
  dealUrl: "https://example.com/lifetime",
  discountType: "LIFETIME",
  discountValue: "Free (lifetime)",
  discountedPrice: "Free (lifetime)",
  category: { name: "Software", slug: "software" },
});
const lifetimeOffer = lifetime.offers as Record<string, unknown>;
assert(lifetimeOffer.price === undefined, "LIFETIME: price omitted (not treated as free tier)");

// Past-expiry: OutOfStock AND a real price both present
const pastExpiry = offerSchema({
  title: "Past Expiry Deal",
  slug: "past-expiry",
  description: "Expired fixed deal",
  brandName: "Sample Brand",
  dealUrl: "https://example.com/expired",
  discountType: "FIXED",
  discountValue: "$29.99",
  discountedPrice: "$29.99",
  category: { name: "Software", slug: "software" },
  expiryDate: new Date("2020-01-01"),
});
const pastOffer = pastExpiry.offers as Record<string, unknown>;
assert(pastOffer.availability === "https://schema.org/OutOfStock", "past-expiry availability OutOfStock");
assert(pastOffer.price === 29.99, "past-expiry price still present");
assert(pastOffer.priceCurrency === "USD", "past-expiry currency USD");

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
