import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoSize = "sm" | "md" | "lg";

const sizeMap: Record<
  BrandLogoSize,
  { box: string; px: number; priority?: boolean }
> = {
  sm: { box: "h-8 w-8", px: 32 },
  md: { box: "h-9 w-9", px: 36 },
  lg: { box: "h-11 w-11", px: 44 },
};

interface BrandLogoProps {
  size?: BrandLogoSize;
  className?: string;
  /** Prefer true for above-the-fold header logo */
  priority?: boolean;
}

/**
 * Site brand mark — uses the icons from /public only.
 * - icon.png is the default logo mark
 */
export function BrandLogo({
  size = "md",
  className,
  priority = false,
}: BrandLogoProps) {
  const { box, px } = sizeMap[size];

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-lg bg-black shadow-sm ring-1 ring-black/10",
        box,
        className
      )}
    >
      <Image
        src="/icon.png"
        alt="Deals"
        width={px}
        height={px}
        priority={priority}
        className="h-full w-full object-cover"
      />
    </span>
  );
}
