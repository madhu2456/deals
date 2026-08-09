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

/** Categories below this deal count are noindex and omitted from sitemap (thin hub protection). */
export const MIN_CATEGORY_DEALS_FOR_INDEX = 3;

/**
 * Scale gate for the /deals listing: at or below this many approved,
 * non-expired deals the page renders everything in one pass (no pagination
 * UI, identical output to before); above it, results are paged PAGE_SIZE at
 * a time using an (isFeatured, createdAt, id) DESC keyset cursor.
 */
export const PAGINATION_THRESHOLD = 48;

/**
 * Deals per page once pagination is active. 24 is a multiple of the DealGrid
 * column counts (2/3/4), so every breakpoint fills complete rows, and keeps
 * page weight reasonable once a site outgrows the threshold.
 */
export const PAGE_SIZE = 24;

/** Deals that are still valid for public display (not past expiry). */
function notExpiredFilter(): Prisma.DealWhereInput {
  return {
    OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
  };
}

/** Total approved, non-expired deals in a category (unfiltered by search). */
export async function countApprovedDealsInCategory(
  categorySlug: string
): Promise<number> {
  return prisma.deal.count({
    where: {
      AND: [
        { status: "APPROVED" },
        { category: { slug: categorySlug } },
        notExpiredFilter(),
      ],
    },
  });
}

/** Total approved, non-expired deals sitewide (pagination scale gate). */
export async function countApprovedDeals(): Promise<number> {
  return prisma.deal.count({
    where: { status: "APPROVED", ...notExpiredFilter() },
  });
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

/**
 * Keyset cursor for /deals pagination: base64url of
 * `${isFeatured ? 1 : 0}|${createdAtISO}|${id}`. Ordering is
 * (isFeatured DESC, createdAt DESC, id DESC): the leading featured column
 * pins featured deals to the top of every page exactly like the
 * below-threshold path, and the id tiebreak keeps pages stable under
 * concurrent inserts. Cursors minted before the featured flag was embedded
 * (2-part `${createdAtISO}|${id}`) still decode; their flag is resolved with
 * a single row lookup.
 *
 * Exported for scripts/verify-pagination.ts (permanent no-DB keyset walk).
 */
export function encodeDealsCursor(deal: {
  isFeatured: boolean;
  createdAt: Date;
  id: string;
}): string {
  return Buffer.from(
    `${deal.isFeatured ? 1 : 0}|${deal.createdAt.toISOString()}|${deal.id}`
  ).toString("base64url");
}

/**
 * Decoded pagination cursor. `isFeatured: null` marks a legacy 2-part cursor
 * whose featured flag must be resolved by row lookup before the keyset bound
 * can be built; malformed input falls back to page 1 (null).
 */
export type DealsCursor = {
  isFeatured: boolean | null;
  createdAt: Date;
  id: string;
};

/** Decodes a pagination cursor; malformed input falls back to page 1 (null). */
export function decodeDealsCursor(cursor: string | undefined): DealsCursor | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parts = raw.split("|");
    if (parts.length === 3) {
      if (parts[0] !== "0" && parts[0] !== "1") return null;
      const createdAt = new Date(parts[1]);
      const id = parts[2];
      if (Number.isNaN(createdAt.getTime()) || id.length === 0) return null;
      return { isFeatured: parts[0] === "1", createdAt, id };
    }
    if (parts.length === 2) {
      const createdAt = new Date(parts[0]);
      const id = parts[1];
      if (Number.isNaN(createdAt.getTime()) || id.length === 0) return null;
      return { isFeatured: null, createdAt, id };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Keyset bound for (isFeatured DESC, createdAt DESC, id DESC): the rows that
 * sort strictly AFTER the cursor row. A featured cursor admits the featured
 * rows past it (createdAt/id tiebreak) plus every non-featured row, since
 * non-featured rows sort after all featured rows; a non-featured cursor only
 * admits non-featured rows past it. Legacy 2-part cursors resolve their
 * featured flag via one row lookup; if that row is gone the bound is
 * unresolvable and the caller restarts from page 1 (null).
 *
 * Exported for scripts/verify-pagination.ts (permanent no-DB keyset walk).
 */
export async function dealsAfterCursorBound(
  decoded: DealsCursor
): Promise<Prisma.DealWhereInput | null> {
  let { isFeatured } = decoded;
  if (isFeatured === null) {
    const row = await prisma.deal.findUnique({
      where: { id: decoded.id },
      select: { isFeatured: true },
    });
    if (!row) return null;
    isFeatured = row.isFeatured;
  }
  if (isFeatured) {
    return {
      OR: [
        { isFeatured: false },
        { isFeatured: true, createdAt: { lt: decoded.createdAt } },
        {
          isFeatured: true,
          createdAt: decoded.createdAt,
          id: { lt: decoded.id },
        },
      ],
    };
  }
  return {
    OR: [
      { isFeatured: false, createdAt: { lt: decoded.createdAt } },
      {
        isFeatured: false,
        createdAt: decoded.createdAt,
        id: { lt: decoded.id },
      },
    ],
  };
}

/**
 * Scale-gated paginated listing for /deals. Filter semantics mirror
 * getApprovedDeals exactly (same AND groups, same search OR across title,
 * brandName, description, couponCode, same category/featured handling);
 * ordering is (isFeatured DESC, createdAt DESC, id DESC), so featured deals
 * stay pinned ahead of non-featured on every page just like the
 * below-threshold path.
 */
export async function getApprovedDealsPaginated({
  cursor,
  search,
  categorySlug,
  featuredOnly = false,
}: {
  cursor?: string;
  search?: string;
  categorySlug?: string;
  featuredOnly?: boolean;
}) {
  // Keep status/expiry/search as AND groups so search OR does not wipe expiry OR
  const and: Prisma.DealWhereInput[] = [
    { status: "APPROVED" },
    notExpiredFilter(),
  ];

  if (featuredOnly) {
    and.push({ isFeatured: true });
  }

  if (categorySlug) {
    and.push({ category: { slug: categorySlug } });
  }

  if (search && search.trim()) {
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

  // Composite keyset: rows strictly after the cursor in
  // (isFeatured, createdAt, id) DESC. The OR shape depends on whether the
  // cursor row is featured — Prisma cannot `lt` a Boolean, so the featured
  // branch admits all non-featured rows (they sort after every featured row)
  // plus the featured rows past the cursor; the non-featured branch admits
  // only non-featured rows past the cursor.
  const decoded = decodeDealsCursor(cursor);
  if (decoded) {
    const bound = await dealsAfterCursorBound(decoded);
    if (bound) {
      and.push(bound);
    }
    // Unresolvable bound (legacy cursor whose row was deleted): render page 1.
    // hasCursor stays true so the "Back to first page" link clears the stale
    // cursor from the URL.
  }

  // PAGE_SIZE + 1 lets us detect a next page without a second query
  const rows = await prisma.deal.findMany({
    where: { AND: and },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    select: publicDealSelect,
  });

  const hasNext = rows.length > PAGE_SIZE;
  const deals = hasNext ? rows.slice(0, PAGE_SIZE) : rows;

  return {
    deals,
    hasNext,
    nextCursor: hasNext ? encodeDealsCursor(deals[deals.length - 1]) : null,
    /** True only when the cursor was well-formed; drives the Previous link. */
    hasCursor: decoded !== null,
  };
}

export async function getFeaturedDeals(take = 6) {
  return getApprovedDeals({ featuredOnly: true, take });
}

export async function getLatestDeals(take = 6, excludeIds: string[] = []) {
  return prisma.deal.findMany({
    where: {
      AND: [
        { status: "APPROVED" },
        notExpiredFilter(),
        ...(excludeIds.length > 0 ? [{ id: { notIn: excludeIds } }] : []),
      ],
    },
    orderBy: [{ approvedAt: "desc" }, { createdAt: "desc" }],
    take,
    select: publicDealSelect,
  });
}

/** Distinct brand names from approved, non-expired deals (for hero chips). */
export async function getPopularBrandNames(take = 5): Promise<string[]> {
  const deals = await prisma.deal.findMany({
    where: {
      AND: [{ status: "APPROVED" }, notExpiredFilter()],
    },
    select: { brandName: true, isFeatured: true, clicks: true, approvedAt: true },
    orderBy: [
      { isFeatured: "desc" },
      { clicks: "desc" },
      { approvedAt: "desc" },
    ],
  });

  const seen = new Set<string>();
  const brands: string[] = [];
  for (const d of deals) {
    const name = (d.brandName || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    brands.push(name);
    if (brands.length >= take) break;
  }
  return brands;
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

/**
 * Returns a deal ONLY if it was previously APPROVED and has since expired
 * (non-null expiryDate in the past). Never returns PENDING/REJECTED/EXPIRED-status
 * rows or perpetual deals (null expiryDate) — those must keep 404.
 */
export async function getExpiredApprovedDealBySlug(slug: string) {
  return prisma.deal.findFirst({
    where: {
      slug,
      status: "APPROVED",
      expiryDate: { not: null, lt: new Date() },
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
