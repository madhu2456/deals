import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

/**
 * Crawl policy for Google, Bing, and major AI answer engines (AEO / GEO).
 * Admin + API are blocked; public content is open to search & citation bots.
 * Training-only crawlers (GPTBot, ClaudeBot, anthropic-ai, CCBot) are blocked.
 * Claude-SearchBot / Claude-User / Claude-Web are allowed (citation); ClaudeBot training stays blocked.
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
      // Google Search
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      // AI citation / search crawlers (NOT training)
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      {
        userAgent: "ChatGPT-User",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      {
        userAgent: "Perplexity-User",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      {
        userAgent: "Claude-SearchBot",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      {
        userAgent: "Claude-User",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/api"],
      },
      {
        userAgent: "Claude-Web",
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
      // Training-only crawlers — blocked
      {
        userAgent: "GPTBot",
        disallow: ["/"],
      },
      {
        userAgent: "ClaudeBot",
        disallow: ["/"],
      },
      {
        userAgent: "anthropic-ai",
        disallow: ["/"],
      },
      {
        userAgent: "CCBot",
        disallow: ["/"],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site.replace(/^https?:\/\//, ""),
  };
}
