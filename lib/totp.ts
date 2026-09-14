/**
 * Minimal RFC 6238 TOTP + RFC 4648 base32 + recovery-code helpers for admin
 * 2FA (F021). Dependency-free by design: node:crypto only — no otplib. All
 * primitives are pure functions of their arguments so scripts can unit-test
 * them against published RFC vectors without a Next runtime.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/** TOTP defaults (RFC 6238 §5.1 recommends SHA-1 + 30s + 6 digits). */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** ± step-window skew tolerance (RFC 6238 §5.2): 1 covers clock drift of one step each side. */
export const TOTP_WINDOW = 1;
/** Single-admin deployment (env ADMIN_USERNAME/ADMIN_PASSWORD — no users table):
 * a well-known singleton id is the 2FA row key. */
export const ADMIN_2FA_SUBJECT = "admin";

/**
 * RFC 4648 base32 decode (A–Z, 2–7; padding tolerated). Returns null for
 * inputs containing characters outside the base32 alphabet.
 */
export function base32Decode(input: string): Buffer | null {
  const clean = input.toUpperCase().replace(/=+$/g, "");
  if (!clean.length) return Buffer.alloc(0);
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(ch);
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Raw RFC 4226 HMAC-based one-time-password step shared by generate/verify. */
function hotp(secret: Buffer, counter: number, digits: number): string {
  const buf = Buffer.alloc(8);
  // Two's-complement 64-bit counter (>>> 0 wraps negative/oversized steps —
  // defensive for any caller-supplied time value).
  buf.writeUInt32BE(Math.floor(counter / 0x100000000) >>> 0, 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", secret).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, "0");
}

/**
 * TOTP code for a secret at a given time (ms epoch). Exported for tests and
 * enrollment UX (the server never trusts client-side generation).
 */
export function generateTotp(
  secret: Buffer,
  timeMs: number = Date.now(),
  stepSeconds: number = TOTP_STEP_SECONDS,
  digits: number = TOTP_DIGITS
): string {
  return hotp(secret, Math.floor(timeMs / 1000 / stepSeconds), digits);
}

/**
 * RFC 6238 verify with ±1 step drift tolerance, returning the MATCHED
 * timestep (SEC-01: callers persist it as a replay guard — any later code
 * whose timestep ≤ the stored one is a replay and must be rejected). Null
 * when no window slot matches. Constant-time digest compare; all parameters
 * compared in one pass so neither match position nor length leaks timing.
 * Codes shorter than the digit count never verify (padded comparison).
 */
export function verifyTotpStep(
  code: string,
  secret: Buffer,
  timeMs: number = Date.now(),
  stepSeconds: number = TOTP_STEP_SECONDS,
  digits: number = TOTP_DIGITS,
  window: number = TOTP_WINDOW
): number | null {
  const candidate = code.replace(/\s+/g, "").trim();
  if (!/^\d+$/.test(candidate) || candidate.length !== digits) return null;
  const step = Math.floor(timeMs / 1000 / stepSeconds);
  const ha = createHash("sha256").update(candidate, "utf8").digest();
  for (let i = -window; i <= window; i += 1) {
    const expected = hotp(secret, step + i, digits);
    const hb = createHash("sha256").update(expected, "utf8").digest();
    if (timingSafeEqual(ha, hb)) return step + i;
  }
  return null;
}

/**
 * RFC 6238 verify with ±1 step drift tolerance (boolean wrapper over
 * verifyTotpStep — the matched timestep itself is the caller's concern only
 * for the replay guard).
 */
export function verifyTotp(
  code: string,
  secret: Buffer,
  timeMs: number = Date.now(),
  stepSeconds: number = TOTP_STEP_SECONDS,
  digits: number = TOTP_DIGITS,
  window: number = TOTP_WINDOW
): boolean {
  return verifyTotpStep(code, secret, timeMs, stepSeconds, digits, window) !== null;
}

/**
 * Random 160-bit (20-byte) secret, base32-encoded — the authenticator-app
 * enrollment format (Google Authenticator, 1Password, Aegis, etc.). Encoding
 * guarantees the secret is storable/transmittable without padding issues.
 */
export function generateTotpSecretBase32(): string {
  return base32Encode(randomBytes(20));
}

/** RFC 4648 base32 encode (lowercase input normalized). */
export function base32Encode(buf: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

/** Code entropy: 16 chars across [A-Z2-7] minus separators ≈ 80 bits. */
export const RECOVERY_CODE_LENGTH = 16;
/** Dated, reviewable default (eight single-use codes at enrollment). */
export const RECOVERY_CODE_COUNT = 8;

/** N single-use recovery codes, "XXXX-XXXX-XXXX-XXXX" shape (uppercase base32). */
export function generateRecoveryCodes(
  count: number = RECOVERY_CODE_COUNT
): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const raw = base32Encode(randomBytes(10)).slice(0, RECOVERY_CODE_LENGTH);
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`);
  }
  return codes;
}

/** SHA-256 at-rest digest of a recovery code (stored, never the code itself). */
export function hashRecoveryCode(code: string): string {
  const normalized = code.replace(/\s+/g, "").trim().toUpperCase();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/** Constant-time recovery-code check against its SHA-256 digest. */
export function verifyRecoveryCode(code: string, storedHash: string): boolean {
  const normalized = code.replace(/\s+/g, "").trim().toUpperCase();
  if (!/^[A-Z2-9-]+$/.test(normalized)) return false;
  return safeHexEqual(hashRecoveryCode(normalized), storedHash);
}

function safeHexEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}
