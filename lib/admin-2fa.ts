/**
 * F021: env-gated TOTP 2FA for the admin login. DEFAULT-OFF — with
 * ADMIN_2FA_ENABLED unset/false, login is EXACTLY the pre-F021 flow and the
 * DB row is never consulted.
 *
 * Storage (single-admin deployment — env ADMIN_USERNAME/ADMIN_PASSWORD, no
 * users table): one Admin2FA row keyed subject="admin".
 *  - totpSecret: base32 secret encrypted at rest with AES-256-GCM via
 *    ADMIN_2FA_ENCRYPTION_KEY (the repo's only other admin secret, ADMIN_SECRET,
 *    signs JWTs and must stay unchanged; a dedicated key keeps 2FA at-rest
 *    protection independent and rotatable). ALWAYS encrypted — enroll throws
 *    when the key is unset, and verify treats an undecryptable row as
 *    no-match; plaintext is never stored (fail-closed).
 *  - recoveryCodes: JSON array of {hash, usedAt} — SHA-256 digests only.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_2FA_SUBJECT,
  generateRecoveryCodes,
  generateTotpSecretBase32,
  hashRecoveryCode,
  base32Decode,
  verifyTotpStep,
} from "@/lib/totp";

/** Env gate read at request time (never module scope — env flips are test-visible). */
export function isAdmin2faEnabled(): boolean {
  return process.env.ADMIN_2FA_ENABLED === "true";
}

/** AES-256-GCM key from ADMIN_2FA_ENCRYPTION_KEY (scrypt-stretched, 32 bytes;
 * the v1 fallback salt is fixed — kept only for decrypting legacy v1 rows).
 * All NEW enrollments encrypt per-row with a random salt (SEC-02). */
function getEncryptionKey(): Buffer {
  const raw = process.env.ADMIN_2FA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ADMIN_2FA_ENCRYPTION_KEY is not configured");
  }
  return scryptSync(raw, "deals-admin-2fa", 32);
}

/** Encrypt-then-MAC: AES-256-GCM, output "v2:<salt-b64>:<iv-b64>:<ct-b64>:<tag-b64>"
 * with a fresh random scrypt salt per enrollment (SEC-02: each row derives
 * the key from its own random salt so no two rows share a derivation). */
function encryptSecret(plaintextBase32: string): string {
  const raw = process.env.ADMIN_2FA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ADMIN_2FA_ENCRYPTION_KEY is not configured");
  }
  const kdfSalt = randomBytes(16);
  const key = scryptSync(raw, kdfSalt, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintextBase32, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${kdfSalt.toString("base64")}:${iv.toString("base64")}:${ct.toString("base64")}:${tag.toString("base64")}`;
}

/** Decrypt a v1 or v2 (salted) envelope; returns null on any tampering /
 * wrong-key failure. */
function decryptSecret(envelope: string): string | null {
  const parts = envelope.split(":");
  try {
    if (parts.length === 4 && parts[0] === "v1") {
      const key = getEncryptionKey();
      const iv = Buffer.from(parts[1], "base64");
      const ct = Buffer.from(parts[2], "base64");
      const tag = Buffer.from(parts[3], "base64");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    }
    if (parts.length === 5 && parts[0] === "v2") {
      if (!process.env.ADMIN_2FA_ENCRYPTION_KEY) return null;
      const kdfSalt = Buffer.from(parts[1], "base64");
      const key = scryptSync(process.env.ADMIN_2FA_ENCRYPTION_KEY, kdfSalt, 32);
      const iv = Buffer.from(parts[2], "base64");
      const ct = Buffer.from(parts[3], "base64");
      const tag = Buffer.from(parts[4], "base64");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    }
    return null;
  } catch {
    return null;
  }
}

export interface RecoveryCodeRow {
  hash: string;
  usedAt: string | null;
}

async function getEnrollmentRow() {
  return prisma.admin2FA.findUnique({ where: { subject: ADMIN_2FA_SUBJECT } });
}

/**
 * (Re)enroll admin 2FA: fresh TOTP secret + fresh single-use recovery codes.
 * Returns the plaintext secret/codes exactly ONCE for the owner to load into
 * an authenticator app + password manager. Idempotent upsert keyed by the
 * singleton subject.
 */
export async function enrollAdmin2FA(): Promise<{
  totpSecretBase32: string;
  recoveryCodes: string[];
}> {
  const totpSecretBase32 = generateTotpSecretBase32();
  const recoveryCodes = generateRecoveryCodes();
  const row = {
    subject: ADMIN_2FA_SUBJECT,
    totpSecret: encryptSecret(totpSecretBase32),
    recoveryCodes: JSON.stringify(
      recoveryCodes.map((code) => ({ hash: hashRecoveryCode(code), usedAt: null }))
    ),
  };
  await prisma.admin2FA.upsert({
    where: { subject: ADMIN_2FA_SUBJECT },
    create: { ...row, lastUsedTimestep: null },
    update: {
      totpSecret: row.totpSecret,
      recoveryCodes: row.recoveryCodes,
      lastUsedTimestep: null, // fresh secret invalidates old codes AND replay memory
      enrolledAt: new Date(),
    },
  });
  return { totpSecretBase32, recoveryCodes };
}

/**
 * Verify the second factor when 2FA is enabled. TOTP first (with ±1 step
 * drift); a code only ever consumed as a fallback is treated as a recovery
 * code and marked used on first success (single-use).
 * SEC-01 replay guard: the matched TOTP timestep is persisted as a
 * high-water mark; any code whose timestep ≤ lastUsedTimestep is rejected,
 * so the same code cannot be reused within the ~120s drift window. The
 * high-water mark advances via a conditional write, so concurrent racing
 * verifies cannot both consume one timestep.
 * SEC-04: recovery consumption is a conditional write (only lands while the
 * stored array is byte-identical to the read), so two racing verifies cannot
 * both consume one code.
 * Injected verifyTotpFn seam is test-only — production always uses lib/totp.
 */
export async function verifyAdminSecondFactor(
  code: string,
  verifyTotpFn: (code: string, secret: Buffer) => number | null = (c, secret) =>
    verifyTotpStep(c, secret)
): Promise<boolean> {
  const trimmed = code.trim();
  if (!trimmed) return false;

  const row = await getEnrollmentRow();
  if (!row) return false; // 2FA enabled but not enrolled → no code can pass

  // TOTP path (decryption failure = wrong key → treated as no-match, never throws)
  const secretBase32 = decryptSecret(row.totpSecret);
  if (secretBase32 !== null) {
    const secret = base32Decode(secretBase32);
    if (secret !== null) {
      const matchedStep = verifyTotpFn(trimmed, secret);
      if (
        matchedStep !== null &&
        (row.lastUsedTimestep === null || matchedStep > row.lastUsedTimestep)
      ) {
        // Conditional write: only lands while lastUsedTimestep is unchanged
        // since the read — a racing replay of the same step matches 0 rows.
        const consumed = await prisma.admin2FA.updateMany({
          where: {
            subject: ADMIN_2FA_SUBJECT,
            lastUsedTimestep: row.lastUsedTimestep,
          },
          data: { lastUsedTimestep: matchedStep },
        });
        if (consumed.count === 1) return true;
        return false; // a concurrent verify advanced the mark first → replay
      }
    }
  }

  // Recovery path: single-use, first matching unused digest wins
  const storedCodes = row.recoveryCodes || "[]";
  const codes: RecoveryCodeRow[] = JSON.parse(storedCodes);
  const candidateHash = hashRecoveryCode(trimmed);
  const matchIndex = codes.findIndex(
    (c) => c && !c.usedAt && safeHexEqual(c.hash, candidateHash)
  );
  if (matchIndex === -1) return false;

  // SEC-04 atomic consumption: the update only lands while the stored array
  // is still byte-identical to the read — the loser of a race matches 0 rows.
  const marked = codes.map((c, i) =>
    i === matchIndex ? { ...c, usedAt: new Date().toISOString() } : c
  );
  const consumed = await prisma.admin2FA.updateMany({
    where: { subject: ADMIN_2FA_SUBJECT, recoveryCodes: storedCodes },
    data: { recoveryCodes: JSON.stringify(marked) },
  });
  return consumed.count === 1;
}

function safeHexEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** Plaintext recovery codes remaining (admin dashboard visibility). */
export async function remainingRecoveryCodes(): Promise<number> {
  const row = await getEnrollmentRow();
  if (!row) return 0;
  const codes: RecoveryCodeRow[] = JSON.parse(row.recoveryCodes || "[]");
  return codes.filter((c) => c && !c.usedAt).length;
}

/**
 * Enrollment status for the login page props: with 2FA off the client renders
 * the EXACT pre-F021 form (no extra fields, no widget).
 */
export function getAdmin2faStatus() {
  const enabled = isAdmin2faEnabled();
  return {
    enabled,
    // Widget only when 2FA is on AND the Turnstile parity holds (F-DEAL-003)
    turnstile: enabled &&
      Boolean(process.env.TURNSTILE_SECRET_KEY?.trim()) &&
      Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()),
  };
}
