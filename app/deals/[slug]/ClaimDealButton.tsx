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
  showAffiliateNote?: boolean;
}

const AFFILIATE_REL = "sponsored nofollow noopener";

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
  showAffiliateNote = true,
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
    void fetch(`/api/deals/${dealId}/click`, { method: "POST" }).catch(() => {});
  };

  return (
    <div className={cn("flex flex-col gap-1.5", showAffiliateNote && "w-full")}>
      <Button
        asChild
        size={size}
        variant={variant}
        className={cn("min-h-11 gap-2", className)}
        data-analytics="get_deal"
        data-deal-id={dealId}
        onClick={handleClick}
      >
        <a
          href={dealUrl}
          target="_blank"
          rel={AFFILIATE_REL}
          aria-label={
            brandName
              ? `Get deal on ${brandName} (opens in a new tab)`
              : "Get deal (opens in a new tab)"
          }
        >
          Get Deal
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </Button>
      {showAffiliateNote ? (
        <p className="text-center text-[11px] leading-snug text-muted-foreground">
          Affiliate link — we may earn a commission.{" "}
          <a
            href="/affiliate-disclosure"
            className="underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            Disclosure
          </a>
        </p>
      ) : null}
    </div>
  );
}
