import { prisma } from "@/lib/prisma";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { generateUniqueSlug } from "@/lib/slug";

const CURATED_DEALS = [
  {
    title: "OpenCode — AI coding agent from $5/month",
    brandName: "OpenCode",
    brandUrl: "https://opencode.ai",
    dealUrl: "https://opencode.ai/go?ref=HHZGW4Q49Z",
    discountType: "FIXED",
    discountValue: "$5/mo",
    description:
      "Get OpenCode, an AI coding agent built for the terminal and your editor, starting at $5 per month via this exclusive link. Use the link to claim the offer, then complete signup on OpenCode. Pricing and eligibility are confirmed on the merchant site at checkout.",
    categorySlug: "ai-and-machine-learning",
    isFeatured: true,
    couponCode: null as string | null,
  },
] as const;

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

    const slug = generateUniqueSlug(sample.title, []);

    await prisma.deal.upsert({
      where: { slug },
      update: {
        title: sample.title,
        brandName: sample.brandName,
        brandUrl: sample.brandUrl,
        dealUrl: sample.dealUrl,
        discountType: sample.discountType,
        discountValue: sample.discountValue,
        description: sample.description,
        shortDescription: sample.description.slice(0, 120),
        categoryId,
        isFeatured: sample.isFeatured,
        couponCode: sample.couponCode,
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
        description: sample.description,
        shortDescription: sample.description.slice(0, 120),
        categoryId,
        isFeatured: sample.isFeatured,
        couponCode: sample.couponCode,
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
