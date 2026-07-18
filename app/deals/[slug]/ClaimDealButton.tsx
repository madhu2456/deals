"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ClaimDealButtonProps {
  dealId: string;
  dealUrl: string;
  brandName?: string;
  className?: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "secondary" | "outline";
}

export function ClaimDealButton({
  dealId,
  dealUrl,
  brandName,
  className,
  size = "lg",
  variant = "secondary",
}: ClaimDealButtonProps) {
  const handleClick = () => {
    // Open immediately to avoid popup blockers
    const tab = window.open(dealUrl, "_blank", "noopener,noreferrer");
    if (!tab) {
      // Fallback when popups are blocked
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
