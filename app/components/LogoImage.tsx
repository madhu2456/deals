import Image from "next/image";

/**
 * Merchant logo with an optimizer-safe fallback.
 *
 * The Next image optimizer 400s on (a) hosts outside next.config.ts
 * images.remotePatterns and (b) SVG images (dangerouslyAllowSVG is off — SVG
 * through the optimizer is an XSS surface). Both are deterministic at render
 * time, so instead of an onError/state dance we decide here: allowed non-SVG
 * URLs go through next/image (AVIF/WebP + srcset + sizes), everything else
 * renders as a plain <img>, which the CSP img-src https: policy permits.
 * Width/height are always set so neither path causes layout shift.
 */

// Mirror of the hostname patterns in next.config.ts images.remotePatterns.
// Keep in sync when that list changes.
const REMOTE_PATTERNS = [
  "*.cloudfront.net",
  "*.amazonaws.com",
  "*.googleusercontent.com",
  "*.githubusercontent.com",
  "images.ctfassets.net",
  "cdn.shopify.com",
  "res.cloudinary.com",
  "*.imgix.net",
  "cdn.sanity.io",
  "madhudadi.in",
  "deals.madhudadi.in",
] as const;

export function isAllowedLogoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // remotePatterns are https-only; an http:// (or protocol-less) URL on an
    // allowlisted host would reach the optimizer and 400. Reject it here so
    // it falls back to the raw <img> path (CSP img-src https: + upgrade).
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname;
    return REMOTE_PATTERNS.some((pattern) => {
      if (pattern.startsWith("**.")) {
        const domain = pattern.slice(3);
        return host === domain || host.endsWith(`.${domain}`);
      }
      if (pattern.startsWith("*.")) {
        // picomatch `*` matches dots too, so any-depth subdomains match
        return host.endsWith(pattern.slice(1));
      }
      return host === pattern;
    });
  } catch {
    return false;
  }
}

export function isSvgLogo(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith(".svg") || lower.endsWith(".svgz") || lower.includes(".svg?");
}

interface LogoImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
  loading?: "lazy" | "eager";
}

export function LogoImage({
  src,
  alt,
  width,
  height,
  className,
  priority = false,
  loading,
}: LogoImageProps) {
  if (!src) return null;
  if (!isAllowedLogoUrl(src) || isSvgLogo(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- intentional: optimizer 400s on SVG/out-of-pattern URLs
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        loading={loading ?? "lazy"}
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
      sizes={`${width}px`}
    />
  );
}
