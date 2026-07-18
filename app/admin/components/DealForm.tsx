"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Category {
  id: string;
  name: string;
}

interface Deal {
  id?: string;
  title: string;
  description: string;
  shortDescription?: string | null;
  categoryId: string;
  brandName: string;
  brandUrl?: string | null;
  logoUrl?: string | null;
  dealUrl: string;
  couponCode?: string | null;
  discountType: string;
  discountValue?: string | null;
  originalPrice?: string | null;
  discountedPrice?: string | null;
  expiryDate?: Date | null;
  status: string;
  isFeatured: boolean;
  notes?: string | null;
}

interface DealFormProps {
  deal?: Deal;
  categories: Category[];
  action: (formData: FormData) => Promise<unknown>;
  submitLabel?: string;
}

export function DealForm({ deal, categories, action, submitLabel = "Save Deal" }: DealFormProps) {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setErrors({});
    try {
      const result = (await action(formData)) as
        | { success: false; errors?: Record<string, string>; error?: string }
        | { success: true }
        | undefined;

      if (result && "success" in result && !result.success) {
        setErrors(result.errors || { form: result.error || "Something went wrong" });
      }
    } catch (err) {
      // Successful create/update redirects — let Next handle navigation
      if (
        typeof err === "object" &&
        err !== null &&
        "digest" in err &&
        String((err as { digest?: string }).digest || "").startsWith("NEXT_REDIRECT")
      ) {
        throw err;
      }
      setErrors({ form: "Something went wrong. Please try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={handleSubmit} className="mx-auto max-w-3xl space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input id="title" name="title" defaultValue={deal?.title} required />
          {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="brandName">Brand Name *</Label>
          <Input id="brandName" name="brandName" defaultValue={deal?.brandName} required />
          {errors.brandName && <p className="text-sm text-destructive">{errors.brandName}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          name="description"
          rows={5}
          defaultValue={deal?.description}
          required
        />
        {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="categoryId">Category *</Label>
          <Select name="categoryId" defaultValue={deal?.categoryId || undefined}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.categoryId && <p className="text-sm text-destructive">{errors.categoryId}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status *</Label>
          <Select name="status" defaultValue={deal?.status || "APPROVED"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dealUrl">Deal URL *</Label>
          <Input id="dealUrl" name="dealUrl" type="url" defaultValue={deal?.dealUrl} required />
          {errors.dealUrl && <p className="text-sm text-destructive">{errors.dealUrl}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="brandUrl">Brand URL</Label>
          <Input id="brandUrl" name="brandUrl" type="url" defaultValue={deal?.brandUrl || ""} />
          {errors.brandUrl && <p className="text-sm text-destructive">{errors.brandUrl}</p>}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="discountType">Discount Type</Label>
          <Select name="discountType" defaultValue={deal?.discountType || "OTHER"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PERCENTAGE">Percentage off</SelectItem>
              <SelectItem value="FIXED">Fixed amount off</SelectItem>
              <SelectItem value="FREE_TIER">Free tier / trial</SelectItem>
              <SelectItem value="LIFETIME">Lifetime deal</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="discountValue">Discount Value</Label>
          <Input
            id="discountValue"
            name="discountValue"
            placeholder="e.g. 20%"
            defaultValue={deal?.discountValue || ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="couponCode">Coupon Code</Label>
          <Input
            id="couponCode"
            name="couponCode"
            defaultValue={deal?.couponCode || ""}
          />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="originalPrice">Original Price</Label>
          <Input
            id="originalPrice"
            name="originalPrice"
            defaultValue={deal?.originalPrice || ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="discountedPrice">Discounted Price</Label>
          <Input
            id="discountedPrice"
            name="discountedPrice"
            defaultValue={deal?.discountedPrice || ""}
          />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="expiryDate">Expiry Date</Label>
          <Input
            id="expiryDate"
            name="expiryDate"
            type="datetime-local"
            defaultValue={
              deal?.expiryDate
                ? (() => {
                    const d = new Date(deal.expiryDate);
                    if (Number.isNaN(d.getTime())) return "";
                    // datetime-local expects local time, not UTC
                    const pad = (n: number) => String(n).padStart(2, "0");
                    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                  })()
                : ""
            }
          />
          {errors.expiryDate && <p className="text-sm text-destructive">{errors.expiryDate}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="logoUrl">Logo URL</Label>
          <Input id="logoUrl" name="logoUrl" type="url" defaultValue={deal?.logoUrl || ""} />
          {errors.logoUrl && <p className="text-sm text-destructive">{errors.logoUrl}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Admin Notes</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={deal?.notes || ""} />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="isFeatured" name="isFeatured" defaultChecked={deal?.isFeatured} />
        <Label htmlFor="isFeatured" className="font-normal">
          Feature this deal on the homepage
        </Label>
      </div>

      {errors.form && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{errors.form}</p>
      )}

      <div className="flex items-center gap-3 pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            submitLabel
          )}
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
