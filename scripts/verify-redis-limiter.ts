/**
 * Smoke-test the Upstash Redis rate limiter's environment switching and
 * failure semantics without a real Redis or Next server.
 * Run: pnpm exec tsx scripts/verify-redis-limiter.ts
 *
 * The lib calls global fetch directly, so each scenario stubs
 * globalThis.fetch and asserts on what the lib actually did:
 *  - no env      → in-memory path, fetch never called
 *  - HTTP 4xx    → misconfiguration warn on EVERY call, still fail-open
 *  - network err → transient warn ONCE, still fail-open
 *  - shared bucket (mocked Upstash SET NX PX / INCR / TTL) → counts shared
 *    across checkRateLimit calls, `deals:` namespace prefix present
 *  - garbage INCR counts → no throw, no silent bypass (memory fallback)
 */
import { checkRateLimit } from "../lib/rate-limit";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const realFetch = globalThis.fetch;
const realWarn = console.warn;

let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
let warnCount = 0;

function stubFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>
) {
  fetchCalls = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), init });
    return handler(String(input), init);
  }) as typeof fetch;
}

function unstubFetch() {
  globalThis.fetch = realFetch;
}

const envSnapshot: Record<string, string | undefined> = {
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
};

function setEnv(url: string | undefined, token: string | undefined) {
  if (url === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = url;
  if (token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = token;
}

function restoreEnv() {
  setEnv(envSnapshot.UPSTASH_REDIS_REST_URL, envSnapshot.UPSTASH_REDIS_REST_TOKEN);
}

async function main() {
  console.warn = () => {
    warnCount += 1;
  };

  // ── (1) no env → in-memory path, fetch never touched ──
  try {
    restoreEnv();
    stubFetch(async () => new Response("should not be called", { status: 401 }));
    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      results.push(
        await checkRateLimit({ key: "verify:no-env", limit: 5, windowMs: 60_000 })
      );
    }
    assert(results[0] === false, "no-env call 1 allowed");
    assert(results[4] === false, "no-env call 5 allowed (at limit)");
    assert(results[5] === true, "no-env call 6 blocked");
    assert(fetchCalls.length === 0, "no-env path never calls fetch");
  } finally {
    unstubFetch();
  }

  // ── (2) network reject → transient warn ONCE, fail-open (sets warnedOnce) ──
  try {
    setEnv("https://upstash.example.com", "tok");
    stubFetch(() => Promise.reject(new TypeError("fetch failed")));
    warnCount = 0;
    const r1 = await checkRateLimit({ key: "verify:net-reject", limit: 5, windowMs: 60_000 });
    const r2 = await checkRateLimit({ key: "verify:net-reject", limit: 5, windowMs: 60_000 });
    assert(!r1 && !r2, "network failure fails open (calls allowed)");
    assert(warnCount === 1, "network failure warns exactly once across calls");
    for (let i = 0; i < 3; i++) {
      await checkRateLimit({ key: "verify:net-reject", limit: 5, windowMs: 60_000 });
    }
    assert(
      (await checkRateLimit({ key: "verify:net-reject", limit: 5, windowMs: 60_000 })) ===
        true,
      "network failure still blocks the 6th call (memory fallback)"
    );
  } finally {
    restoreEnv();
    unstubFetch();
  }

  // ── (3) HTTP 401 → misconfiguration warn on EVERY call, fail-open ──
  try {
    setEnv("https://upstash.example.com", "tok");
    stubFetch(async () => new Response("Unauthorized", { status: 401 }));
    warnCount = 0;
    const r1 = await checkRateLimit({ key: "verify:http-401", limit: 5, windowMs: 60_000 });
    const r2 = await checkRateLimit({ key: "verify:http-401", limit: 5, windowMs: 60_000 });
    assert(!r1 && !r2, "4xx fails open (calls allowed)");
    assert(warnCount === 2, "4xx misconfig warns on EVERY call (even after warnedOnce)");
    for (let i = 0; i < 3; i++) {
      await checkRateLimit({ key: "verify:http-401", limit: 5, windowMs: 60_000 });
    }
    assert(
      (await checkRateLimit({ key: "verify:http-401", limit: 5, windowMs: 60_000 })) ===
        true,
      "4xx still blocks the 6th call (memory fallback)"
    );
  } finally {
    restoreEnv();
    unstubFetch();
  }

  // ── (4) shared bucket: mocked Upstash pipeline (SET NX PX / INCR / TTL) ──
  try {
    setEnv("https://upstash.example.com", "tok");
    const store = new Map<string, { value: number; expiresAt: number }>();
    const receivedKeys: string[] = [];
    stubFetch(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Array<
        [string, ...Array<string | number>]
      >;
      const now = Date.now();
      const results: unknown[] = [];
      for (const cmd of body) {
        const op = cmd[0];
        const key = String(cmd[1]);
        receivedKeys.push(key);
        if (op === "SET") {
          const ttlMs = Number(cmd[5]);
          const cur = store.get(key);
          if (!cur || cur.expiresAt <= now) {
            store.set(key, { value: 0, expiresAt: now + ttlMs });
            results.push("OK");
          } else {
            results.push(null); // NX no-op: window stays anchored
          }
        } else if (op === "INCR") {
          const cur = store.get(key);
          const value = (cur?.value ?? 0) + 1;
          store.set(key, {
            value,
            expiresAt: cur?.expiresAt ?? now + 60_000,
          });
          results.push(value);
        } else if (op === "TTL") {
          const cur = store.get(key);
          results.push(cur ? Math.max(0, Math.ceil((cur.expiresAt - now) / 1000)) : -2);
        } else {
          results.push(null);
        }
      }
      return new Response(JSON.stringify(results.map((result) => ({ result }))), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const calls: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      calls.push(
        await checkRateLimit({ key: "verify:shared", limit: 2, windowMs: 60_000 })
      );
    }
    assert(calls[0] === false, "shared bucket call 1 allowed (count 1)");
    assert(calls[1] === false, "shared bucket call 2 allowed (count 2 shared)");
    assert(calls[2] === true, "shared bucket call 3 blocked (count 3 > limit 2)");
    assert(
      receivedKeys.some((k) => k.startsWith("deals:")),
      `redis keys carry the deals: namespace (got ${receivedKeys[0]})`
    );
  } finally {
    restoreEnv();
    unstubFetch();
  }

  // ── (5) count-parse safety: garbage INCR counts → fail-open, no throw ──
  try {
    setEnv("https://upstash.example.com", "tok");
    stubFetch(async () =>
      new Response(
        JSON.stringify([{ result: "OK" }, { result: "garbage" }, { result: 3600 }]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    let threw = false;
    const results: boolean[] = [];
    try {
      for (let i = 0; i < 6; i++) {
        results.push(
          await checkRateLimit({ key: "verify:parse-garbage", limit: 5, windowMs: 60_000 })
        );
      }
    } catch {
      threw = true;
    }
    assert(!threw, "garbage INCR count never throws out of checkRateLimit");
    assert(results[0] === false, "garbage count fails open (call allowed)");
    assert(results[5] === true, "garbage count still blocks the 6th call (no silent bypass)");

    // count < 1 (e.g. "0") is equally invalid — same fail-open path
    stubFetch(async () =>
      new Response(
        JSON.stringify([{ result: "OK" }, { result: 0 }, { result: 3600 }]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    threw = false;
    const zeroResults: boolean[] = [];
    try {
      for (let i = 0; i < 6; i++) {
        zeroResults.push(
          await checkRateLimit({ key: "verify:parse-zero", limit: 5, windowMs: 60_000 })
        );
      }
    } catch {
      threw = true;
    }
    assert(!threw, "count 0 never throws out of checkRateLimit");
    assert(zeroResults[5] === true, "count 0 still blocks the 6th call (no silent bypass)");
  } finally {
    restoreEnv();
    unstubFetch();
  }

  restoreEnv();
  console.warn = realWarn;
  console.log(
    "OK: redis limiter verified (no-env memory path, 4xx-every-call + network-once warns, fail-open, shared bucket, parse safety)"
  );
}

main().catch((err) => {
  console.warn = realWarn;
  console.error(err);
  process.exit(1);
});
