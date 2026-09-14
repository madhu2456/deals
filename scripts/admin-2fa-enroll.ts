/**
 * F021 owner-run enrollment: generates (or regenerates) the admin TOTP secret
 * and a fresh set of single-use recovery codes. Prints the enrollment values
 * ONCE (secret + codes) for loading into an authenticator app + password
 * manager — they are never stored in plaintext anywhere.
 *
 * Owner flip sequence: docs/ops/admin-2fa.md
 * Run: pnpm admin:2fa-enroll   (requires ADMIN_2FA_ENCRYPTION_KEY in env)
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");
const PRISMA_BIN = join(repoRoot, "node_modules", ".bin", "prisma");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main(): Promise<void> {
  assert(
    Boolean(process.env.ADMIN_2FA_ENCRYPTION_KEY?.trim()),
    "ADMIN_2FA_ENCRYPTION_KEY must be set (openssl rand -base64 32) — the TOTP secret is stored encrypted at rest"
  );

  // Enrollment writes to the LIVE DB — never to a scratch copy: the whole
  // point is that the enrolled row is the one production reads. Back up first
  // (docs/ops/backup-restore.md) when in doubt.
  if (!process.env.DATABASE_URL) {
    const fallback = join(repoRoot, "prisma", "dev.db");
    if (existsSync(fallback)) process.env.DATABASE_URL = `file:${fallback}`;
  }
  const dbUrl = process.env.DATABASE_URL;
  assert(
    Boolean(dbUrl && dbUrl.startsWith("file:")),
    "DATABASE_URL must be a file: SQLite URL"
  );
  assert(
    process.env.ADMIN_2FA_ENABLED !== "true",
    "Enroll BEFORE flipping ADMIN_2FA_ENABLED=true (login would demand a code that does not exist yet)"
  );

  // Scratch-apply migrations ONLY when the live DB is missing the admin_2fa
  // table (prisma migrate deploy is up-only — safe on the live DB).
  console.log("[enroll] applying pending migrations (migrate deploy)...");
  execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "inherit",
  });

  const { enrollAdmin2FA } = await import("../lib/admin-2fa");
  const { totpSecretBase32, recoveryCodes } = await enrollAdmin2FA();

  const otpauthUrl =
    `otpauth://totp/${encodeURIComponent("Deals Admin")}` +
    `?secret=${totpSecretBase32}&issuer=${encodeURIComponent("deals.madhudadi.in")}` +
    `&algorithm=SHA1&digits=6&period=30`;

  console.log("\n=== Admin 2FA enrollment (shown ONCE — store now) ===\n");
  console.log(`TOTP secret (base32): ${totpSecretBase32}`);
  console.log(`otpauth URL:          ${otpauthUrl}\n`);
  console.log("Recovery codes (single-use, hashed at rest):");
  for (const code of recoveryCodes) console.log(`  ${code}`);
  console.log(
    "\nNext: load the secret into your authenticator app, then follow" +
      " docs/ops/admin-2fa.md (verify + flip ADMIN_2FA_ENABLED=true)."
  );
  console.log(
    `Enrollment idempotency nonce (for logs): ${randomBytes(8).toString("hex")}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
