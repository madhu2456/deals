# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
