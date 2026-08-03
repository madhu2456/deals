/**
 * Client IP for rate limiting. Trust model (invariant — re-audit if you add
 * Cloudflare or a second proxy hop):
 * - nginx overwrites X-Real-IP with $remote_addr for ALL proxied traffic →
 *   trustworthy.
 * - nginx sets X-Forwarded-For via $proxy_add_x_forwarded_for, which APPENDS
 *   the real client IP last; earlier elements are attacker-controlled →
 *   read the LAST non-empty element.
 * - If Cloudflare is ever enabled in front of nginx, prefer cf-connecting-ip
 *   FIRST (then x-real-ip, then last xff).
 * Direct-to-app connections (dev, no proxy) fall into "unknown" — dev-only
 * traffic; the NODE_ENV guard at the call sites skips limiting outside prod.
 */
export function getClientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (xff.length > 0) return xff[xff.length - 1];
  return "unknown";
}
