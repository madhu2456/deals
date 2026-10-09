/**
 * F029 fail-CLOSED handler coverage (a2a run a2a-20260923-r2-8c4d1f).
 *
 * scripts/verify-redis-limiter.ts proves the LIMITER contract (Redis unreachable
 * + `failMode: "closed"` → `{limited: true, failClosed: true}` and no memory
 * bucket). This gate proves the three HANDLERS actually map that outcome onto an
 * operator-visible outage instead of visitor throttling, and that the submit
 * surface was NOT collateral damage:
 *
 *   1. login  — lib/actions.ts `loginAdminAction` returns the outage message
 *      ("Login is temporarily unavailable…"), NOT the 429 rate-limit message.
 *   2. report — lib/report-deal.ts `recordBrokenDealReport` returns status 503
 *      (not 429), and the real /api/deals/[id]/report route surfaces it.
 *   3. click  — the real /api/deals/[id]/click route answers 503
 *      "Temporarily unavailable" (not 429 "Too many requests").
 *   4. submit — with the SAME Redis outage, the submit path still fails OPEN
 *      (`checkRateLimit`/`redisRateLimit({failMode:"open"})` allow the request
 *      and degrade to the per-instance bucket), so a Redis outage can never
 *      lock every submitter out.
 *
 * Every fail-closed handler call must also record NO per-instance memory bucket
 * (`getRateLimiterSize()` unchanged) and must increment `rl_redis_fallback`
 * exactly once, raising one throttled alert with `fail_mode=closed`.
 *
 * No DB is touched: each fail-closed branch returns BEFORE any database read
 * (rate limit first by design), so a fresh CI checkout needs no dev.db.
 *
 * Invoker note: `loginAdminAction` calls `await headers()`, which throws
 * outside a Next request scope. Next's app-render async-local-storage captures
 * `globalThis.AsyncLocalStorage` at module load and Node never publishes it as
 * a global, so this gate installs it up front (before ANY next/* import) and
 * then runs the action inside synthetic work-unit/work async storages. That is
 * the only supported way to drive a real server action under plain tsx.
 *
 * Run: pnpm test:fail-closed
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");

// Must run before any next/* import (see module docstring).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test shim
(globalThis as any).AsyncLocalStorage ??= AsyncLocalStorage;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  assert(actual === expected, `${msg} (expected ${String(expected)}, got ${String(actual)})`);
}

const UPSTASH_URL = "https://upstash.example.com";
const UPSTASH_TOKEN = "verify-token";

const envSnapshot: Record<string, string | undefined> = {
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
};

function setRedisEnv(): void {
  process.env.UPSTASH_REDIS_REST_URL = UPSTASH_URL;
  process.env.UPSTASH_REDIS_REST_TOKEN = UPSTASH_TOKEN;
}

function restoreRedisEnv(): void {
  if (envSnapshot.UPSTASH_REDIS_REST_URL === undefined) {
    delete process.env.UPSTASH_REDIS_REST_URL;
  } else {
    process.env.UPSTASH_REDIS_REST_URL = envSnapshot.UPSTASH_REDIS_REST_URL;
  }
  if (envSnapshot.UPSTASH_REDIS_REST_TOKEN === undefined) {
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  } else {
    process.env.UPSTASH_REDIS_REST_TOKEN = envSnapshot.UPSTASH_REDIS_REST_TOKEN;
  }
}

/** Redis unreachable at the network layer (transient outage). */
function stubRedisNetworkDown(): void {
  globalThis.fetch = (() =>
    Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
}

/** Redis up but rejecting the call (5xx — also a lost control, not a 4xx). */
function stubRedisServiceError(): void {
  globalThis.fetch = (async () =>
    new Response("Internal Server Error", { status: 500 })) as typeof fetch;
}

/** Redis misconfiguration: 4xx (bad URL/token) — still a lost control. */
function stubRedisMisconfigured(): void {
  globalThis.fetch = (async () =>
    new Response("Unauthorized", { status: 401 })) as typeof fetch;
}

async function main(): Promise<void> {
  // ── (1) Static wiring asserts — the fail-closed decisions live in source ──
  const actionsSrc = readFileSync(join(repoRoot, "lib", "actions.ts"), "utf8");
  assert(
    actionsSrc.includes('key: `login:${ip}`') && actionsSrc.includes('failMode: "closed"'),
    "login is a fail-CLOSED surface"
  );
  assert(
    actionsSrc.includes("Login is temporarily unavailable. Please try again shortly."),
    "login maps the failClosed outage to a distinct operator-visible message"
  );
  // Anti-weakening guard: the submit call site must NOT opt into fail-closed.
  const submitBlock = actionsSrc.slice(
    actionsSrc.indexOf("key: `submit:${ip}`") - 200,
    actionsSrc.indexOf("key: `submit:${ip}`") + 300
  );
  assert(
    !submitBlock.includes('failMode: "closed"'),
    "submit stays fail-OPEN (no failMode: closed at the submit call site)"
  );
  assert(
    submitBlock.includes("Too many submissions from your IP"),
    "submit keeps its 429-style rejection message"
  );

  const reportSrc = readFileSync(join(repoRoot, "lib", "report-deal.ts"), "utf8");
  assert(reportSrc.includes('failMode: "closed"'), "report is a fail-CLOSED surface");
  assert(
    reportSrc.includes("status: reportLimit.failClosed ? 503 : 429"),
    "report answers 503 for the outage and 429 for real throttling"
  );
  assert(
    reportSrc.includes("Reporting is temporarily unavailable."),
    "report carries its outage copy"
  );

  const clickSrc = readFileSync(
    join(repoRoot, "app", "api", "deals", "[id]", "click", "route.ts"),
    "utf8"
  );
  assert(clickSrc.includes('failMode: "closed"'), "click is a fail-CLOSED surface");
  assert(
    clickSrc.includes("status: clickLimit.failClosed ? 503 : 429"),
    "click answers 503 for the outage and 429 for real throttling"
  );
  assert(clickSrc.includes('"Temporarily unavailable"'), "click carries its outage copy");

  // ── (2) Behavioral asserts: Redis down + NODE_ENV=production ──
  const { getRateLimiterSize, getRedisFallbackCount, onRedisFallbackAlert } =
    await import("../lib/rate-limit");
  const { NextRequest } = await import("next/server");

  const realFetch = globalThis.fetch;
  const realError = console.error;
  const realWarn = console.warn;
  const alerts: Array<{ count: number; failMode: string; cause: string }> = [];
  onRedisFallbackAlert((a) => alerts.push(a));

  // Next augments NODE_ENV as readonly — cast to set it at runtime (same
  // approach as the report/click gates).
  const prevNodeEnv = process.env.NODE_ENV;
  (process.env as { NODE_ENV?: string }).NODE_ENV = "production";

  // The limiter's own warn/alert lines are expected on every fail-closed trip —
  // silence them so the gate's output is the verdict, not the noise.
  console.error = () => {};
  console.warn = () => {};

  try {
    // ── (2a) login server action: outage message, not the throttle message ──
    for (const scenario of [
      { name: "network outage", stub: stubRedisNetworkDown },
      { name: "upstream 5xx", stub: stubRedisServiceError },
      { name: "4xx misconfiguration", stub: stubRedisMisconfigured },
    ]) {
      setRedisEnv();
      scenario.stub();
      const sizeBefore = getRateLimiterSize();
      const fallbackBefore = getRedisFallbackCount();
      const alertsBefore = alerts.length;

      const { loginAdminAction } = await import("../lib/actions");
      const { workAsyncStorage } = await import(
        "next/dist/server/app-render/work-async-storage.external"
      );
      const { workUnitAsyncStorage } = await import(
        "next/dist/server/app-render/work-unit-async-storage.external"
      );
      // Next's storages demand full WorkStore/WorkUnitStore shapes; the
      // synthetic minimal stores below are cast through the storages' own
      // parameter types so tsc stays satisfied (runtime only reads route/type).
      type WorkStore = Parameters<typeof workAsyncStorage.run>[0];
      type WorkUnitStore = Parameters<typeof workUnitAsyncStorage.run>[0];
      const workStore = { route: "/admin/login" } as unknown as WorkStore;
      const unitStore = {
        type: "request",
        phase: "action",
        headers: new Headers({ "x-real-ip": "203.0.113.44" }),
      } as unknown as WorkUnitStore;
      const form = new FormData();
      form.set("username", "admin");
      form.set("password", "not-a-real-credential");

      const result = await workUnitAsyncStorage.run(unitStore, () =>
        workAsyncStorage.run(workStore, () => loginAdminAction(form))
      );

      assertEqual(result.success, false, `login (${scenario.name}) fails closed`);
      // Negative first: TS narrows `error` after an `===` assert, which would
      // make this inequality read as a no-overlap error.
      assert(
        result.error !== "Too many login attempts. Please try again in 15 minutes.",
        `login (${scenario.name}) never misreports an outage as a 429`
      );
      assert(
        result.error === "Login is temporarily unavailable. Please try again shortly.",
        `login (${scenario.name}) reports a limiter OUTAGE, not visitor throttling (got ${String(
          result.error
        )})`
      );
      assertEqual(
        getRateLimiterSize(),
        sizeBefore,
        `login (${scenario.name}) records no per-instance memory bucket`
      );
      assertEqual(
        getRedisFallbackCount(),
        fallbackBefore + 1,
        `login (${scenario.name}) increments rl_redis_fallback`
      );
      // One alert per mode per minute — the first closed call pages, the rest
      // are throttled so an outage cannot flood the log.
      assert(
        alerts.length - alertsBefore === (alertsBefore === 0 ? 1 : 0),
        `login (${scenario.name}) raises one throttled fail-closed alert (was ${
          alerts.length - alertsBefore
        })`
      );

      globalThis.fetch = realFetch;
      restoreRedisEnv();
    }

    // ── (2b) report handler: 503 (not 429), before any DB read ──
    setRedisEnv();
    stubRedisNetworkDown();
    {
      const { recordBrokenDealReport } = await import("../lib/report-deal");
      const sizeBefore = getRateLimiterSize();
      const fallbackBefore = getRedisFallbackCount();

      const report = await recordBrokenDealReport("does-not-exist-123", "203.0.113.45");
      assertEqual(report.success, false, "report fails closed when Redis is down");
      if (!report.success) {
        assertEqual(report.status, 503, "report answers 503 for the limiter outage");
        assert(
          report.error === "Reporting is temporarily unavailable. Please try again shortly.",
          `report reports an outage, not throttling (got ${report.error})`
        );
        assert(
          report.status !== 429,
          "report never maps a Redis outage onto visitor throttling"
        );
      }
      assertEqual(
        getRateLimiterSize(),
        sizeBefore,
        "report records no per-instance memory bucket"
      );
      assertEqual(
        getRedisFallbackCount(),
        fallbackBefore + 1,
        "report increments rl_redis_fallback"
      );

      // The same handler through the real route handler (origin guard first).
      const { POST: reportRoute } = await import("../app/api/deals/[id]/report/route");
      const body = new FormData();
      body.set("note", "fail-closed check");
      const routeRes = await reportRoute(
        new NextRequest("https://deals.madhudadi.in/api/deals/test/report", {
          method: "POST",
          headers: {
            origin: "https://deals.madhudadi.in",
            "x-real-ip": "203.0.113.46",
          },
          body,
        }),
        { params: Promise.resolve({ id: "does-not-exist-123" }) }
      );
      assertEqual(routeRes.status, 503, "report route surfaces the fail-closed 503");
      const routeJson = (await routeRes.json()) as { success: boolean; error?: string };
      assertEqual(routeJson.success, false, "report route body marks the request failed");
      assert(
        routeJson.error === "Reporting is temporarily unavailable. Please try again shortly.",
        `report route outage copy (got ${String(routeJson.error)})`
      );

      globalThis.fetch = realFetch;
      restoreRedisEnv();
    }

    // ── (2c) click route: 503 (not 429) ──
    setRedisEnv();
    stubRedisNetworkDown();
    {
      const { POST: clickRoute } = await import("../app/api/deals/[id]/click/route");
      const sizeBefore = getRateLimiterSize();
      const fallbackBefore = getRedisFallbackCount();

      const clickRes = await clickRoute(
        new NextRequest("https://deals.madhudadi.in/api/deals/test/click", {
          method: "POST",
          headers: {
            origin: "https://deals.madhudadi.in",
            "user-agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "x-real-ip": "203.0.113.47",
          },
        }),
        { params: Promise.resolve({ id: "does-not-exist-123" }) }
      );
      assertEqual(clickRes.status, 503, "click route answers 503 for the limiter outage");
      const clickJson = (await clickRes.json()) as { success: boolean; error?: string };
      assertEqual(clickJson.success, false, "click route body marks the request failed");
      assert(
        clickJson.error === "Temporarily unavailable",
        `click route outage copy (got ${String(clickJson.error)})`
      );
      assert(
        clickRes.status !== 429,
        "click route never maps a Redis outage onto visitor throttling"
      );
      assertEqual(
        getRateLimiterSize(),
        sizeBefore,
        "click route records no per-instance memory bucket"
      );
      assertEqual(
        getRedisFallbackCount(),
        fallbackBefore + 1,
        "click route increments rl_redis_fallback"
      );

      globalThis.fetch = realFetch;
      restoreRedisEnv();
    }

    // ── (2d) the submit surface STILL fails open under the same outage ──
    setRedisEnv();
    stubRedisNetworkDown();
    {
      const { checkRateLimit, redisRateLimit } = await import("../lib/rate-limit");
      const sizeBefore = getRateLimiterSize();

      const openOutcome = await redisRateLimit({
        key: "submit:203.0.113.48",
        limit: 5,
        windowMs: 60 * 60 * 1000,
        failMode: "open",
      });
      assertEqual(openOutcome.limited, false, "submit fail-open allows the request");
      assert(
        openOutcome.failClosed === undefined,
        "submit fail-open never reports the failClosed marker"
      );

      const submitCalls: boolean[] = [];
      for (let i = 0; i < 5; i += 1) {
        submitCalls.push(
          await checkRateLimit({ key: "submit:203.0.113.49", limit: 5, windowMs: 60 * 60 * 1000 })
        );
      }
      assert(
        submitCalls.every((c) => c === false),
        "checkRateLimit (submit path) still allows every request under the outage"
      );
      const sixth = await checkRateLimit({
        key: "submit:203.0.113.49",
        limit: 5,
        windowMs: 60 * 60 * 1000,
      });
      assert(
        sixth === true,
        "submit fail-open memory fallback still blocks the 6th call (no silent bypass)"
      );
      const seventh = await checkRateLimit({
        key: "submit:203.0.113.50",
        limit: 5,
        windowMs: 60 * 60 * 1000,
      });
      assert(seventh === false, "a fresh submit IP is unaffected by the outage");
      assertEqual(
        getRateLimiterSize(),
        sizeBefore + 3,
        "submit fail-open degrades to the per-instance bucket (3 keys recorded)"
      );

      // Boundary: limit: 0 with failMode "open" must still allow the first hit
      // (fixed-window semantics: count 1 > limit 0 is NOT "over" on the first
      // attempt — it matches isRateLimited exactly).
      const firstAtZero = await redisRateLimit({
        key: "submit:203.0.113.51",
        limit: 0,
        windowMs: 60 * 60 * 1000,
        failMode: "open",
      });
      assertEqual(firstAtZero.limited, false, "limit 0 allows the first request (same as memory)");

      globalThis.fetch = realFetch;
      restoreRedisEnv();
    }

    console.log(
      "OK: F029 fail-CLOSED verified at the handlers (login outage message, report 503, report route 503, click route 503, no memory buckets, submit stays fail-open, alert throttled)"
    );
  } finally {
    onRedisFallbackAlert(null);
    console.error = realError;
    console.warn = realWarn;
    globalThis.fetch = realFetch;
    restoreRedisEnv();
    const mutableEnv = process.env as { NODE_ENV?: string };
    if (prevNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = prevNodeEnv;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
