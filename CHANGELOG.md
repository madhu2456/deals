# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — 2026-09-04

### Fixed
- **CSP nonce (critical hydration outage)**: the static `script-src 'self'` CSP (no nonce, no `'unsafe-inline'`) blocked Next's inline hydration bootstrap scripts, so hydration never ran (React error #412) and every client component went inert — cookie banner undismissable, submit/admin-login forms dead, Consent Mode v2 default-deny never executed. Fix: per-request nonce minted in `proxy.ts` (`lib/csp.ts` — CSP set on both the forwarded request so Next stamps its bootstrap scripts, and the response so the browser enforces it); root layout reads the nonce via `x-nonce` and stamps the inline consent script; all routes forced dynamic so no static document embeds a stale nonce; nonce'd HTML switched from `public, s-maxage=900` to `private, no-store` (a shared cache replaying one nonce to many users would defeat the nonce). Gate `pnpm test:csp-nonce` proves the round-trip through Next's own nonce parser and fails on the original policy.

### Added
- **F018 — Encrypted SQLite backups + deploy gate**: `scripts/backup-sqlite.sh` (age-encrypted dumps), `scripts/restore-sqlite.sh`, freshness verification (`verify_backup_freshness.sh`), scratch-restore drill (`test:restore-scratch`); `deploy.sh` blocks release when the latest verified backup exceeds the freshness window. Runbook: `docs/ops/backup-restore.md`.
- **F021 — Admin TOTP 2FA (env-gated, default off)**: `lib/totp.ts` (RFC 6238), `lib/admin-2fa.ts` (AES-256-GCM at-rest, scrypt + salt, recovery codes, replay guard), `admin_2fa` migration, enrollment CLI (`pnpm admin:2fa-enroll`), gate `pnpm test:admin-2fa`. `ADMIN_2FA_ENABLED=false` keeps the pre-F021 login flow byte-for-byte. Runbook: `docs/ops/admin-2fa.md`.
- **LICENSE**: MIT (`Madhu Dadi`), replacing the previous all-rights-reserved stance (README License section updated to match).

### Changed
- **WCAG AA contrast fix** (`components/ui/badge.tsx`): Badge `destructive` text `#dc2626` on `bg-destructive/10` over white was 4.13:1 (light) and 3.46:1 (dark) — now `text-red-700` / `dark:text-red-300` (5.54:1 / 6.85:1). An earlier draft of this entry claimed "All other audited UI text pairs already ≥ 4.5:1"; that was false — a follow-up audit found live destructive-text surfaces still failing AA (admin login error banner 4.13:1 light / 3.89:1 dark; submit-form error banners 4.10:1 light and field errors 4.40:1 light; admin deal-form error banner 3.80:1 light; admin broken-deal badge 4.25:1 dark). All were fixed in a follow-up with the same `text-red-700` / `dark:text-red-300` pattern and are now pinned in `pnpm test:contrast`.
- **robots.ts**: removed non-standard `Host` directive and `Crawl-delay: 1` (Bingbot). `/admin` + `/api` stay Disallow; public/deal pages crawlable.
- **Twitter/X card** (`app/layout.tsx`): added `site`/`creator` handle `@madhu245` (owner's X profile); card type, title, description, image already matched OG.
- **Privacy page**: analytics section now describes the actual consent-gated, env-gated GTM setup (no more unconditional "we use Google Analytics" claim); Turnstile disclosure added to §3; date bumped.

## [Unreleased] — 2026-08-19

### Residual wave (C60–C65)
- No new residual-wave files. Leftover cookie strip work (`app/components/CookieConsent.tsx` and related leftover-wave UI) remains in the working tree and is not re-logged as residual.

## [Unreleased] — 2026-08-17

### Added
- **Homepage Cross-Property Promotional Banner (`app/page.tsx`)**:
  - Embedded native promotional callout banner linking to sister property `https://udemyenroller.madhudadi.in/udemycoupons` for free verified Udemy coupons and automated enrollment.
  - Styled with dedicated `GraduationCap` icon badge, "Sister Property" badge, "Updated Hourly" tag, responsive typography, and high-CTR CTA button (`100% Free Udemy Coupons & Promo Codes`).
- **Learning & Education Category Spotlight Banner (`app/categories/[slug]/page.tsx`)**:
  - Injected contextual category spotlight banner on the `learning-and-education` category page guiding users to free verified Udemy coupons and automated claiming on `https://udemyenroller.madhudadi.in/udemycoupons`.

### Changed
- **Footer Cross-Property Anchor Update (`app/components/Footer.tsx`)**:
  - Updated footer external link destination to `https://udemyenroller.madhudadi.in/udemycoupons` with exact anchor text `100% Free Udemy Coupons & Promo Codes` to enhance cross-property topical relevance, crawl equity, and organic user discovery.
