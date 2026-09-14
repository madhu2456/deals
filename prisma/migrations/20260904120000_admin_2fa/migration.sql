-- CreateTable (F021): TOTP 2FA enrollment for the admin login.
-- Single-admin deployment (env credentials — no users table), so the row is
-- a well-known-key singleton: subject="admin".
-- totpSecret stores the base32 secret encrypted-at-rest via ADMIN_2FA_ENCRYPTION_KEY
-- (AES-256-GCM, per-row random scrypt salt — lib/admin-2fa.ts) — never plaintext.
-- lastUsedTimestep (SEC-01): last successfully-used TOTP timestep — replay guard
-- rejects any code whose timestep ≤ it (blocks same-code reuse within drift).
-- recoveryCodes is a JSON array of {hash, usedAt} (SHA-256 digests only).
CREATE TABLE "admin_2fa" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "totpSecret" TEXT NOT NULL,
    "lastUsedTimestep" INTEGER,
    "recoveryCodes" TEXT NOT NULL DEFAULT '[]',
    "enrolledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    CONSTRAINT "admin_2fa_subject_key" UNIQUE ("subject")
);
