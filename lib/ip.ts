/**
 * Client IP for rate limiting. Trust model (invariant — re-audit if you add
 * Cloudflare or a second proxy hop):
 * - nginx overwrites X-Real-IP with $remote_addr for ALL proxied traffic →
 *   trustworthy.
 * - nginx sets X-Forwarded-For via $proxy_add_x_forwarded_for, which APPENDS
 *   the real client IP last; earlier elements are attacker-controlled →
 *   read the LAST non-empty element.
 * - Cloudflare is now orange-clouded in front of nginx. nginx
 *   conf.d/00-cloudflare-real-ip.conf (mirrored from blog_platform) sets
 *   `set_real_ip_from <CF ranges>` + `real_ip_header CF-Connecting-IP`, so
 *   nginx rewrites $remote_addr from CF-Connecting-IP ONLY when the peer is a
 *   trusted Cloudflare edge. X-Real-IP is set from that rewritten $remote_addr,
 *   which is why it stays the correct, spoof-proof source. Do NOT read
 *   cf-connecting-ip directly in-app — a client can set that header, and
 *   trusting it would bypass the nginx peer validation and reopen a spoofing
 *   hole (every rate-limit bucket would be attacker-controlled).
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
