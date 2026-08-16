import { prisma } from "@/lib/prisma";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { generateUniqueSlug } from "@/lib/slug";
import { truncateAtSentence } from "@/lib/format";

type CuratedDeal = {
  /** Stable URL slug — keep fixed so re-seeds skip instead of duplicating */
  slug: string;
  title: string;
  brandName: string;
  brandUrl: string;
  dealUrl: string;
  /** Logo image URL. Prefer null when no verified merchant asset is available.
   *  Do not use demo hosts (res.cloudinary.com/demo, kernel.org tux, generic
   *  linux icons) — DealCard already handles missing logoUrl without layout break. */
  logoUrl?: string | null;
  discountType: string;
  discountValue: string;
  originalPrice?: string | null;
  discountedPrice?: string | null;
  description: string;
  /** Complete-sentence short for meta + Offer JSON-LD. Derived if omitted. */
  shortDescription?: string;
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
    // No verified brand logo asset in-repo — null avoids Cloudinary demo placeholders
    logoUrl: null,
    description:
      "Get OpenCode, an AI coding agent built for the terminal and your editor, starting at $5 per month via this link. Use the link to claim the offer, then complete signup on OpenCode. Pricing and eligibility are confirmed on the merchant site at checkout.",
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
    // No verified PDF2Go brand asset — null (not kernel.org Tux demo)
    logoUrl: null,
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
    // No verified Down Dog brand asset — null (not generic linux SVG)
    logoUrl: null,
    notes:
      "School-issued email required. Official: https://www.downdogapp.com/universities",
  },
  {
    slug: "genieai-pro-1-month-founderpass",
    title: "GenieAI Pro — 1 month free with code FOUNDERPASS",
    brandName: "GenieAI",
    brandUrl: "https://www.genieai.co",
    dealUrl: "https://www.genieai.co",
    discountType: "FREE_TIER",
    discountValue: "1 month free",
    originalPrice: "$75/mo",
    discountedPrice: "Free (1 month)",
    couponCode: "FOUNDERPASS",
    description:
      "GenieAI is an AI legal assistant for contracts and documents — draft, review, and negotiate with AI built for business teams. New GenieAI users only: create an account with your work email, select the Genie Pro plan, and enter discount code FOUNDERPASS at checkout to get about one month of Pro (typically ~$75 value). Complete payment to start the subscription (main or virtual card works if the merchant accepts it). Optional but recommended: cancel before the trial/period renews if you do not want to continue paying. Eligibility, pricing, and billing terms are confirmed on GenieAI at signup — this deal is for new users only.",
    categorySlug: "ai-and-machine-learning",
    isFeatured: true,
    notes:
      "New users only. Code FOUNDERPASS on Genie Pro. Work email recommended. Cancel before renewal if trial continues paid.",
  },
  {
    slug: "hidely-vpn-premium-12-months-free",
    title: "Hidely VPN Premium — 12 months free",
    brandName: "Hidely VPN",
    brandUrl: "https://play.google.com/store/apps/details?id=com.hidely.hidely_vpn",
    dealUrl: "https://play.google.com/store/apps/details?id=com.hidely.hidely_vpn",
    discountType: "FREE_TIER",
    discountValue: "12 months free",
    originalPrice: "Premium (12 mo)",
    discountedPrice: "Free",
    couponCode: "HIDELY-VPN",
    shortDescription:
      "How to redeem Hidely VPN Premium (code HIDELY-VPN): install from the stated store, apply the code, confirm status. Offer can expire; this page is not hide.me.",
    description:
      "Hidely VPN Premium (Hidely, not hide.me) is 12 months free with redeem code HIDELY-VPN. How to claim: (1) Download Hidely VPN from the Google Play Store. (2) Complete sign-up and upgrade to the Premium plan. (3) Enter redeem code HIDELY-VPN. Confirm Premium status in the Hidely app. Offer availability and redemption rules are confirmed in-app; codes can expire or be limited.",
    categorySlug: "security-and-privacy",
    isFeatured: true,
    notes:
      "Redeem code HIDELY-VPN. Android Play Store flow. Verify code still works in-app. Hidely is not hide.me.",
  },
  {
    slug: "dashlane-premium-6-months-free",
    title: "Dashlane Premium — 6 months free",
    brandName: "Dashlane",
    brandUrl: "https://www.dashlane.com",
    dealUrl: "https://www.dashlane.com/cs/d-PEiUZsVsXp",
    discountType: "FREE_TIER",
    discountValue: "6 months free",
    originalPrice: "Premium",
    discountedPrice: "Free (6 months)",
    shortDescription:
      "Current Dashlane Premium offer on this page: how to claim, what you get, and that terms can change. Not Dashlane's discontinued Free plan (ended 16 Sep 2025).",
    description:
      "This is a six-month Dashlane Premium offer — not Dashlane's consumer Free plan, which ended on 16 September 2025. Open the claim link, create or sign in to your Dashlane account, and finish any steps Dashlane shows. Eligibility, region, and plan details are confirmed on Dashlane; the offer can change or expire. We do not invent an end date here.",
    categorySlug: "security-and-privacy",
    isFeatured: true,
    notes:
      "Claim link: https://www.dashlane.com/cs/d-PEiUZsVsXp — confirm the offer on Dashlane. Not the consumer Free plan that ended 16 Sep 2025.",
  },
  {
    slug: "google-ai-plus-12-months-free-internshala-india",
    title: "Google AI Plus — 12 months free via Internshala (India)",
    brandName: "Google AI Plus",
    brandUrl: "https://one.google.com",
    dealUrl: "https://internshala.com/google-ai-plus-free",
    discountType: "FREE_TIER",
    discountValue: "12 months free",
    originalPrice: "Google AI Plus",
    discountedPrice: "Free (12 months)",
    description:
      "Get Google AI Plus free for 12 months via Internshala. How to redeem: go to the Internshala offer page, click “Claim the offer now,” sign in with your Google account, and complete the Google One redemption flow. Requirements: must be in India, personal Google account, valid India-issued payment method and billing address in India. Existing Google One users can also claim. Promo is one-time use per account. After 12 months it may auto-renew — cancel before the free period ends if you do not want to pay. Eligibility, pricing, and renewal terms are confirmed by Google/Internshala at redemption.",
    categorySlug: "ai-and-machine-learning",
    isFeatured: true,
    notes:
      "India only. Internshala: https://internshala.com/google-ai-plus-free — cancel before auto-renew.",
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
    const shortDescription =
      sample.shortDescription?.trim() ||
      truncateAtSentence(sample.description);

    // Create-if-missing ONLY. Seeding must never touch existing rows: the old
    // upsert update-branch re-stamped status=APPROVED + approvedAt=new Date()
    // and overwrote title/description/notes/couponCode on every deploy —
    // re-approving admin-REJECTED/EXPIRED deals and re-stamping JSON-LD
    // validFrom/dateModified site-wide (F-DEAL-010). Admin edits and lifecycle
    // status are the source of truth for live rows; the seed only backfills
    // slugs that have never been inserted.
    const existing = await prisma.deal.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existing) {
      console.log(`  = ${sample.title} → /deals/${slug} (exists — untouched)`);
      continue;
    }

    await prisma.deal.create({
      data: {
        title: sample.title,
        slug,
        brandName: sample.brandName,
        brandUrl: sample.brandUrl,
        logoUrl: sample.logoUrl ?? null,
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
