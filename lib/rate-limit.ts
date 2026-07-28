const limiters = new Map<string, { count: number; resetAt: number }>();

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
