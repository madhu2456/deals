"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { generateUniqueSlug } from "@/lib/slug";
import { createDeal, updateDeal } from "@/lib/data";
import { loginAdmin, logoutAdmin, requireAdmin } from "@/lib/admin-auth";
import type { CreateDealInput } from "@/lib/data";

const DISCOUNT_TYPES = new Set([
  "PERCENTAGE",
  "FIXED",
  "FREE_TIER",
  "LIFETIME",
  "OTHER",
]);

const DEAL_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED", "EXPIRED"]);

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
  const raw = Object.fromEntries(formData.entries());

  const title = String(raw.title || "").trim();
  const brandName = String(raw.brandName || "").trim();
  const dealUrl = String(raw.dealUrl || "").trim();
  const categoryId = String(raw.categoryId || "").trim();
  const description = String(raw.description || "").trim();
  const submittedByName = String(raw.submittedByName || "").trim();
  const submittedByEmail = String(raw.submittedByEmail || "").trim();
  const discountType = String(raw.discountType || "OTHER").trim();

  const errors: Record<string, string> = {};

  if (!title || title.length < 3) errors.title = "Title is required (min 3 chars)";
  if (!brandName) errors.brandName = "Brand name is required";
  if (!dealUrl || !isValidHttpUrl(dealUrl)) errors.dealUrl = "A valid URL is required";
  if (!categoryId) errors.categoryId = "Category is required";
  if (!description || description.length < 20)
    errors.description = "Description is required (min 20 chars)";
  if (!submittedByEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submittedByEmail))
    errors.submittedByEmail = "A valid email is required";
  if (!DISCOUNT_TYPES.has(discountType)) errors.discountType = "Invalid discount type";

  if (Object.keys(errors).length > 0) {
    return { success: false as const, errors };
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
        shortDescription: description.slice(0, 120),
        discountType,
        discountValue: String(raw.discountValue || "").trim() || null,
        couponCode: String(raw.couponCode || "").trim() || null,
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

  return { success: true as const };
}

export async function loginAdminAction(formData: FormData) {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    return { success: false as const, error: "Username and password are required" };
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

  return { success: true as const };
}

async function parseDealFormData(formData: FormData):
  | Promise<{ success: true; deal: CreateDealInput }>
  | Promise<{ success: false; errors: Record<string, string> }> {
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
    shortDescription: description.slice(0, 120),
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
