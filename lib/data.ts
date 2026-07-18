import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const publicDealSelect = {
  id: true,
  title: true,
  slug: true,
  shortDescription: true,
  description: true,
  discountType: true,
  discountValue: true,
  originalPrice: true,
  discountedPrice: true,
  couponCode: true,
  dealUrl: true,
  brandName: true,
  brandUrl: true,
  logoUrl: true,
  status: true,
  isFeatured: true,
  expiryDate: true,
  createdAt: true,
  updatedAt: true,
  clicks: true,
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      color: true,
    },
  },
} as const;

export type PublicDeal = Awaited<ReturnType<typeof getApprovedDeals>>[number];

/** Deals that are still valid for public display (not past expiry). */
function notExpiredFilter(): Prisma.DealWhereInput {
  return {
    OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
  };
}

export async function getCategories() {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: {
        select: {
          deals: {
            where: {
              AND: [{ status: "APPROVED" }, notExpiredFilter()],
            },
          },
        },
      },
    },
  });
}

export async function getCategoryBySlug(slug: string) {
  // findFirst: isActive is not a unique field, so findUnique is incorrect
  return prisma.category.findFirst({
    where: { slug, isActive: true },
  });
}

export async function getApprovedDeals({
  search,
  categorySlug,
  featuredOnly = false,
  take,
  excludeId,
}: {
  search?: string;
  categorySlug?: string;
  featuredOnly?: boolean;
  take?: number;
  excludeId?: string;
} = {}) {
  // Keep status/expiry/search as AND groups so search OR does not wipe expiry OR
  const and: Prisma.DealWhereInput[] = [
    { status: "APPROVED" },
    notExpiredFilter(),
  ];

  if (featuredOnly) {
    and.push({ isFeatured: true });
  }

  if (excludeId) {
    and.push({ id: { not: excludeId } });
  }

  if (categorySlug) {
    and.push({ category: { slug: categorySlug } });
  }

  if (search && search.trim()) {
    // SQLite does not support mode: "insensitive"; LIKE is case-insensitive for ASCII
    const term = search.trim();
    and.push({
      OR: [
        { title: { contains: term } },
        { brandName: { contains: term } },
        { description: { contains: term } },
        { couponCode: { contains: term } },
      ],
    });
  }

  return prisma.deal.findMany({
    where: { AND: and },
    orderBy: [
      { isFeatured: "desc" },
      { approvedAt: "desc" },
      { createdAt: "desc" },
    ],
    take,
    select: publicDealSelect,
  });
}

export async function getFeaturedDeals(take = 6) {
  return getApprovedDeals({ featuredOnly: true, take });
}

export async function getLatestDeals(take = 6) {
  return prisma.deal.findMany({
    where: {
      AND: [{ status: "APPROVED" }, notExpiredFilter()],
    },
    orderBy: [{ approvedAt: "desc" }, { createdAt: "desc" }],
    take,
    select: publicDealSelect,
  });
}

export async function getDealBySlug(slug: string) {
  // findFirst: status is not unique; only show approved, non-expired deals publicly
  return prisma.deal.findFirst({
    where: {
      AND: [{ slug }, { status: "APPROVED" }, notExpiredFilter()],
    },
    select: publicDealSelect,
  });
}

export async function getDealById(id: string) {
  return prisma.deal.findUnique({
    where: { id },
    include: { category: true },
  });
}

export async function getAllDealsAdmin({
  status,
  search,
}: { status?: string; search?: string } = {}) {
  const where: Prisma.DealWhereInput = {};

  if (status) {
    where.status = status;
  }

  if (search && search.trim()) {
    const term = search.trim();
    where.OR = [
      { title: { contains: term } },
      { brandName: { contains: term } },
      { submittedByEmail: { contains: term } },
    ];
  }

  return prisma.deal.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    include: { category: true },
  });
}

export async function incrementClicks(id: string) {
  // Only count clicks for publicly claimable deals
  const deal = await prisma.deal.findFirst({
    where: {
      AND: [{ id }, { status: "APPROVED" }, notExpiredFilter()],
    },
    select: { id: true },
  });

  if (!deal) {
    return null;
  }

  return prisma.deal.update({
    where: { id },
    data: { clicks: { increment: 1 } },
  });
}

export async function createDeal(data: CreateDealInput) {
  return prisma.deal.create({
    data,
    include: { category: true },
  });
}

export async function updateDeal(id: string, data: Partial<CreateDealInput>) {
  return prisma.deal.update({
    where: { id },
    data,
    include: { category: true },
  });
}

export type CreateDealInput = {
  title: string;
  slug: string;
  description: string;
  shortDescription?: string;
  categoryId: string;
  brandName: string;
  brandUrl?: string;
  logoUrl?: string;
  dealUrl: string;
  couponCode?: string;
  discountType: string;
  discountValue?: string;
  originalPrice?: string;
  discountedPrice?: string;
  expiryDate?: Date | null;
  status?: string;
  isFeatured?: boolean;
  submittedByName?: string;
  submittedByEmail?: string;
  notes?: string;
  approvedAt?: Date | null;
};
