import { getSiteUrl } from "@/lib/site";

/**
 * Shared CSRF origin allowlist for POST endpoints that mutate state
 * (deal click counts, broken-deal reports). The site runs at
 * deals.madhudadi.in; localhost ports cover local dev.
 */
const ALLOWED_ORIGINS = new Set<string>([
  getSiteUrl(),
  "https://deals.madhudadi.in",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3002",
]);

/**
 * CSRF guard for mutating POST routes: browser POSTs must come from the site
 * itself (or localhost/dev). A missing Origin — curl, uptime monitors,
 * server-to-server — is allowed: such clients cannot be tricked into
 * cross-site state changes. Disallowed origins → routes return 403.
 */
export function isOriginAllowed(origin: string | null): boolean {
  return origin === null || ALLOWED_ORIGINS.has(origin);
}
