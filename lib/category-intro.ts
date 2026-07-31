import { SITE_NAME, SITE_NAME_SHORT } from "@/lib/site";

export type CategoryIntroInput = {
  name: string;
  description?: string | null;
  dealCount: number;
  brandNames: string[]; // up to 5 distinct brands from deals
};

/**
 * Build unique, extractable intro copy for a category hub (AEO/GEO).
 * Always returns at least 2 short paragraphs + optional bullets.
 */
export function buildCategoryIntro(input: CategoryIntroInput): {
  heading: string;
  lead: string;
  body: string;
  bullets: string[];
} {
  const name = input.name.trim() || "this category";
  const count = Math.max(0, input.dealCount);
  const brands = input.brandNames.filter(Boolean).slice(0, 5);
  const brandPhrase =
    brands.length >= 2
      ? ` including ${brands.slice(0, -1).join(", ")} and ${brands[brands.length - 1]}`
      : brands.length === 1
        ? ` including ${brands[0]}`
        : "";

  const heading = `What ${name} deals are on ${SITE_NAME_SHORT}?`;

  const lead =
    input.description?.trim() ||
    `${SITE_NAME} lists verified ${name.toLowerCase()} deals, coupon codes, and exclusive offers. Every public listing is human-reviewed before it goes live.`;

  const body =
    count === 0
      ? `There are no live ${name.toLowerCase()} offers right now. Check back soon, browse other categories, or submit a deal you found for review.`
      : count === 1
        ? `Right now there is 1 live ${name.toLowerCase()} offer${brandPhrase}. Open the deal page for claim steps, eligibility notes, and any coupon code. Final price is always confirmed on the merchant site.`
        : `Right now there are ${count} live ${name.toLowerCase()} offers${brandPhrase}. Filter or search within this category, then open a deal for claim steps and codes. ${SITE_NAME_SHORT} does not process payments—merchants set final terms.`;

  const bullets = [
    `Browse only approved, non-expired ${name.toLowerCase()} listings`,
    "Copy coupon codes when listed, or use the claim link",
    `Submit new ${name.toLowerCase()} deals for moderation`,
  ];

  return { heading, lead, body, bullets };
}
