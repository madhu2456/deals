import { prisma } from "@/lib/prisma";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { generateUniqueSlug } from "@/lib/slug";

type CuratedDeal = {
  /** Stable URL slug — keep fixed so re-seeds upsert instead of duplicating */
  slug: string;
  title: string;
  brandName: string;
  brandUrl: string;
  dealUrl: string;
  discountType: string;
  discountValue: string;
  originalPrice?: string | null;
  discountedPrice?: string | null;
  description: string;
  categorySlug: string;
  isFeatured?: boolean;
  couponCode?: string | null;
  notes?: string | null;
};

const CURATED_DEALS: CuratedDeal[] = [
  {
    // Matches prior seed slugify(title) so production upserts the same row
    slug: generateUniqueSlug("OpenCode — AI coding agent from $5/month"),
    title: "OpenCode — AI coding agent from $5/month",
    brandName: "OpenCode",
    brandUrl: "https://opencode.ai",
    dealUrl: "https://opencode.ai/go?ref=HHZGW4Q49Z",
    discountType: "FIXED",
    discountValue: "$5/mo",
    discountedPrice: "$5/mo",
    description:
      "Get OpenCode, an AI coding agent built for the terminal and your editor, starting at $5 per month via this exclusive link. Use the link to claim the offer, then complete signup on OpenCode. Pricing and eligibility are confirmed on the merchant site at checkout.",
    categorySlug: "ai-and-machine-learning",
    isFeatured: true,
  },
  {
    slug: "pdf2go-free-premium-student-email",
    title: "PDF2Go — Free Premium with student email",
    brandName: "PDF2Go",
    brandUrl: "https://www.pdf2go.com",
    dealUrl: "https://www.pdf2go.com/?ref_code=d62be546",
    discountType: "FREE_TIER",
    discountValue: "Free Premium",
    originalPrice: "Premium",
    discountedPrice: "Free",
    description:
      "PDF2Go is an online PDF toolkit for editing, converting, merging, and compressing files — free Premium access when you sign up with a school email. In most cases PDF2Go verifies your institution automatically and activates free premium; if not, contact their support. Global offer · Free · Web. Claim via our referral link, then complete signup on PDF2Go.",
    categorySlug: "productivity",
    isFeatured: true,
    notes:
      "Student email required. Referral: https://www.pdf2go.com/?ref_code=d62be546",
  },
  {
    slug: "down-dog-4-years-free-university",
    title: "Down Dog — 4 years free for university students",
    brandName: "Down Dog",
    brandUrl: "https://www.downdogapp.com",
    dealUrl: "https://www.downdogapp.com/universities",
    discountType: "FREE_TIER",
    discountValue: "4 years free",
    originalPrice: "Subscription",
    discountedPrice: "Free (4 years)",
    description:
      "University and higher-education students and faculty get four years of free Down Dog access — yoga, fitness, and wellness content at no cost if you qualify. You need a school-issued email from an accredited university or higher education institution. If your school uses .edu addresses, you typically receive free four-year access automatically on signup. Otherwise, apply for free access for your university on Down Dog’s universities page; once accepted, your school domain is added and anyone from your school can sign up for extended free access. Claim via the official universities page, then complete signup on Down Dog. Eligibility and terms are confirmed by Down Dog.",
    categorySlug: "health-and-wellness",
    isFeatured: true,
    notes:
      "School-issued email required. Official: https://www.downdogapp.com/universities",
  },
];

async function main() {
  console.log("Seeding categories...");

  for (const category of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }

  console.log(`Seeded ${DEFAULT_CATEGORIES.length} categories.`);

  const categories = await prisma.category.findMany();
  const categoryMap = new Map(categories.map((c) => [c.slug, c.id]));

  console.log("Seeding curated deals...");

  for (const sample of CURATED_DEALS) {
    const categoryId = categoryMap.get(sample.categorySlug);
    if (!categoryId) {
      console.warn(`Category ${sample.categorySlug} not found, skip: ${sample.title}`);
      continue;
    }

    const slug = sample.slug;
    const shortDescription = sample.description.slice(0, 140);

    await prisma.deal.upsert({
      where: { slug },
      update: {
        title: sample.title,
        brandName: sample.brandName,
        brandUrl: sample.brandUrl,
        dealUrl: sample.dealUrl,
        discountType: sample.discountType,
        discountValue: sample.discountValue,
        originalPrice: sample.originalPrice ?? null,
        discountedPrice: sample.discountedPrice ?? null,
        description: sample.description,
        shortDescription,
        categoryId,
        isFeatured: sample.isFeatured ?? false,
        couponCode: sample.couponCode ?? null,
        notes: sample.notes ?? null,
        status: "APPROVED",
        approvedAt: new Date(),
      },
      create: {
        title: sample.title,
        slug,
        brandName: sample.brandName,
        brandUrl: sample.brandUrl,
        dealUrl: sample.dealUrl,
        discountType: sample.discountType,
        discountValue: sample.discountValue,
        originalPrice: sample.originalPrice ?? null,
        discountedPrice: sample.discountedPrice ?? null,
        description: sample.description,
        shortDescription,
        categoryId,
        isFeatured: sample.isFeatured ?? false,
        couponCode: sample.couponCode ?? null,
        notes: sample.notes ?? null,
        status: "APPROVED",
        approvedAt: new Date(),
      },
    });

    console.log(`  ✓ ${sample.title} → /deals/${slug}`);
  }

  console.log(`Seeded ${CURATED_DEALS.length} curated deal(s).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
