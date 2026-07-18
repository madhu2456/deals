"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackGetDeal } from "@/lib/analytics";

interface ClaimDealButtonProps {
  dealId: string;
  dealUrl: string;
  brandName?: string;
  dealSlug?: string;
  dealTitle?: string;
  couponCode?: string | null;
  className?: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "secondary" | "outline";
}

export function ClaimDealButton({
  dealId,
  dealUrl,
  brandName,
  dealSlug,
  dealTitle,
  couponCode,
  className,
  size = "lg",
  variant = "secondary",
}: ClaimDealButtonProps) {
  const handleClick = () => {
    trackGetDeal({
      dealId,
      dealUrl,
      brandName,
      dealSlug,
      dealTitle,
      couponCode,
    });

    // Open immediately to avoid popup blockers
    const tab = window.open(dealUrl, "_blank", "noopener,noreferrer");
    if (!tab) {
      window.location.assign(dealUrl);
      return;
    }
    void fetch(`/api/deals/${dealId}/click`, { method: "POST" }).catch(() => {});
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn("min-h-11 gap-2", className)}
      data-analytics="get_deal"
      data-deal-id={dealId}
      onClick={handleClick}
      aria-label={
        brandName
          ? `Get deal on ${brandName} (opens in a new tab)`
          : "Get deal (opens in a new tab)"
      }
    >
      Get Deal
      <ExternalLink className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}
