"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackCopyCoupon } from "@/lib/analytics";

export function CopyCodeButton({
  code,
  className,
  variant = "secondary",
  dealId,
  dealSlug,
  dealTitle,
  brandName,
}: {
  code: string;
  className?: string;
  variant?: "secondary" | "outline" | "default" | "ghost";
  dealId?: string;
  dealSlug?: string;
  dealTitle?: string;
  brandName?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      size="icon"
      variant={variant}
      className={cn("h-10 w-10 shrink-0", className)}
      data-analytics="copy_coupon"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          trackCopyCoupon({
            couponCode: code,
            dealId,
            dealSlug,
            dealTitle,
            brandName,
          });
          setCopied(true);
          toast.success("Coupon code copied");
          setTimeout(() => setCopied(false), 1600);
        } catch {
          toast.error("Couldn’t copy code — select and copy manually");
        }
      }}
      aria-label={copied ? "Coupon code copied" : `Copy coupon code ${code}`}
    >
      {copied ? (
        <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}
