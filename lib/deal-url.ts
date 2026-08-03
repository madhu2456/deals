const TRACKING_PARAMS = new Set(["gclid", "fbclid", "ref", "ref_code", "cs", "d"]);

export function normalizeDealUrl(raw: string): string | null {
  // Returns null for non-normalizable input (caller then skips dedupe).
  // Total function: never throws.
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = "";
  }
  // Tracking params (case-insensitive): utm_* prefix + the denylist.
  const kept: [string, string][] = [];
  for (const [k, v] of url.searchParams.entries()) {
    const lower = k.toLowerCase();
    if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) continue;
    kept.push([k, v]);
  }
  // Codepoint comparison — localeCompare depends on ICU locale data and could
  // silently change dedupe equivalence across server restarts/ICU upgrades.
  kept.sort((a, b) => {
    const ka = a[0].toLowerCase();
    const kb = b[0].toLowerCase();
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
  });
  const search = kept.length > 0 ? `?${new URLSearchParams(kept).toString()}` : "";
  const pathname = url.pathname.replace(/\/+$/, "");
  const hash = url.hash; // preserved: hash-based SPA routes are distinct resources
  // Scheme kept as-is: http vs https are NOT duplicates (conservative).
  return `${url.origin}${pathname}${search}${hash}`;
}
