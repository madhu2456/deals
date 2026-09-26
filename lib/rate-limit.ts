const limiters = new Map<string, { count: number; resetAt: number }>();

/** Drop expired entries once the map grows past a threshold — keeps memory bounded. */
function sweepExpired(now: number): void {
  if (limiters.size <= 1000) return;
  for (const [k, e] of limiters) if (now >= e.resetAt) limiters.delete(k);
}

/**
 * Simple in-memory rate limiter. Synchronous entry point — this is the
 * production path when Upstash Redis is not configured, and the per-instance
 * fallback for `failMode: "open"` surfaces when it is configured but
 * unreachable (abuse surfaces use `failMode: "closed"` — see `redisRateLimit`).
 *
 * NOTE: this function is intentionally synchronous (consumers call it without
 * `await`), so it can never perform a remote Redis round-trip itself. For
 * shared multi-instance buckets, use `checkRateLimit` (async) in async
 * contexts; the decision semantics of both backends are identical.
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

export type RateLimitBackend = "memory" | "upstash";

export type RateLimitOutcome = {
  /** `true` if the call should be blocked (count exceeds limit) */
  limited: boolean;
  /** Epoch ms when the current window ends (informational) */
  resetAt: number;
  backend: RateLimitBackend;
  /**
   * F029: `true` when the block was caused by configured-but-unreachable
   * Redis on a `failMode: "closed"` surface (NOT by the visitor's own
   * attempt count) — callers use it to answer 503 instead of 429 so an
   * operator-visible outage is never misreported as user throttling.
   */
  failClosed?: boolean;
};

const hasUpstashConfig = () => {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return Boolean(url && token);
};

/** Keys may embed user-derived parts (IPs) — keep Redis keys well-formed. */
const sanitizeRedisKey = (key: string) =>
  key.replace(/[^a-zA-Z0-9:._@-]/g, "_").slice(0, 200);

let warnedOnce = false;
/** Increments when configured Redis is unreachable and we fail open to memory. */
let redisFallbackCount = 0;

/** `rl_redis_fallback` counter — exported for smoke tests / ops scrape. */
export function getRedisFallbackCount(): number {
  return redisFallbackCount;
}

/**
 * What the limiter does when Redis is CONFIGURED but unreachable (F029).
 *  - `open` — degrade to the per-instance memory bucket (interactive
 *    surfaces; a Redis outage must never lock out every visitor).
 *  - `closed` — block the request instead of trusting a bucket an attacker
 *    can route around by spreading attempts across instances (auth, report,
 *    click abuse surfaces).
 * The unconfigured (no-env) path is always the memory limiter — there is no
 * shared state to lose, so neither policy applies.
 */
export type RateLimitFailMode = "open" | "closed";

export type RedisFallbackAlert = {
  /** `rl_redis_fallback` total at alert time. */
  count: number;
  /** Policy in effect on the surface that tripped the fallback. */
  failMode: RateLimitFailMode;
  /** Error message only — never a URL, token, or key. */
  cause: string;
};

type RedisFallbackHandler = (alert: RedisFallbackAlert) => void;

/**
 * Alert sink for Redis fail-over events (F029). `failMode: "closed"` means an
 * abuse surface just lost its control — ops should page on it. Omit the
 * handler and the built-in structured log line is used; pass `null` to detach.
 */
export function onRedisFallbackAlert(handler: RedisFallbackHandler | null): void {
  redisFallbackHandler = handler;
}

let redisFallbackHandler: RedisFallbackHandler | null = null;

/** One alert per mode per minute — an outage must not flood the log. */
const ALERT_THROTTLE_MS = 60_000;
const lastAlertAt = new Map<RateLimitFailMode, number>();

function defaultRedisFallbackAlert({ count, failMode, cause }: RedisFallbackAlert): void {
  console.error(
    `ALERT rl_redis_fallback count=${count} fail_mode=${failMode} rate-limit: Upstash Redis unreachable — ${
      failMode === "closed"
        ? "fail-CLOSED: blocking the request (abuse surface degraded)"
        : "fail-open: per-instance memory limiting only"
    } (${cause})`
  );
}

function recordRedisFallback(failMode: RateLimitFailMode, cause: string): void {
  redisFallbackCount += 1;
  const now = Date.now();
  const last = lastAlertAt.get(failMode) ?? 0;
  if (now - last < ALERT_THROTTLE_MS) return;
  lastAlertAt.set(failMode, now);
  (redisFallbackHandler ?? defaultRedisFallbackAlert)({ count: redisFallbackCount, failMode, cause });
}

/**
 * Rate limiter backed by Upstash Redis REST (shared across instances) when
 * UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set; otherwise falls
 * back to the same in-memory limiter as `isRateLimited`.
 *
 * Failure semantics (F029): a Redis OUTAGE is a degraded abuse control, and
 * the policy is per surface, not global:
 *  - `failMode: "open"` (default) — the documented submit path. A Redis
 *    outage must never lock out submitters, so it degrades to per-instance
 *    limiting. Transient failures (network errors, 5xx) log a warning once;
 *    4xx responses mean a misconfigured URL/token and log a warning on every
 *    call.
 *  - `failMode: "closed"` — auth / report / click abuse surfaces. The
 *    per-instance memory bucket is NOT a shared control: an attacker
 *    spreads attempts across instances and simply outruns it, so the safe
 *    answer is to block (the caller answers 503) until Redis returns.
 * Every Redis fail-over — open or closed — increments `rl_redis_fallback`
 * (`getRedisFallbackCount`) and raises an alert (`onRedisFallbackAlert`),
 * throttled to one per mode per minute.
 *
 * Same semantics as `isRateLimited`: fixed window anchored at the first hit,
 * `true` when the count would exceed `limit` within `windowMs`.
 *
 * @param failMode - Redis-outage policy for this surface (default `"open"`)
 * @param key - Unique identifier (e.g. `login:${ip}` or `click:${ip}`)
 * @param limit - Maximum allowed attempts within the window
 * @param windowMs - Time window in milliseconds
 */
export async function redisRateLimit({
  key,
  limit,
  windowMs,
  failMode = "open",
}: {
  key: string;
  limit: number;
  windowMs: number;
  failMode?: RateLimitFailMode;
}): Promise<RateLimitOutcome> {
  if (!hasUpstashConfig()) {
    return rateLimitInMemory(key, limit, windowMs, "memory");
  }

  try {
    return await checkUpstashRateLimit(key, limit, windowMs);
  } catch (err) {
    // 4xx from Upstash is a config error (bad URL/token) — warn on EVERY call
    // so the misconfiguration stays loud; still fail open. Network errors and
    // 5xx are transient — warn once, not per request.
    recordRedisFallback(
      failMode,
      err instanceof UpstashHttpError
        ? `Upstash HTTP ${err.status} (configuration error)`
        : err instanceof Error
          ? err.message
          : String(err)
    );
    if (err instanceof UpstashHttpError && err.status >= 400 && err.status < 500) {
      console.warn(
        `rl_redis_fallback count=${redisFallbackCount} fail_mode=${failMode} rate-limit: Upstash rate-limit misconfiguration (HTTP ${err.status}) — check UPSTASH_REDIS_REST_URL/TOKEN — ${
          failMode === "closed" ? "failing CLOSED (blocking)" : "falling back to in-memory"
        }`
      );
    } else if (!warnedOnce) {
      warnedOnce = true;
      console.warn(
        `rl_redis_fallback count=${redisFallbackCount} fail_mode=${failMode} rate-limit: Upstash Redis unreachable — ${
          failMode === "closed" ? "failing CLOSED (blocking the request)" : "failing open to in-memory limiting"
        }`,
        err instanceof Error ? err.message : String(err)
      );
    }

    // F029 fail-closed: an abuse surface must not silently drop to a
    // per-instance bucket the attacker can outrun, so block the request.
    // No memory bucket is recorded — the visitor did not exceed anything.
    if (failMode === "closed") {
      return { limited: true, resetAt: Date.now() + windowMs, backend: "memory", failClosed: true };
    }
    return rateLimitInMemory(key, limit, windowMs, "memory");
  }
}

/**
 * Async rate-limit check for consumers in async contexts (server actions,
 * route handlers). Uses the shared Upstash bucket when configured, otherwise
 * the exact in-memory path — behavior is identical either way. Choose
 * `failMode` per surface (see `redisRateLimit`); use `redisRateLimit`
 * directly when the caller needs to tell an outage apart from throttling.
 *
 * @param key - Unique identifier (e.g. `login:${ip}` or `click:${ip}`)
 * @param limit - Maximum allowed attempts within the window
 * @param windowMs - Time window in milliseconds
 * @returns `true` if the request should be blocked (rate limited), `false` if allowed
 */
export async function checkRateLimit({
  key,
  limit,
  windowMs,
  failMode = "open",
}: {
  key: string;
  limit: number;
  windowMs: number;
  failMode?: RateLimitFailMode;
}): Promise<boolean> {
  const outcome = await redisRateLimit({ key, limit, windowMs, failMode });
  return outcome.limited;
}

/** Shared in-memory decision path — delegates to the exact sync limiter. */
function rateLimitInMemory(
  key: string,
  limit: number,
  windowMs: number,
  backend: RateLimitBackend
): RateLimitOutcome {
  const limited = isRateLimited(key, limit, windowMs);
  // `isRateLimited` just recorded the bucket — read its exact window end.
  const resetAt = limiters.get(key)?.resetAt ?? Date.now() + windowMs;
  return { limited, resetAt, backend };
}

type UpstashPipelineResult = Array<{ result: unknown }>;

/** Non-2xx Upstash response — carries the HTTP status so 4xx (config errors)
 * can be distinguished from transient 5xx/network failures. */
class UpstashHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Upstash pipeline HTTP ${status}`);
    this.name = "UpstashHttpError";
    this.status = status;
  }
}

async function checkUpstashRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitOutcome> {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/+$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!baseUrl || !token) {
    throw new Error("Upstash Redis not configured");
  }

  // One atomic round-trip: SET ... NX PX seeds the window only when the key is
  // absent (no-op otherwise — TTL is never extended, so the window stays
  // anchored at the first hit, matching the in-memory limiter); INCR counts;
  // TTL yields the exact remaining window for resetAt. SET starts at 0 so the
  // first hit counts as 1 after INCR (SET 1 + INCR would off-by-one to 2).
  // `deals:` namespace avoids collisions with other apps in a shared Upstash
  // DB; the in-memory map keeps the bare consumer key.
  const redisKey = sanitizeRedisKey(`deals:${key}`);
  const pipelineBody = [
    ["SET", redisKey, "0", "NX", "PX", String(windowMs)],
    ["INCR", redisKey],
    ["TTL", redisKey],
  ];

  const response = await fetch(`${baseUrl}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(pipelineBody),
    cache: "no-store",
    // 1.5s hard cap — fail-open means Redis must never add meaningful latency.
    signal: AbortSignal.timeout(1500),
  });

  if (!response.ok) {
    throw new UpstashHttpError(response.status);
  }

  const payload = (await response.json()) as UpstashPipelineResult;
  const countRaw = payload[1]?.result;
  const ttlRaw = payload[2]?.result;
  const count =
    typeof countRaw === "number"
      ? countRaw
      : Number.parseInt(String(countRaw ?? "0"), 10);
  if (!Number.isFinite(count) || count < 1) {
    throw new Error("Upstash INCR returned invalid count");
  }

  const ttlSec =
    typeof ttlRaw === "number"
      ? ttlRaw
      : Number.parseInt(String(ttlRaw ?? "-1"), 10);
  const resetAt =
    Date.now() +
    (Number.isFinite(ttlSec) && ttlSec > 0 ? ttlSec : Math.ceil(windowMs / 1000)) * 1000;
  const limited = count > limit;

  return { limited, resetAt, backend: "upstash" };
}
