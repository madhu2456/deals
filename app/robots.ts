import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

/**
 * Crawl policy for Google, Bing, and major AI answer engines (AEO / GEO).
 * Admin + API are blocked; public content is open to search & citation bots.
 * Training-only crawlers (GPTBot, ClaudeBot, anthropic-ai, CCBot,
 * Applebot-Extended, Bytespider) are blocked.
 * Claude-SearchBot / Claude-User / Claude-Web are allowed (citation); ClaudeBot training stays blocked.
 *
 * Decision D5 (recorded, owner): blocking training crawlers is INTENTIONAL and
 * consistent across all madhudadi.in hosts — do NOT flip this to match
 * adticks.com, whose named-Allow of GPTBot/ClaudeBot/Applebot-Extended is its
 * own product choice for AEO tooling. Note: allowing a crawler never
 * guarantees citation (Allow ≠ cited) — the AI-profile/llms.txt content is
 * what earns citations.
 */
const CRAWLER_DISALLOW = ["/admin", "/admin/", "/api/", "/api", "/ws/"];

export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: CRAWLER_DISALLOW,
      },
      // Google Search
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: CRAWLER_DISALLOW,
      },
      // AI citation / search crawlers (NOT training)
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
        disallow: CRAWLER_DISALLOW,
      },
      {
        userAgent: "ChatGPT-User",
        allow: "/",
        disallow: CRAWLER_DISALLOW,
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: CRAWLER_DISALLOW,
      },
      {
        userAgent: "Perplexity-User",
        allow: "/",
        disallow: CRAWLER_DISALLOW,
      },
      {
        userAgent: "Claude-SearchBot",
        allow: "/",
        disallow: CRAWLER_DISALLOW,
      },
      {
        userAgent: "Claude-User",
        allow: "/",
        disallow: CRAWLER_DISALLOW,
      },
      {
        userAgent: "Claude-Web",
        allow: "/",
        disallow: CRAWLER_DISALLOW,
      },
      {
        userAgent: "Google-Extended",
        allow: "/",
        disallow: CRAWLER_DISALLOW,
      },
      {
        userAgent: "GoogleOther",
        allow: "/",
        disallow: CRAWLER_DISALLOW,
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: CRAWLER_DISALLOW,
      },
      {
        userAgent: "Applebot",
        allow: "/",
        disallow: CRAWLER_DISALLOW,
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
      // Applebot-Extended (Apple's training crawler) and Bytespider
      // (ByteDance training crawler) are distinct from their search crawlers
      // (Applebot above; Bytespider has no search role here). Same
      // training-block policy as portfolio/blog/enroller (F-XSITE-010).
      {
        userAgent: "Applebot-Extended",
        disallow: ["/"],
      },
      {
        userAgent: "Bytespider",
        disallow: ["/"],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
