import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

/**
 * Crawl policy for Google, Bing, and major AI answer engines (AEO / GEO).
 * Admin + API are blocked; public content is open to search & citation bots.
 */
export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      // Explicit for Google Search / Googlebot (sitemap + public pages)
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      // Explicit allow for major AI / answer-engine crawlers
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      {
        userAgent: "ChatGPT-User",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      {
        userAgent: "ClaudeBot",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      {
        userAgent: "anthropic-ai",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      {
        userAgent: "Google-Extended",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      {
        userAgent: "GoogleOther",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      {
        userAgent: "Applebot",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      // Optional: block pure training scrapers while allowing search/cite bots
      {
        userAgent: "CCBot",
        disallow: ["/"],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    // Hostname only (no scheme) — Yandex Host directive; Google ignores this line
    host: site.replace(/^https?:\/\//, ""),
  };
}
