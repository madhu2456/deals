const limiters = new Map<string, { count: number; resetAt: number }>();

/** Drop expired entries once the map grows past a threshold — keeps memory bounded. */
function sweepExpired(now: number): void {
  if (limiters.size <= 1000) return;
  for (const [k, e] of limiters) if (now >= e.resetAt) limiters.delete(k);
}

/**
 * Simple in-memory rate limiter. For production multi-instance deploys,
 * replace with Upstash Redis-backed rate limiter.
 *
 * @param key - Unique identifier (e.g. `login:${ip}` or `click:${ip}`)
 * @param maxAttempts - Maximum allowed attempts within the window
 * @param windowMs - Time window in milliseconds
 * @returns `true` if the request should be blocked (rate limited), `false` if allowed
 */
export function isRateLimited(
  key: string,
  maxAttempts: number,
  windowMs: number
): boolean {
  const now = Date.now();
  sweepExpired(now);
  const entry = limiters.get(key);

  if (!entry || now >= entry.resetAt) {
    // First attempt or window expired — reset
    limiters.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (entry.count >= maxAttempts) {
    return true; // Blocked
  }

  entry.count += 1;
  return false;
}

/** Number of tracked limiter keys — exported for the smoke tests. */
export function getRateLimiterSize(): number {
  return limiters.size;
}
