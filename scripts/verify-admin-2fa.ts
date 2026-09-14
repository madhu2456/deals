/**
 * F021 admin-2FA regression gate. Covers:
 *   1. TOTP RFC 6238 known vectors (SHA-1, appendix times; 6-digit = last 6
 *      of the RFC's 8-digit values) + RFC 4648 base32 vectors.
 *   2. verifyTotp drift (±1 step ok, ±2 rejected) + malformed-code rejects.
 *   3. Env gate OFF (default) → loginAdmin path unchanged: user+password
 *      succeeds, wrong password fails — no 2FA row consulted.
 *   4. Env gate ON → blank/wrong TOTP rejected; correct TOTP passes; wrong
 *      password rejected regardless of code; not-enrolled rejects all codes.
 *   5. Recovery codes single-use (2nd attempt fails), TOTP tried first,
 *      remaining-count tracked. SEC-01: TOTP replay guard (same code twice
 *      REJECTED). SEC-04: racing recovery consumes — exactly one wins.
 *   6. Turnstile verify wiring on admin login (gated on 2FA+Turnstile flags,
 *      reusing the submit-flow siteverify helper).
 *   7. At-rest: TOTP secret stored as AES-GCM envelope (never plaintext
 *      base32, per-row scrypt salt — v2), recovery codes stored as digests.
 *   8. Static ship-state asserts (default-off stays shippable).
 *
 * loginAdmin's 2FA gate runs BEFORE the JWT/cookie step, so under tsx (no
 * Next request scope) a fully-valid login throws at cookies() — that throw
 * is PROOF the credential+2FA checks passed. A 2FA failure instead returns
 * {success:false} cleanly before any Next API is touched.
 *
 * Run: pnpm test:admin-2fa
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");
const PRISMA_BIN = join(repoRoot, "node_modules", ".bin", "prisma");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}
function assertEqual(actual: unknown, expected: unknown, msg: string): void {
  assert(actual === expected, `${msg} (expected ${String(expected)}, got ${String(actual)})`);
}

function resolveSourceDb(): string | null {
  const raw = process.env.DATABASE_URL;
  if (raw && raw.startsWith("file:")) {
    const p = raw.slice("file:".length);
    const abs = p.startsWith("/") ? p : join(repoRoot, "prisma", p);
    if (existsSync(abs)) return abs;
  }
  const fallback = join(repoRoot, "prisma", "dev.db");
  return existsSync(fallback) ? fallback : null;
}

type LoginOutcome =
  | { stage: "rejected"; error?: string }
  | { stage: "passed" };

/**
 * Run loginAdmin and classify: a clean {success:false} is a rejection; a
 * throw mentioning the request/cookie scope means every gate passed and the
 * helper hit the Next-only cookie API (expected under tsx).
 */
async function loginOutcome(
  loginAdmin: (u: string, p: string, c?: string) => Promise<{ success: boolean; error?: string }>,
  username: string,
  password: string,
  totpCode?: string
): Promise<LoginOutcome> {
  try {
    const r = await loginAdmin(username, password, totpCode);
    return r.success ? { stage: "passed" } : { stage: "rejected", error: r.error };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/request scope|cookies|cookie/i.test(msg)) return { stage: "passed" };
    throw e;
  }
}

async function main(): Promise<void> {
  // ── 1. Pure TOTP/base32 unit tests (no DB, no Next runtime) ──
  const totp = await import("../lib/totp");
  const {
    base32Decode,
    base32Encode,
    generateTotp,
    verifyTotp,
    generateRecoveryCodes,
    hashRecoveryCode,
    verifyRecoveryCode,
    RECOVERY_CODE_COUNT,
  } = totp;

  // RFC 4648 base32 test vectors. Encoder is unpadded (otpauth convention);
  // padded input on the decode side must still round-trip.
  assertEqual(base32Encode(Buffer.from("foobar")), "MZXW6YTBOI", "base32 rfc4648 'foobar' (unpadded)");
  assert(base32Decode("MZXW6YTBOI======")?.toString() === "foobar", "base32 decode vector");
  assert(base32Decode("mzxw6ytboi")?.toString() === "foobar", "base32 lowercase+unpadded");
  assert(base32Decode("MZXW6YTBOI======")?.toString() === "foobar", "base32 decode tolerates padding");
  assert(base32Decode(encRound(Buffer.from("Hello, world!"))) !== null, "base32 round-trips binary input");
  assert(base32Decode("ABC1!") === null, "base32 invalid char → null");
  assert(base32Decode("")?.length === 0, "base32 empty → empty buffer");
  // Round-trip helper: encode must invert decode across sizes (incl. non-multiples of 5)
  function encRound(buf: Buffer): string {
    return base32Encode(buf);
  }
  for (const n of [1, 5, 10, 20]) {
    const raw = Buffer.from(`x`.repeat(n));
    assert(base32Decode(encRound(raw))?.toString() === raw.toString(), `base32 round-trip n=${n}`);
  }

  // RFC 6238 SHA-1 known vectors — appendix times, 6-digit code = the last
  // 6 digits of the RFC's 8-digit value (identical truncation, fewer digits).
  // Secret "12345678901234567890" = base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ.
  const RFC_SECRET = base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert(RFC_SECRET !== null, "RFC 6238 appendix secret decodes");
  const RFC_VECTORS: Array<[number, string]> = [
    [59, "287082"],
    [1111111109, "081804"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ];
  for (const [tSec, expected6] of RFC_VECTORS) {
    assertEqual(generateTotp(RFC_SECRET!, tSec * 1000), expected6, `RFC 6238 vector T=${tSec}`);
  }
  // Drift: exact step + ±1 accepted (±30s), ±2 rejected
  assert(verifyTotp(generateTotp(RFC_SECRET!, 59_000), RFC_SECRET!, 59_000) === true, "verify accepts exact-step code");
  const past = generateTotp(RFC_SECRET!, 59_000 - 30_000);
  const future = generateTotp(RFC_SECRET!, 59_000 + 30_000);
  assert(verifyTotp(past, RFC_SECRET!, 59_000) === true, "verify accepts -1 step drift");
  assert(verifyTotp(future, RFC_SECRET!, 59_000) === true, "verify accepts +1 step drift");
  const past2 = generateTotp(RFC_SECRET!, 59_000 - 60_000);
  assert(verifyTotp(past2, RFC_SECRET!, 59_000) === false, "verify rejects -2 step drift");
  // Rejections: another step's code / non-numeric / wrong length / empty
  const wrongCode = generateTotp(RFC_SECRET!, 999_000_000);
  assert(verifyTotp(wrongCode, RFC_SECRET!, 59_000) === false, "verify rejects code from another step");
  assert(verifyTotp("abcdef", RFC_SECRET!, 59_000) === false, "verify rejects non-numeric");
  assert(verifyTotp("12345", RFC_SECRET!, 59_000) === false, "verify rejects 5-digit");
  assert(verifyTotp("1234567", RFC_SECRET!, 59_000) === false, "verify rejects 7-digit");
  assert(verifyTotp("", RFC_SECRET!, 59_000) === false, "verify rejects empty");

  // Recovery codes: shape, uniqueness, digest verify
  const codes = generateRecoveryCodes();
  assertEqual(codes.length, RECOVERY_CODE_COUNT, "default recovery code count");
  assert(codes.every((c) => /^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/.test(c)), "recovery code shape");
  assert(new Set(codes).size === codes.length, "recovery codes unique");
  const digest = hashRecoveryCode(codes[0]);
  assert(/^[0-9a-f]{64}$/.test(digest), "recovery hash is sha-256 hex");
  assert(verifyRecoveryCode(codes[0], digest) === true, "recovery verify accepts its code");
  assert(verifyRecoveryCode(codes[0].toLowerCase(), digest) === true, "recovery verify case/space-insensitive");
  assert(verifyRecoveryCode(codes[1], digest) === false, "recovery verify rejects a different code");
  assert(verifyRecoveryCode("AAAA-BBBB", digest) === false, "recovery verify rejects malformed");

  // ── 2. DB-backed tests (env-gated login flows, recovery single-use) ──
  const workDir = mkdtempSync(join(tmpdir(), "deals-admin-2fa-"));
  const dbPath = join(workDir, "admin2fa.db");
  const dbUrl = `file:${dbPath}`;

  try {
    const source = resolveSourceDb();
    if (source) {
      copyFileSync(source, dbPath);
      for (const suffix of ["-wal", "-shm", "-journal"]) {
        if (existsSync(source + suffix)) copyFileSync(source + suffix, dbPath + suffix);
      }
      // Bring the copy up to the latest schema (incl. admin_2fa) — scratch only.
      execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: dbUrl },
        stdio: "inherit",
      });
    } else {
      console.log("No source DB found — creating fresh DB via prisma migrate deploy");
      execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: dbUrl },
        stdio: "inherit",
      });
    }

    // Env BEFORE importing the modules that read it.
    process.env.DATABASE_URL = dbUrl;
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "test-password-2fa";
    process.env.ADMIN_SECRET = "test-secret-at-least-32-chars-long-1234";
    process.env.ADMIN_2FA_ENCRYPTION_KEY = "test-encryption-key-2fa-32-chars!!";

    const { prisma } = await import("../lib/prisma");
    const { loginAdmin } = await import("../lib/admin-auth");

    // ── 2a. Env gate OFF (default) → EXACTLY pre-F021 login ──
    delete process.env.ADMIN_2FA_ENABLED;
    const off = await loginOutcome(loginAdmin, "admin", "test-password-2fa");
    assertEqual(off.stage, "passed", "gate OFF: user+password login succeeds (pre-F021 path)");
    const offBad = await loginOutcome(loginAdmin, "admin", "wrong");
    assertEqual(offBad.stage, "rejected", "gate OFF: wrong password still rejected");
    // Gate OFF ignores any stray code: no 2FA error can surface
    const offWithCode = await loginOutcome(loginAdmin, "admin", "test-password-2fa", "000000");
    assertEqual(offWithCode.stage, "passed", "gate OFF: a supplied code is never checked");

    // ── 2b. Gate ON, not enrolled → every code fails (no row) ──
    process.env.ADMIN_2FA_ENABLED = "true";
    const admin2fa = await import("../lib/admin-2fa");
    const { enrollAdmin2FA, verifyAdminSecondFactor, getAdmin2faStatus, remainingRecoveryCodes } = admin2fa;
    assertEqual(getAdmin2faStatus().enabled, true, "status reflects env gate");
    assertEqual(getAdmin2faStatus().turnstile, false, "status: no Turnstile flag without both keys");
    const noRow = await verifyAdminSecondFactor("123456");
    assertEqual(noRow, false, "gate ON without enrollment: verify fails (no row)");

    // ── 2c. Gate ON + enrolled → blank/wrong TOTP rejected, correct passes ──
    const enrolled = await enrollAdmin2FA();
    const nowCode = () => generateTotp(base32Decode(enrolled.totpSecretBase32)!, Date.now());

    const good = await loginOutcome(loginAdmin, "admin", "test-password-2fa", nowCode());
    assertEqual(good.stage, "passed", "gate ON: correct TOTP login passes the 2FA gate");

    const noCode = await loginOutcome(loginAdmin, "admin", "test-password-2fa", "  ");
    assertEqual(noCode.stage, "rejected", "gate ON: blank TOTP rejected");
    if (noCode.stage === "rejected") assertEqual(noCode.error, "2FA code is required", "blank code error text");

    const badCode = await loginOutcome(loginAdmin, "admin", "test-password-2fa", "000000");
    assertEqual(badCode.stage, "rejected", "gate ON: wrong TOTP rejected");
    if (badCode.stage === "rejected") assertEqual(badCode.error, "Invalid 2FA code", "wrong code error text");

    // Wrong password still rejected first (credential check precedes 2FA)
    const badPass = await loginOutcome(loginAdmin, "admin", "wrong", "123456");
    assertEqual(badPass.stage, "rejected", "gate ON: wrong password rejected regardless of code");
    if (badPass.stage === "rejected") assertEqual(badPass.error, "Invalid credentials", "credential error precedes 2FA");

    // ── 2d. Recovery single-use: first success consumes, second fails ──
    const recoveryCode = enrolled.recoveryCodes[0];
    assertEqual(await verifyAdminSecondFactor(recoveryCode), true, "recovery code accepted on first use");
    assertEqual(await verifyAdminSecondFactor(recoveryCode), false, "recovery code REJECTED on second use (single-use)");
    assertEqual(await verifyAdminSecondFactor(enrolled.recoveryCodes[1]), true, "other recovery codes still usable");
    assertEqual(await remainingRecoveryCodes(), RECOVERY_CODE_COUNT - 2, "remaining count reflects consumption");

    // TOTP still passes after recovery use (path order: TOTP first). Use a
    // +1-step code: the earlier `good` login consumed the current timestep
    // (SEC-01 mark), so an identical-time code would now be a replay. +30s
    // lands exactly one step ahead of the mark and stays within the ±1
    // drift window at verify time (a +2-step code would never match).
    const afterRecCode = generateTotp(base32Decode(enrolled.totpSecretBase32)!, Date.now() + 30_000);
    const afterRec = await loginOutcome(loginAdmin, "admin", "test-password-2fa", afterRecCode);
    assertEqual(afterRec.stage, "passed", "TOTP path unaffected by recovery consumption");

    // Mock seam: injected verifyTotpFn is honored (test-only injection point).
    // +10 steps: the +30s afterRec login above advanced the SEC-01 mark past
    // the current step, so a "fresh" injection must sit strictly above it.
    assertEqual(await verifyAdminSecondFactor("999999", () => null), false, "injected verifyTotpFn null (no match) is honored (test seam)");
    assertEqual(
      await verifyAdminSecondFactor("999999", () => Math.floor(Date.now() / 1000 / 30) + 10),
      true,
      "injected verifyTotpFn fresh-step is honored (test seam)"
    );

    // ── 2d-2. SEC-01 TOTP replay guard: the SAME code is single-use ──
    // Re-enroll for a clean lastUsedTimestep, then: first use passes, replay
    // of the same code (same timestep) is REJECTED.
    const enrolled2 = await enrollAdmin2FA();
    const replayCode = generateTotp(base32Decode(enrolled2.totpSecretBase32)!, Date.now());
    assertEqual(await verifyAdminSecondFactor(replayCode), true, "SEC-01: fresh TOTP accepted on first use");
    assertEqual(await verifyAdminSecondFactor(replayCode), false, "SEC-01: SAME code replayed is REJECTED (timestep ≤ lastUsed)");
    const replayRow = await prisma.admin2FA.findUnique({ where: { subject: "admin" } });
    assert(replayRow !== null && replayRow.lastUsedTimestep !== null, "SEC-01: lastUsedTimestep persisted on success");
    // Drift-window replay: a code from the PREVIOUS step (still within ±1
    // drift) is also rejected — its timestep ≤ the consumed high-water mark.
    const prevStepCode = generateTotp(base32Decode(enrolled2.totpSecretBase32)!, Date.now() - 30_000);
    assertEqual(await verifyAdminSecondFactor(prevStepCode), false, "SEC-01: -1-step drift code after consumption is REJECTED");
    // A FUTURE-step code (fresh timestep > mark) still passes. +30s steps
    // exactly one timestep ahead of the just-consumed mark and remains
    // within the ±1 drift window at verify time.
    const nextStepCode = generateTotp(base32Decode(enrolled2.totpSecretBase32)!, Date.now() + 30_000);
    assertEqual(await verifyAdminSecondFactor(nextStepCode), true, "SEC-01: next-step code (timestep > mark) accepted");
    // Two racing verifies of the SAME fresh code: only one wins. Re-enroll
    // first so a fresh valid timestep exists (the mark is reset to null);
    // capture ONE code string so both racers present the identical code.
    const enrolledRace = await enrollAdmin2FA();
    const raceCodeStr = generateTotp(base32Decode(enrolledRace.totpSecretBase32)!, Date.now());
    const [raceA, raceB] = await Promise.all([
      verifyAdminSecondFactor(raceCodeStr),
      verifyAdminSecondFactor(raceCodeStr),
    ]);
    assert(
      (raceA && !raceB) || (!raceA && raceB),
      `SEC-01 race: exactly one of two concurrent same-code verifies wins (a=${raceA}, b=${raceB})`
    );

    // ── 2d-3. SEC-04 TOCTOU: two racing recovery-code consumes → one wins ──
    // Re-enroll for a fresh code set, then fire two concurrent consumes of
    // the same recovery code — the conditional update means exactly one lands.
    const enrolled3 = await enrollAdmin2FA();
    const raceRec = enrolled3.recoveryCodes[0];
    const [recA, recB] = await Promise.all([
      verifyAdminSecondFactor(raceRec),
      verifyAdminSecondFactor(raceRec),
    ]);
    assert(
      (recA && !recB) || (!recA && recB),
      `SEC-04 race: exactly one of two concurrent recovery consumes wins (a=${recA}, b=${recB})`
    );
    // The loser's failed attempt did NOT burn the code for the winner's
    // effect: a THIRD sequential attempt is still rejected (single-use).
    assertEqual(await verifyAdminSecondFactor(raceRec), false, "SEC-04: post-race third attempt still rejected");
    assertEqual(await remainingRecoveryCodes(), RECOVERY_CODE_COUNT - 1, "SEC-04: exactly one code consumed after the race");

    // ── 2e. Turnstile verify wiring on admin login (2FA+Turnstile enabled) ──
    const actions = readFileSync(join(repoRoot, "lib", "actions.ts"), "utf8");
    assert(
      actions.includes("isAdmin2faEnabled() && turnstileEnabled") &&
        actions.includes('String(formData.get("cf-turnstile-response")'),
      "loginAdminAction gates Turnstile verification on 2FA+Turnstile flags"
    );
    assert(
      actions.includes("await verifyTurnstileToken(turnstileToken, ip)"),
      "loginAdminAction reuses the submit-flow siteverify helper"
    );

    // ── 2f. At-rest: TOTP secret + recovery codes never stored plaintext ──
    const row = await prisma.admin2FA.findUnique({ where: { subject: "admin" } });
    assert(row !== null, "enrollment row exists");
    assert(
      !row!.totpSecret.includes(enrolled.totpSecretBase32),
      "DB totpSecret is not the plaintext base32 secret"
    );
    assert(row!.totpSecret.startsWith("v2:"), "DB totpSecret is a v2 salted AES-GCM envelope");
    assert(
      row!.totpSecret.split(":").length === 5,
      "v2 envelope carries a per-row kdfSalt (SEC-02)"
    );
    assert(
      !row!.recoveryCodes.includes(enrolled.recoveryCodes[0]),
      "DB recoveryCodes contains digests only, never plaintext codes"
    );

    await prisma.$disconnect();
  } finally {
    delete process.env.ADMIN_2FA_ENABLED;
    rmSync(workDir, { recursive: true, force: true });
  }

  // ── 3. Static ship-state asserts (default-off) ──
  const envExample = readFileSync(join(repoRoot, ".env.example"), "utf8");
  assert(
    /# ADMIN_2FA_ENABLED="false"/.test(envExample),
    ".env.example documents ADMIN_2FA_ENABLED commented-out (default-off)"
  );
  assert(
    envExample.includes("ADMIN_2FA_ENCRYPTION_KEY"),
    ".env.example documents the 2FA encryption key"
  );
  const adminAuth = readFileSync(join(repoRoot, "lib", "admin-auth.ts"), "utf8");
  assert(
    adminAuth.includes("isAdmin2faEnabled()"),
    "loginAdmin consults the env gate before any 2FA work"
  );
  const loginForm = readFileSync(join(repoRoot, "app", "admin", "login", "LoginForm.tsx"), "utf8");
  assert(
    loginForm.includes("twoFactorEnabled && (") &&
      loginForm.includes("totpCode") &&
      loginForm.includes("window.turnstile.render"),
    "LoginForm renders TOTP field + widget only behind the server flag"
  );
  const loginPage = readFileSync(join(repoRoot, "app", "admin", "login", "page.tsx"), "utf8");
  assert(
    loginPage.includes("getAdmin2faStatus()"),
    "login page passes 2FA status via server props"
  );
  const docs = readFileSync(join(repoRoot, "docs", "ops", "admin-2fa.md"), "utf8");
  assert(
    docs.includes("ADMIN_2FA_ENABLED") && docs.includes("admin:2fa-enroll"),
    "owner flip runbook documents the gate + enrollment"
  );

  console.log("OK: admin-2fa (TOTP RFC vectors, env gate on/off, recovery single-use + TOCTOU race, TOTP replay guard + race, at-rest v2 salt, Turnstile wiring)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
