"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Copy, Check, Calendar, Sparkles, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { discountLabel, formatRelativeDate } from "@/lib/format";
import type { PublicDeal } from "@/lib/data";

interface DealCardProps {
  deal: PublicDeal;
}

export function DealCard({ deal }: DealCardProps) {
  const [copied, setCopied] = useState(false);

  const copyCode = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!deal.couponCode) return;
    try {
      await navigator.clipboard.writeText(deal.couponCode);
      setCopied(true);
      toast.success("Coupon code copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn’t copy code — select and copy manually");
    }
  };

  const discount = discountLabel(deal.discountType, deal.discountValue);
  const href = `/deals/${deal.slug}`;
  const expiryLabel = deal.expiryDate ? formatRelativeDate(deal.expiryDate) : null;
  const isExpiringSoon =
    expiryLabel === "Ends today" ||
    expiryLabel === "Ends tomorrow" ||
    (typeof expiryLabel === "string" && expiryLabel.startsWith("Ends in"));
  const categoryColor = deal.category.color || "#6366F1";
  const initials = deal.brandName.slice(0, 2).toUpperCase();

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-card",
        "shadow-[0_1px_2px_rgb(15_23_42/0.04),0_8px_24px_rgb(15_23_42/0.04)]",
        "transition-[border-color,box-shadow,transform] duration-200",
        "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_8px_28px_rgb(99_102_241/0.12)]",
        "focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/25"
      )}
    >
      {/* Full-card navigation layer */}
      <Link
        href={href}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none"
        aria-label={`View deal: ${deal.title}`}
      />

      {/* Top accent + badges */}
      <div className="relative z-[1] pointer-events-none">
        <div
          className="h-1.5 w-full"
          style={{
            background: `linear-gradient(90deg, ${categoryColor}, color-mix(in oklab, ${categoryColor} 45%, #6366f1))`,
          }}
          aria-hidden="true"
        />

        <div className="flex items-start justify-between gap-3 px-4 pb-0 pt-4">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {deal.isFeatured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Featured
              </span>
            )}
            <span
              className="max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium text-white/95"
              style={{ backgroundColor: categoryColor }}
            >
              {deal.category.name}
            </span>
          </div>

          {/* Discount — visual hero of the card */}
          <div
            className={cn(
              "shrink-0 rounded-xl px-2.5 py-1.5 text-right",
              "bg-primary/10 ring-1 ring-primary/15",
              "transition-colors duration-200 group-hover:bg-primary/15"
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/70">
              Save
            </p>
            <p className="max-w-[7.5rem] break-words text-base font-bold leading-tight text-primary tabular-nums">
              {discount}
            </p>
          </div>
        </div>
      </div>

      {/* Brand + content */}
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col gap-3 px-4 pb-4 pt-3 pointer-events-none">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl",
              "bg-muted text-sm font-bold tracking-wide text-foreground",
              "ring-1 ring-border/70 shadow-sm",
              "transition-transform duration-200 group-hover:scale-[1.03]"
            )}
            aria-hidden="true"
          >
            {deal.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={deal.logoUrl}
                alt=""
                width={48}
                height={48}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <span
                className="flex h-full w-full items-center justify-center text-white"
                style={{
                  background: `linear-gradient(145deg, ${categoryColor}, color-mix(in oklab, ${categoryColor} 55%, #1e1b4b))`,
                }}
              >
                {initials}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {deal.brandName}
            </p>
            {expiryLabel && (
              <p
                className={cn(
                  "mt-0.5 inline-flex items-center gap-1 text-xs",
                  isExpiringSoon
                    ? "font-medium text-amber-700 dark:text-amber-400"
                    : "text-muted-foreground"
                )}
              >
                <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{expiryLabel}</span>
              </p>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="line-clamp-2 break-words text-[0.95rem] font-semibold leading-snug tracking-tight text-foreground transition-colors duration-200 group-hover:text-primary">
            {deal.title}
          </h3>
          <p className="mt-1.5 line-clamp-2 break-words text-sm leading-relaxed text-muted-foreground">
            {deal.shortDescription || deal.description}
          </p>
        </div>

        {(deal.originalPrice || deal.discountedPrice) && (
          <div className="flex flex-wrap items-baseline gap-2 text-sm">
            {deal.discountedPrice && (
              <span className="font-bold tabular-nums text-foreground">
                {deal.discountedPrice}
              </span>
            )}
            {deal.originalPrice && (
              <span className="text-muted-foreground line-through tabular-nums">
                {deal.originalPrice}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="relative z-[1] mt-auto flex items-center gap-2 border-t border-border/80 bg-muted/35 px-3 py-2.5 pointer-events-none">
        {deal.couponCode ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "pointer-events-auto min-h-10 flex-1 gap-1.5 border-dashed bg-card",
              "hover:border-primary/40 hover:bg-primary/5"
            )}
            onClick={copyCode}
            aria-label={
              copied ? "Coupon code copied" : `Copy coupon code ${deal.couponCode}`
            }
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <Ticket className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            )}
            <span className="truncate font-mono text-xs font-medium tracking-wide" translate="no">
              {deal.couponCode}
            </span>
            {!copied && (
              <Copy className="ml-auto h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
            )}
          </Button>
        ) : (
          <div className="flex min-h-10 flex-1 items-center px-1 text-xs text-muted-foreground">
            No code needed
          </div>
        )}

        <Button
          asChild
          size="sm"
          className="pointer-events-auto min-h-10 shrink-0 gap-1.5 px-3.5 shadow-sm"
        >
          <Link href={href}>
            View
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </Button>
      </div>
    </article>
  );
}
