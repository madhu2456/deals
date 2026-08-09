import type { NextConfig } from "next";

const csp = [
  "default-src 'self'",
  "script-src 'self' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  // Merchant logos and deal images come from external CDNs — restrict to HTTPS.
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com",
  "frame-src 'self' https://www.googletagmanager.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

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
  { key: "Content-Security-Policy", value: csp },
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
      // Public marketing/listing pages — edge cache for 15 min, serve stale for 24h
      {
        source: "/",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=900, stale-while-revalidate=86400" },
          { key: "Vary", value: "Cookie" },
        ],
      },
      {
        source: "/deals",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=900, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/categories",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=900, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/categories/:slug*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=900, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/deals/:slug*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=900, stale-while-revalidate=86400" },
        ],
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
