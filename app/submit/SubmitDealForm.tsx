"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitDealAction } from "@/lib/actions";

interface Category {
  id: string;
  name: string;
}

export function SubmitDealForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const firstErrorRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      firstErrorRef.current?.focus();
    }
  }, [errors]);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setErrors({});

    try {
      const result = await submitDealAction(formData);

      if (result.success) {
        setSuccess(true);
        toast.success("Deal submitted for review");
        router.refresh();
      } else if ("errors" in result && result.errors) {
        setErrors(result.errors);
        toast.error("Please fix the highlighted fields");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-border bg-card p-8 text-center surface-elevated"
      >
        <CheckCircle2
          className="mx-auto h-12 w-12 text-emerald-600"
          aria-hidden="true"
        />
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Thanks for submitting!
        </h2>
        <p className="mt-2 text-pretty text-muted-foreground">
          We’ll review your deal and publish it if it meets our guidelines.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => setSuccess(false)}>Submit another deal</Button>
          <Button asChild variant="outline">
            <Link href="/deals">Browse deals</Link>
          </Button>
        </div>
      </div>
    );
  }

  const errorKeys = Object.keys(errors);
  const firstErrorKey = errorKeys[0];

  return (
    <form action={handleSubmit} className="space-y-6" noValidate>
      {errorKeys.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <p className="font-medium">Please fix the following:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {errorKeys.map((key) => (
              <li key={key}>{errors[key]}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Deal title *</Label>
          <Input
            id="title"
            name="title"
            placeholder="e.g. 50% off Pro Plan…"
            autoComplete="off"
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? "title-error" : undefined}
            className="h-11"
          />
          {errors.title && (
            <p
              id="title-error"
              ref={firstErrorKey === "title" ? firstErrorRef : undefined}
              tabIndex={-1}
              className="text-sm text-destructive outline-none"
            >
              {errors.title}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="brandName">Brand name *</Label>
          <Input
            id="brandName"
            name="brandName"
            placeholder="e.g. Notion…"
            autoComplete="organization"
            aria-invalid={!!errors.brandName}
            aria-describedby={errors.brandName ? "brandName-error" : undefined}
            className="h-11"
          />
          {errors.brandName && (
            <p
              id="brandName-error"
              ref={firstErrorKey === "brandName" ? firstErrorRef : undefined}
              tabIndex={-1}
              className="text-sm text-destructive outline-none"
            >
              {errors.brandName}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dealUrl">Deal URL *</Label>
          <Input
            id="dealUrl"
            name="dealUrl"
            type="url"
            inputMode="url"
            placeholder="https://…"
            autoComplete="url"
            spellCheck={false}
            aria-invalid={!!errors.dealUrl}
            aria-describedby={errors.dealUrl ? "dealUrl-error" : undefined}
            className="h-11"
          />
          {errors.dealUrl && (
            <p
              id="dealUrl-error"
              ref={firstErrorKey === "dealUrl" ? firstErrorRef : undefined}
              tabIndex={-1}
              className="text-sm text-destructive outline-none"
            >
              {errors.dealUrl}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="categoryId">Category *</Label>
          <Select name="categoryId">
            <SelectTrigger
              id="categoryId"
              className="h-11 w-full min-w-0"
              aria-invalid={!!errors.categoryId}
              aria-describedby={errors.categoryId ? "categoryId-error" : undefined}
            >
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.categoryId && (
            <p
              id="categoryId-error"
              ref={firstErrorKey === "categoryId" ? firstErrorRef : undefined}
              tabIndex={-1}
              className="text-sm text-destructive outline-none"
            >
              {errors.categoryId}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="discountType">Discount type</Label>
          <Select name="discountType" defaultValue="OTHER">
            <SelectTrigger id="discountType" className="h-11 w-full min-w-0">
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
          <Label htmlFor="discountValue">Discount value</Label>
          <Input
            id="discountValue"
            name="discountValue"
            placeholder="e.g. 20% or $15…"
            autoComplete="off"
            className="h-11"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="couponCode">Coupon code</Label>
        <Input
          id="couponCode"
          name="couponCode"
          placeholder="e.g. SAVE20…"
          autoComplete="off"
          spellCheck={false}
          className="h-11 font-mono"
          translate="no"
        />
        <p className="text-xs text-muted-foreground">Optional — leave blank if no code is needed.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          placeholder="What is the deal? Who is eligible? Any steps to claim…"
          aria-invalid={!!errors.description}
          aria-describedby={
            errors.description ? "description-error description-help" : "description-help"
          }
          className="min-h-28 text-base md:text-sm"
        />
        <p id="description-help" className="text-xs text-muted-foreground">
          At least 20 characters. Be specific so others can claim it easily.
        </p>
        {errors.description && (
          <p
            id="description-error"
            ref={firstErrorKey === "description" ? firstErrorRef : undefined}
            tabIndex={-1}
            className="text-sm text-destructive outline-none"
          >
            {errors.description}
          </p>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="submittedByName">Your name</Label>
          <Input
            id="submittedByName"
            name="submittedByName"
            placeholder="Jane Doe…"
            autoComplete="name"
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="submittedByEmail">Your email *</Label>
          <Input
            id="submittedByEmail"
            name="submittedByEmail"
            type="email"
            inputMode="email"
            placeholder="you@example.com…"
            autoComplete="email"
            spellCheck={false}
            aria-invalid={!!errors.submittedByEmail}
            aria-describedby={
              errors.submittedByEmail ? "submittedByEmail-error" : undefined
            }
            className="h-11"
          />
          {errors.submittedByEmail && (
            <p
              id="submittedByEmail-error"
              ref={firstErrorKey === "submittedByEmail" ? firstErrorRef : undefined}
              tabIndex={-1}
              className="text-sm text-destructive outline-none"
            >
              {errors.submittedByEmail}
            </p>
          )}
        </div>
      </div>

      <Button type="submit" size="lg" className="min-h-12 w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Submitting…
          </>
        ) : (
          "Submit Deal"
        )}
      </Button>
    </form>
  );
}
