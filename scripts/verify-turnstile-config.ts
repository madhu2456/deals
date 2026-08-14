/**
 * Turnstile deployment config (F-DEAL-003 / IER6).
 *
 * The app is fail-closed when Turnstile is enabled and treats a half-config
 * (exactly one of TURNSTILE_SECRET_KEY / NEXT_PUBLIC_TURNSTILE_SITE_KEY) as a
 * production-rejecting misconfiguration. This script enforces that parity:
 *
 *  1. Process env parity (presence only — never logs or prints key values):
 *     both keys set or neither.
 *  2. Static: lib/actions.ts contains the parity check + fail-closed
 *     production path + siteverify call.
 *  3. Static: app/submit/SubmitDealForm.tsx renders the widget against the
 *     public site key (widget code path present).
 *  4. Static: .env.example documents both key names (names only, never values).
 *
 * Run: pnpm test:turnstile-config
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function main(): void {
  // ── 1. Env parity (presence only) ──
  const secretSet = Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
  const siteSet = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim());
  assert(
    secretSet === siteSet,
    "TURNSTILE_SECRET_KEY and NEXT_PUBLIC_TURNSTILE_SITE_KEY must be BOTH set or BOTH unset " +
      "(fail-closed parity). Setting exactly one is a half-config that production rejects."
  );
  console.log(
    `Env parity: ${secretSet ? "both keys set" : "neither key set (honeypot-only mode)"}`
  );

  // ── 2. Server-side fail-closed path in lib/actions.ts ──
  const actions = readFileSync(join(repoRoot, "lib", "actions.ts"), "utf8");
  assert(
    actions.includes("turnstileMisconfigured") &&
      actions.includes("Boolean(turnstileSecretKey) !== Boolean(turnstileSiteKey)"),
    "lib/actions.ts computes half-config parity (turnstileMisconfigured)"
  );
  assert(
    /turnstileMisconfigured && process\.env\.NODE_ENV === "production"/.test(actions),
    "lib/actions.ts rejects submits on half-config in production (fail closed)"
  );
  assert(
    actions.includes("https://challenges.cloudflare.com/turnstile/v0/siteverify"),
    "lib/actions.ts calls Cloudflare siteverify when enabled"
  );
  assert(
    actions.includes('"cf-turnstile-response"'),
    "lib/actions.ts reads the cf-turnstile-response token"
  );

  // ── 3. Widget code path in the submit form ──
  const form = readFileSync(join(repoRoot, "app", "submit", "SubmitDealForm.tsx"), "utf8");
  assert(
    form.includes("NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
    "SubmitDealForm reads the public site key (NEXT_PUBLIC_TURNSTILE_SITE_KEY)"
  );
  assert(
    form.includes("window.turnstile.render"),
    "SubmitDealForm renders the Turnstile widget (window.turnstile.render)"
  );
  assert(
    form.includes('"response-field-name": "cf-turnstile-response"'),
    "widget response field name matches the server lookup"
  );
  assert(
    form.includes("challenges.cloudflare.com/turnstile/v0/api.js"),
    "Turnstile loader script is present"
  );

  // ── 4. .env.example documents both key names (template, not secrets) ──
  const example = readFileSync(join(repoRoot, ".env.example"), "utf8");
  assert(
    example.includes("TURNSTILE_SECRET_KEY") &&
      example.includes("NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
    ".env.example documents both Turnstile keys"
  );

  console.log("OK: Turnstile config parity + widget code path verified");
}

main();
