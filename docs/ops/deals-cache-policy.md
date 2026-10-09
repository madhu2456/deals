# Deals homepage cache policy — F059

**Scope**: `deals.madhudadi.in` (this repo), the public marketing routes:
`/`, `/deals`, `/categories`, `/categories/:slug*`, `/deals/:slug*`.
Decision recorded 2026-09-30 against `remediation/v8.7-r2`.

## Result — decision D.5

> **INTENTIONAL. The `private, no-cache, no-store, max-age=0,
> must-revalidate` header on the public homepage STAYS.** No code change.

The portfolio pattern `public, max-age=0, s-maxage=3600,
stale-while-revalidate=86400` is **not** applicable to these routes and was
deliberately not applied.

## Why it is intentional

The header is not an accident of a shared-cache tuning pass. It was set
deliberately in commit **6c38047 (2026-09-17) — "fix(csp): per-request script
nonce"** — the commit that introduced the CSP nonce, and the rationale is
carried inline in `next.config.ts`. Two independent forces converge on the
same answer here, and both are load-bearing:

**1. Every document on these routes carries a per-request CSP nonce.**
`proxy.ts` mints a fresh 128-bit nonce per request (`nextWithCsp`), sets it on
the forwarded request so Next stamps it onto its inline bootstrap scripts, and
on the response so the browser enforces the policy. A nonce is a
single-use bearer token: if any shared cache (CDN included) stores and replays
a nonce'd document, every visitor for the cache lifetime is served the *same*
nonce. An attacker who fetches the page once can read that nonce out of the
cached HTML and reuse it against their own injection payload — the XSS
protection the nonce exists to provide is gone. This is why the policy is
`private` (browser cache only, never a shared cache) and not merely `public`
with a short `s-maxage`. Confirmed locally: two consecutive requests return
different nonces.

**2. These routes are genuinely dynamic — per-request SQLite/Prisma reads.**
Every page in scope declares `export const dynamic = "force-dynamic"` (see
`app/page.tsx`, `app/deals/page.tsx`, `app/categories/page.tsx`) with the
source comment *"Runtime data from SQLite — do not prerender at Docker build
time."* The home page itself runs four parallel queries per request:
featured deals, latest deals, categories, and popular brand names. This is a
money property: the document contains prices, coupon codes, expiry states and
the "N verified deals" count. `s-maxage`/`stale-while-revalidate` would serve
an expired or re-priced offer for up to an hour, and `stale-while-revalidate`
would serve it for up to a day. That is a correctness defect on a page whose
entire value is being current, and it is worse than the cost of the queries.

## What was checked before deciding

| Check | Result |
| --- | --- |
| `pnpm build` then `next start`, `curl -D - http://localhost:3137/` | `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` — confirmed |
| Is the header a regression? | **No.** `git log -S` on `next.config.ts` shows the string entered in 6c38047 and has not moved since |
| Does the public home emit `Set-Cookie`? | **No.** Consent state is `localStorage` (`app/components/CookieConsent.tsx`), the admin cookie is the only server-issued cookie and is scoped to `/admin`. So the F007/F028 inverted invariant (never `public` cache-control **and** `Set-Cookie`) holds trivially — the header creates no session-leak exposure |
| Are these routes prerendered/ISR? | No — `force-dynamic` on all five, confirmed in the build output (all listed `ƒ Dynamic`) |
| Would `public, s-maxage` break the nonce? | Yes — see reason 1 above |

## What would have to change to revisit this

If the home page ever stops reading the database per request **and** the CSP
nonce stops being per-request, the route would become cacheable and the
portfolio pattern would become correct. Both conditions, not either. The
gate for that change is a build output showing the route as `○ Static` /
`● SSG` rather than `ƒ Dynamic`.

## Accepted cost

The home is re-fetched on every navigation by returning visitors (no
shared-cache reuse) and the per-request queries are re-run. This is the
deliberate price of (a) never serving a stale price and (b) never letting an
intermediary replay a CSP nonce. It is bounded and measured, unlike the
failure modes it prevents.
