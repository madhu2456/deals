/**
 * Bot & crawler detection (F-DEAL-017).
 *
 * Identifies automated user agents (search engine spiders, social preview
 * fetchers, SEO crawlers, AI scrapers, uptime monitors, CLI clients, and
 * headless automation). Used by stateful tracking endpoints (such as click
 * redirects) to filter out synthetic hits without consuming rate-limit tokens
 * or inflating deal engagement statistics.
 */

const BOT_PATTERNS: RegExp[] = [
  // Search engines & indexing spiders
  /googlebot/i,
  /bingbot/i,
  /yandex(bot)?/i,
  /baiduspider/i,
  /duckduckbot/i,
  /slurp/i,
  /sogou/i,
  /exabot/i,
  /applebot/i,
  /petalbot/i,
  /bytespider/i,
  /seznambot/i,

  // Social media preview bots
  /facebookexternalhit/i,
  /facebot/i,
  /twitterbot/i,
  /linkedinbot/i,
  /pinterest/i,
  /slackbot/i,
  /telegrambot/i,
  /whatsapp/i,
  /discordbot/i,
  /skypeuripreview/i,

  // SEO & Auditing tools
  /ahrefs(bot)?/i,
  /semrush(bot)?/i,
  /dotbot/i,
  /mj12bot/i,
  /screaming frog/i,
  /rogerbot/i,
  /moz(dot)?org/i,
  /lighthouse/i,
  /pagespeed/i,
  /gtmetrix/i,

  // AI & LLM crawlers
  /gptbot/i,
  /chatgpt-user/i,
  /claudebot/i,
  /anthropic-ai/i,
  /perplexitybot/i,
  /oai-searchbot/i,
  /ccbot/i,
  /cohere-ai/i,
  /amazonbot/i,
  /diffbot/i,
  /youbot/i,

  // Uptime monitors & web archives
  /uptimerobot/i,
  /pingdom/i,
  /site24x7/i,
  /statuscake/i,
  /ia_archiver/i,
  /archive\.org_bot/i,

  // HTTP clients & automation libraries
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /python-urllib/i,
  /aiohttp/i,
  /httpx/i,
  /node-fetch/i,
  /axios/i,
  /undici/i,
  /got\//i,
  /go-http-client/i,
  /postmanruntime/i,
  /insomnia/i,
  /headlesschrome/i,
  /phantomjs/i,
  /playwright/i,
  /puppeteer/i,
  /selenium/i,
  /webdriver/i,

  // Generic keyword matchers
  /\bbot\b/i,
  /[a-z0-9_-]+bot\b/i,
  /spider/i,
  /crawler/i,
  /scraper/i,
  /archiver/i,
];

/**
 * Returns `true` if the User-Agent header matches a known bot, crawler,
 * scraper, or automation framework.
 *
 * Returns `false` for missing/empty headers or standard human browsers.
 */
export function isBotUserAgent(userAgent?: string | null): boolean {
  if (!userAgent || typeof userAgent !== "string") {
    return false;
  }
  const ua = userAgent.trim();
  if (ua.length === 0) {
    return false;
  }
  return BOT_PATTERNS.some((pattern) => pattern.test(ua));
}
