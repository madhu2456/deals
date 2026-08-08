"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { generateUniqueSlug } from "@/lib/slug";
import { createDeal, updateDeal } from "@/lib/data";
import { loginAdmin, logoutAdmin, requireAdmin } from "@/lib/admin-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/ip";
import { normalizeDealUrl } from "@/lib/deal-url";
import { absoluteUrl } from "@/lib/site";
import { isAllowedLogoUrl, isSvgLogo } from "@/app/components/LogoImage";
import type { CreateDealInput } from "@/lib/data";

const DISCOUNT_TYPES = new Set([
  "PERCENTAGE",
  "FIXED",
  "FREE_TIER",
  "LIFETIME",
  "OTHER",
]);

const DEAL_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED", "EXPIRED"]);

const GENERIC = "There was a problem with your submission. Please try again.";

/** Module-scope env parse — warns on invalid values, never throws at request time. */
const parsePositiveInt = (
  raw: string | undefined,
  fallback: number,
  name: string
): number => {
  const n = Number.parseInt(raw ?? "", 10);
  if (Number.isFinite(n) && n > 0) return n;
  if (raw !== undefined && raw !== "") {
    console.warn(`[rate-limit] invalid ${name} value "${raw}", using ${fallback}`);
  }
  return fallback;
};
const submitMaxAttempts = parsePositiveInt(
  process.env.SUBMIT_MAX_ATTEMPTS,
  5,
  "SUBMIT_MAX_ATTEMPTS"
);
const submitWindowMs = parsePositiveInt(
  process.env.SUBMIT_WINDOW_MS,
  60 * 60 * 1000,
  "SUBMIT_WINDOW_MS"
);

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Clip at a word boundary — avoids mid-word truncation in shortDescription. Appends … when truncated. */
function truncateAtWord(text: string, max = 120): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "\u2026";
}

/** Returns null for empty (clear field), Date when valid, or false when invalid. */
function parseOptionalDate(raw: string): Date | null | false {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return false;
  return date;
}

export async function submitDealAction(formData: FormData) {
  // Entry-count guard first (cheap, pre-parse): a real form has < 20 fields.
  const entries = formData.entries();
  let fieldCount = 0;
  while (!entries.next().done) fieldCount += 1;
  if (fieldCount > 20) {
    return { success: false as const, error: GENERIC };
  }

  const raw = Object.fromEntries(formData.entries());

  // Bot protection — honeypot filled or form submitted too fast
  if (String(raw.website || "").trim()) {
    return { success: false as const, error: GENERIC };
  }
  const timestamp = Number(String(raw.timestamp || "0"));
  // One-sided age check: rejects immediate (<3s), future (bots timestamp ahead),
  // and ludicrously-old (>24h) submissions. Unlike Math.abs, it never rejects
  // slow-clock users — a device >3s behind is a legitimate human, not a bot.
  const age = Date.now() - timestamp;
  if (!timestamp || age < 3000 || age > 24 * 3600 * 1000) {
    return { success: false as const, error: GENERIC };
  }

  const title = String(raw.title || "").trim();
  const brandName = String(raw.brandName || "").trim();
  const dealUrl = String(raw.dealUrl || "").trim();
  const categoryId = String(raw.categoryId || "").trim();
  const description = String(raw.description || "").trim();
  const submittedByName = String(raw.submittedByName || "").trim();
  const submittedByEmail = String(raw.submittedByEmail || "").trim();
  const discountType = String(raw.discountType || "OTHER").trim();
  const discountValue = String(raw.discountValue || "").trim();
  const couponCode = String(raw.couponCode || "").trim();

  const errors: Record<string, string> = {};

  if (!title || title.length < 3) errors.title = "Title is required (min 3 chars)";
  if (title.length > 150) errors.title = "Title must be 150 chars or less";
  if (!brandName) errors.brandName = "Brand name is required";
  if (brandName.length > 100) errors.brandName = "Brand name must be 100 chars or less";
  if (!dealUrl || !isValidHttpUrl(dealUrl)) errors.dealUrl = "A valid URL is required";
  if (dealUrl.length > 2048) errors.dealUrl = "Deal URL must be 2048 chars or less";
  if (!categoryId) errors.categoryId = "Category is required";
  if (!description || description.length < 20)
    errors.description = "Description is required (min 20 chars)";
  if (description.length > 5000)
    errors.description = "Description must be 5000 chars or less";
  if (!submittedByEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submittedByEmail))
    errors.submittedByEmail = "A valid email is required";
  if (submittedByEmail.length > 254) errors.submittedByEmail = "Email must be 254 chars or less";
  if (submittedByName.length > 100) errors.submittedByName = "Name must be 100 chars or less";
  if (!DISCOUNT_TYPES.has(discountType)) errors.discountType = "Invalid discount type";
  if (discountValue.length > 100) errors.discountValue = "Discount value must be 100 chars or less";
  if (couponCode.length > 100) errors.couponCode = "Coupon code must be 100 chars or less";

  if (Object.keys(errors).length > 0) {
    return { success: false as const, errors };
  }

  // Aggregate size guard — computed from string values only; Blob/File values
  // count as 0 (no file inputs exist on this form).
  const totalSize = Object.values(raw).reduce(
    (n, v) => n + (typeof v === "string" ? v.length : 0),
    0
  );
  if (totalSize > 64 * 1024) {
    return { success: false as const, error: GENERIC };
  }

  // Rate limit must precede ANY DB read (incl. the category findFirst below).
  // NODE_ENV guard: dev/test skips limiting — direct connections share the
  // "unknown" bucket and would self-lockout a dev.
  const ip = getClientIp(await headers());
  if (
    process.env.NODE_ENV === "production" &&
    (await checkRateLimit({
      key: `submit:${ip}`,
      limit: submitMaxAttempts,
      windowMs: submitWindowMs,
    }))
  ) {
    return {
      success: false as const,
      error: "Too many submissions from your IP. Please try again later.",
    };
  }

  // Best-effort dedupe (TOCTOU accepted: two concurrent identical submissions
  // may both pass — SQLite serializes writes, not the read-check). Never
  // reveals existence: generic success, no insert. Legacy/seed rows store RAW
  // urls with ref/utm params — exact match only catches identical strings; the
  // origin-prefix scan + in-memory normalization catches ref-variant duplicates
  // of existing rows. Ref-denylist is best-effort — other params can evade;
  // admin can edit the stored URL when the better affiliate link matters.
  // Stored dealUrl keeps the raw string — no schema/backfill.
  // REJECTED/EXPIRED rows are excluded from both queries: rejected deals are
  // legitimately resubmittable after fixes, and expired recurring offers must
  // be re-submitted for renewal. Only PENDING/APPROVED dedupe — prevents queue
  // spam and duplicates without making rejection/expiry permanent.
  const rawTrimmed = dealUrl.trim();
  const normalizedUrl = normalizeDealUrl(dealUrl);
  if (normalizedUrl) {
    const exact = await prisma.deal.findFirst({
      where: {
        dealUrl: { in: [rawTrimmed, normalizedUrl] },
        status: { notIn: ["REJECTED", "EXPIRED"] },
      },
      select: { id: true },
    });
    if (exact) return { success: true as const };
    const origin = new URL(normalizedUrl).origin;
    const candidates = await prisma.deal.findMany({
      where: {
        dealUrl: { startsWith: origin },
        status: { notIn: ["REJECTED", "EXPIRED"] },
      },
      select: { dealUrl: true },
    });
    if (candidates.some((c) => normalizeDealUrl(c.dealUrl) === normalizedUrl)) {
      return { success: true as const };
    }
  }

  const category = await prisma.category.findFirst({
    where: { id: categoryId, isActive: true },
    select: { id: true },
  });
  if (!category) {
    return {
      success: false as const,
      errors: { categoryId: "Selected category is not available" },
    };
  }

  const existingSlugs = await prisma.deal.findMany({ select: { slug: true } });
  const slug = generateUniqueSlug(
    title,
    existingSlugs.map((d) => d.slug)
  );

  try {
    await prisma.deal.create({
      data: {
        title,
        slug,
        brandName,
        dealUrl,
        categoryId,
        description,
        shortDescription: truncateAtWord(description),
        discountType,
        discountValue: discountValue || null,
        couponCode: couponCode || null,
        submittedByName: submittedByName || null,
        submittedByEmail,
        status: "PENDING",
      },
    });
  } catch {
    return {
      success: false as const,
      errors: { title: "Could not submit deal. Please try again." },
    };
  }

  revalidatePath("/deals");
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/sitemap.xml");

  return { success: true as const };
}

export async function loginAdminAction(formData: FormData) {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    return { success: false as const, error: "Username and password are required" };
  }

  // Rate limit: max 5 attempts per 15 minutes per IP. Failed AND successful
  // attempts both consume budget — security-correct order, documented.
  const ip = getClientIp(await headers());

  if (
    process.env.NODE_ENV === "production" &&
    (await checkRateLimit({ key: `login:${ip}`, limit: 5, windowMs: 15 * 60 * 1000 }))
  ) {
    return {
      success: false as const,
      error: "Too many login attempts. Please try again in 15 minutes.",
    };
  }

  const result = await loginAdmin(username, password);
  if (!result.success) {
    return { success: false as const, error: result.error };
  }

  redirect("/admin");
}

export async function logoutAdminAction() {
  await logoutAdmin();
  redirect("/admin/login");
}

export async function adminCreateDealAction(formData: FormData) {
  await requireAdmin();

  const data = await parseDealFormData(formData);
  if (!data.success) return data;

  const existingSlugs = await prisma.deal.findMany({ select: { slug: true } });
  const slug = generateUniqueSlug(
    data.deal.title,
    existingSlugs.map((d) => d.slug)
  );

  try {
    await createDeal({ ...data.deal, slug });
  } catch {
    return {
      success: false as const,
      errors: { title: "Could not create deal. Check inputs and try again." },
    };
  }

  revalidatePath("/admin");
  revalidatePath("/deals");
  revalidatePath("/");
  revalidatePath("/categories");
  revalidatePath("/sitemap.xml");

  redirect("/admin");
}

export async function adminUpdateDealAction(id: string, formData: FormData) {
  await requireAdmin();

  if (!id) return { success: false as const, error: "Deal not found" };

  const data = await parseDealFormData(formData);
  if (!data.success) return data;

  const deal = await prisma.deal.findUnique({
    where: { id },
    select: { slug: true, status: true, approvedAt: true },
  });
  if (!deal) return { success: false as const, error: "Deal not found" };

  // Preserve original approval timestamp; only set when newly approving
  let approvedAt = deal.approvedAt;
  if (data.deal.status === "APPROVED") {
    if (deal.status !== "APPROVED" || !deal.approvedAt) {
      approvedAt = new Date();
    }
  } else {
    approvedAt = null;
  }

  try {
    await updateDeal(id, {
      ...data.deal,
      slug: deal.slug,
      approvedAt,
    });
  } catch {
    return {
      success: false as const,
      errors: { title: "Could not update deal. Check inputs and try again." },
    };
  }

  revalidatePath("/admin");
  revalidatePath("/deals");
  revalidatePath("/");
  revalidatePath("/categories");
  revalidatePath(`/deals/${deal.slug}`);
  revalidatePath("/sitemap.xml");

  redirect("/admin");
}

export async function adminApproveDealAction(id: string) {
  await requireAdmin();
  if (!id) return { success: false as const, error: "Deal not found" };

  const existing = await prisma.deal.findUnique({
    where: { id },
    select: { id: true, status: true, approvedAt: true, slug: true },
  });
  if (!existing) return { success: false as const, error: "Deal not found" };

  await updateDeal(id, {
    status: "APPROVED",
    approvedAt: existing.approvedAt ?? new Date(),
  });

  revalidatePath("/admin");
  revalidatePath("/deals");
  revalidatePath("/");
  revalidatePath("/categories");
  if (existing.slug) revalidatePath(`/deals/${existing.slug}`);
  revalidatePath("/sitemap.xml");

  // Fire-and-forget IndexNow ping — never blocks or fails the approval.
  const indexNowKey = process.env.INDEXNOW_KEY;
  if (existing.slug && indexNowKey) {
    void fetch(
      `https://api.indexnow.org/indexnow?url=${encodeURIComponent(absoluteUrl(`/deals/${existing.slug}`))}&key=${indexNowKey}`,
      { method: "GET", headers: { Host: "api.indexnow.org" } }
    ).catch(() => {
      /* ping failure is non-fatal; the approval is already committed */
    });
  }

  return { success: true as const };
}

export async function adminRejectDealAction(id: string) {
  await requireAdmin();
  if (!id) return { success: false as const, error: "Deal not found" };

  const existing = await prisma.deal.findUnique({
    where: { id },
    select: { id: true, slug: true },
  });
  if (!existing) return { success: false as const, error: "Deal not found" };

  await updateDeal(id, { status: "REJECTED", approvedAt: null });
  revalidatePath("/admin");
  revalidatePath("/deals");
  revalidatePath("/");
  if (existing.slug) revalidatePath(`/deals/${existing.slug}`);
  revalidatePath("/sitemap.xml");

  return { success: true as const };
}

export async function adminDeleteDealAction(id: string) {
  await requireAdmin();
  if (!id) return { success: false as const, error: "Deal not found" };

  const existing = await prisma.deal.findUnique({
    where: { id },
    select: { id: true, slug: true },
  });
  if (!existing) return { success: false as const, error: "Deal not found" };

  await prisma.deal.delete({ where: { id } });
  revalidatePath("/admin");
  revalidatePath("/deals");
  revalidatePath("/");
  revalidatePath("/categories");
  if (existing.slug) revalidatePath(`/deals/${existing.slug}`);
  revalidatePath("/sitemap.xml");

  return { success: true as const };
}

async function parseDealFormData(
  formData: FormData
): Promise<
  | { success: true; deal: CreateDealInput }
  | { success: false; errors: Record<string, string> }
> {
  const raw = Object.fromEntries(formData.entries());

  const title = String(raw.title || "").trim();
  const brandName = String(raw.brandName || "").trim();
  const dealUrl = String(raw.dealUrl || "").trim();
  const categoryId = String(raw.categoryId || "").trim();
  const description = String(raw.description || "").trim();
  const status = String(raw.status || "PENDING").trim();
  const discountType = String(raw.discountType || "OTHER").trim();
  const brandUrl = String(raw.brandUrl || "").trim();
  const logoUrl = String(raw.logoUrl || "").trim();

  const errors: Record<string, string> = {};
  if (!title || title.length < 3) errors.title = "Title is required";
  if (!brandName) errors.brandName = "Brand name is required";
  if (!dealUrl || !isValidHttpUrl(dealUrl)) errors.dealUrl = "A valid URL is required";
  if (brandUrl && !isValidHttpUrl(brandUrl)) errors.brandUrl = "Brand URL must be valid";
  if (logoUrl && !isValidHttpUrl(logoUrl)) errors.logoUrl = "Logo URL must be valid";
  // Mirror of LogoImage's render-time check: the optimizer 400s on hosts
  // outside remotePatterns and on SVGs, so reject both at the source.
  if (logoUrl && (!isAllowedLogoUrl(logoUrl) || isSvgLogo(logoUrl)))
    errors.logoUrl =
      "logoUrl must be from an allowed image host (see next.config.ts remotePatterns) and not an SVG";
  if (!categoryId) errors.categoryId = "Category is required";
  if (!description || description.length < 20) errors.description = "Description is required";
  if (!DEAL_STATUSES.has(status)) errors.status = "Invalid status";
  if (!DISCOUNT_TYPES.has(discountType)) errors.discountType = "Invalid discount type";

  const expiryParsed = parseOptionalDate(String(raw.expiryDate || ""));
  if (expiryParsed === false) {
    errors.expiryDate = "Invalid expiry date";
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  const category = await prisma.category.findFirst({
    where: { id: categoryId, isActive: true },
    select: { id: true },
  });
  if (!category) {
    return {
      success: false,
      errors: { categoryId: "Selected category is not available" },
    };
  }

  const deal: CreateDealInput = {
    title,
    slug: "",
    description,
    shortDescription: truncateAtWord(description),
    categoryId,
    brandName,
    brandUrl: brandUrl || undefined,
    logoUrl: logoUrl || undefined,
    dealUrl,
    couponCode: String(raw.couponCode || "").trim() || undefined,
    discountType,
    discountValue: String(raw.discountValue || "").trim() || undefined,
    originalPrice: String(raw.originalPrice || "").trim() || undefined,
    discountedPrice: String(raw.discountedPrice || "").trim() || undefined,
    // null clears expiry on update; create stores null as "no expiry"
    expiryDate: expiryParsed === false ? null : expiryParsed,
    status,
    isFeatured: raw.isFeatured === "on" || raw.isFeatured === "true",
    notes: String(raw.notes || "").trim() || undefined,
  };

  return { success: true, deal };
}
