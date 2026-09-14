# Admin 2FA (TOTP + Turnstile) — F021

Env-gated, **default-off**. With `ADMIN_2FA_ENABLED` unset or `false`, the
admin login is byte-for-byte the pre-F021 flow: no TOTP field, no Turnstile
widget, no DB read. Nothing rides the deploy until the owner flips it.

## Moving parts

| Piece | Where | Gate |
|---|---|---|
| TOTP (RFC 6238, dep-free) | `lib/totp.ts` | — |
| Enrollment + verify + at-rest crypto | `lib/admin-2fa.ts` | `ADMIN_2FA_ENABLED=true` |
| Login action (2FA + Turnstile) | `lib/actions.ts` `loginAdminAction` | `ADMIN_2FA_ENABLED=true` (+ both Turnstile keys for the widget) |
| Login form (TOTP field + widget) | `app/admin/login/LoginForm.tsx` | flags via server props |
| Enrollment CLI | `pnpm admin:2fa-enroll` | `ADMIN_2FA_ENCRYPTION_KEY` required |
| Storage | `admin_2fa` table (single row, `subject="admin"`) | migration `20260904120000_admin_2fa` |

- **TOTP secret at rest**: AES-256-GCM via `ADMIN_2FA_ENCRYPTION_KEY`
  (scrypt-stretched with a per-row random salt — v2 envelope). Never
  plaintext. Losing the key = re-enroll (the old secret becomes
  undecryptable; recovery codes keep working — they are stored as SHA-256
  digests).
- **Recovery codes**: 8 single-use codes generated at enrollment, shown ONCE,
  stored as SHA-256 digests. A valid TOTP code is always tried first; a
  recovery code is only consumed when TOTP fails (device unavailable).
- **TOTP replay guard (SEC-01)**: each successful TOTP login persists the
  matched timestep (`lastUsedTimestep`); any later code whose timestep ≤ it
  is rejected — the same 6-digit code cannot be reused within the ±1-step
  (~120s) drift window.
- **Turnstile on login**: verified when 2FA is on AND both
  `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` are set (same
  fail-closed parity as `/submit` — `scripts/verify-turnstile-config.ts`).
- **Rate limiting**: unchanged — 5 attempts / 15 min / IP, and TOTP guessing
  rides the same budget.

## Owner flip checklist (dated 2026-09-04)

Run on the server (`/opt/deals`) in order. Total downtime: none. Rollback at
any step: set `ADMIN_2FA_ENABLED=false` + `docker compose up -d`.

1. **Stage Turnstile keys** (if not already set for `/submit`) — both or
   neither (parity is fail-closed):
   ```bash
   # .env
    TURNSTILE_SECRET_KEY="replace-with-cloudflare-secret"          # from Cloudflare dashboard
   NEXT_PUBLIC_TURNSTILE_SITE_KEY="0x..." # widget site key
   ```
   > `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is inlined at image BUILD time — a
   > plain restart will not pick it up. Rebuild: `docker compose build`.
2. **Stage the encryption key** (generate once, store in password manager +
   server `.env`):
   ```bash
   openssl rand -base64 32   # → ADMIN_2FA_ENCRYPTION_KEY
   ```
3. **Deploy the new build** (up-only migration runs in the entrypoint — adds
   the `admin_2fa` table; login still behaves exactly as before):
   ```bash
   cd /opt/deals && ./deploy.sh --update
   ```
4. **Enroll TOTP** (BEFORE flipping the flag — prints the secret + recovery
   codes ONCE):
   ```bash
    ADMIN_2FA_ENCRYPTION_KEY="replace-with-generated-key" \
     docker compose exec -T deals sh -c \
       'DATABASE_URL=file:/app/data/deals.db ADMIN_2FA_ENCRYPTION_KEY="$ADMIN_2FA_ENCRYPTION_KEY" node_modules/.bin/tsx scripts/admin-2fa-enroll.ts'
   ```
   Load the secret into an authenticator app; store the recovery codes.
5. **Verify before flipping**:
   ```bash
   docker compose exec -T deals sh -c \
     'node_modules/.bin/tsx scripts/verify-turnstile-config.ts'   # env parity (in-container)
   pnpm test:admin-2fa                                            # local/CI gate
   ```
6. **Flip** (`.env`): `ADMIN_2FA_ENABLED="true"` → `docker compose up -d`.
7. **Post-flip login test**: open `/admin/login` — expect the 2FA field +
   Turnstile widget, log in with password + 6-digit code, and confirm a
   wrong code is rejected. Record the flip date in this doc.

## Regenerating codes / re-enrolling

Re-running `pnpm admin:2fa-enroll` replaces the secret AND recovery codes
(old codes die instantly). Recovery codes can be checked off via
`remainingRecoveryCodes()` (admin dashboard display) — each code is
single-use; the hash row records `usedAt` on first success.

## Testing

`pnpm test:admin-2fa` — RFC 6238 known-vector, env-gate on/off, recovery-code
single-use, Turnstile-when-enabled wiring, static ship-state asserts.
