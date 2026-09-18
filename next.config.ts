import type { NextConfig } from "next";

// NOTE: Content-Security-Policy is NOT set here. It carries a per-request
// script nonce (Next's inline bootstrap scripts must run for hydration), so it
// is emitted from proxy.ts via lib/csp.ts. Setting a static CSP here would
// duplicate/conflict with the nonce policy and re-break hydration.

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Embedder-Policy",
    value: "unsafe-none",
  },
];

const nextConfig: NextConfig = {
  // Standalone server output: self-contained .next/standalone bundle. The
  // Docker runner copies the full .next and the entrypoint still runs `next
  // start`, so this is additive — it keeps a standalone migration open and
  // makes the output self-verifiable.
  output: "standalone",
  // Site canonicals (`alternates: { canonical }` in lib/seo) and every
  // internal link are explicitly no-slash; pin the default so a future config
  // change cannot silently rewrite every URL.
  trailingSlash: false,
  images: {
    // Restrict remote image optimization to known CDN/logo patterns. The
    // optimizer 400s on hosts outside these patterns and on SVG images (no
    // dangerouslyAllowSVG), so app/components/LogoImage.tsx serves such logo
    // URLs as a plain <img> (its host/SVG allowlist mirrors remotePatterns
    // below). CSP img-src https: handles browser-side loading of arbitrary
    // merchant logos.
    remotePatterns: [
      { protocol: "https", hostname: "*.cloudfront.net" },
      { protocol: "https", hostname: "*.amazonaws.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "*.githubusercontent.com" },
      { protocol: "https", hostname: "images.ctfassets.net" },
      { protocol: "https", hostname: "cdn.shopify.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "*.imgix.net" },
      { protocol: "https", hostname: "cdn.sanity.io" },
      { protocol: "https", hostname: "madhudadi.in" },
      { protocol: "https", hostname: "deals.madhudadi.in" },
    ],
  },
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Help Googlebot / GSC fetch sitemaps reliably (and via Cloudflare cache)
      {
        source: "/sitemap.xml",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
          },
          {
            key: "Content-Type",
            value: "application/xml; charset=utf-8",
          },
        ],
      },
      {
        source: "/robots.txt",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=3600",
          },
        ],
      },
      {
        source: "/.well-known/security.txt",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/humans.txt",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/pricing.md",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      // HTML pages carry a PER-REQUEST CSP nonce (lib/csp.ts / proxy.ts), so they
      // must NOT be shared-cached: a cache that stores and replays a nonce'd
      // document hands the same nonce to many users, which lets an attacker read
      // the cached nonce and reuse it — defeating the XSS protection the nonce
      // exists to provide. (Cloudflare currently returns cf-cache-status DYNAMIC
      // for HTML, i.e. it does not cache these today; this makes that safe
      // outcome explicit and immune to a later "Cache Everything" rule.)
      //
      // These routes are force-dynamic with per-request DB reads regardless, so
      // they already render per request; the private/no-store directive matches
      // Next's own default for dynamic pages and only removes the (unsafe)
      // invitation to an intermediary cache.
      {
        source: "/",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" },
          { key: "Vary", value: "Cookie" },
        ],
      },
      {
        source: "/deals",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/categories",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/categories/:slug*",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/deals/:slug*",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/:key([a-zA-Z0-9-]{8,128})\\.txt",
        destination: "/api/indexnow?key=:key",
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/security.txt",
        destination: "/.well-known/security.txt",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
