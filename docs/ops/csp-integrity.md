# CSP nonce & script integrity — F031

**Scope**: `deals.madhudadi.in` (this repo). F031 covers all 6 estate hosts; this
is the DE-portion. Verified 2026-09-26 against the working tree at
`remediation/v8.7-r2`.

## Result

`script-src` is nonce-based and carries **no `'unsafe-inline'`** and no
`'unsafe-eval'`. There are **no external pinned script assets** in this app, so
there is no `integrity=` target to carry — the two allowlisted external origins
are runtime-injected, not static `<script src>` references.

## The policy

One source of truth: `lib/csp.ts` builds the string, `proxy.ts` mints a fresh
128-bit nonce per request and sets the policy on both the forwarded request
headers (Next reads the nonce back to stamp its own bootstrap scripts) and the
response headers (the browser enforces it). `next.config.ts` sets **no** CSP —
a static header there would duplicate the nonce policy and re-break hydration
(see `scripts/verify-csp-nonce.ts` for the regression gate, `pnpm test:csp-nonce`).

As emitted (nonce elided for length):

```text
default-src 'self';
script-src 'self' 'nonce-<22-char base64>' https://www.googletagmanager.com https://challenges.cloudflare.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self';
connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://challenges.cloudflare.com;
frame-src 'self' https://www.googletagmanager.com https://challenges.cloudflare.com;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests;
report-uri /api/csp-report;
report-to csp-endpoint
```

### Why `'strict-dynamic'` is deliberately absent

Browsers ignore host sources in `script-src` when `'strict-dynamic'` is also
present. Adding it would silently drop the GTM and Turnstile host allowlist
(the inline bootstrap then propagates trust, which is not this site's model —
it runs the *minimum* script set). The nonce + host allowlist combination keeps
both active.

### Why `style-src` keeps `'unsafe-inline'`

`style-src` and `script-src` are different findings: F031's predicate is on
`script-src`. React inline `style` attributes and Next's injected style tags
need the style escape hatch, and styles cannot execute script, so the risk is
CSS injection / exfiltration only — bounded by `img-src` and the rest of the
policy. Recorded as a deliberate, reviewed exception rather than an oversight.
If it is ever removed, `app/layout.tsx`'s inline consent script and the
shadcn/Tailwind runtime styles must be re-tested in both themes.

## External pinned assets: none

| Asset | How it loads | `integrity=` needed? |
|---|---|---|
| GTM (`googletagmanager.com`) | inline nonce'd bootstrap in `app/components/GoogleTagManager.tsx` creates the `<script>` at runtime, **only after cookie consent is accepted** | No — there is no static `src`, and GTM is a mutable runtime container (a pinned hash would break on every container publish) |
| Turnstile (`challenges.cloudflare.com`) | Cloudflare's own widget bootstrap, allowed via `frame-src`/`script-src` host allowlist | No — same reasoning; the widget is served by Cloudflare and versioned dynamically |
| Consent Mode v2 default | inline `CONSENT_DEFAULT_SCRIPT` in `app/layout.tsx`, stamped with the per-request nonce | N/A — first-party inline, nonce-protected |

`grep` over `app/**` and `components/**` returns **0** matches for
`<script ... src=`, and 0 for `integrity=` — i.e. no external pinned asset
exists that would need one. The CSP host allowlist is the control for the two
third-party origins; adding a static external script would require an
`integrity=` hash alongside it.

## Reproducing

```bash
pnpm test:csp-nonce        # regression gate: nonce round-trips through Next's own parser
```

`pnpm start` then `curl -sD- http://localhost:3000/ | grep -i content-security-policy`
returns the live header with a fresh nonce per request.

## Owner-ops / follow-up

- **F031 is the DE-portion.** The other 5 estate hosts (portfolio, blog,
  enroller, televault, adticks) are covered by their own audits; the estate-wide
  predicate requires the same `script-src` shape and an integrity check on any
  host that *does* pin an external script statically.
- If a static external `<script src>` is ever introduced here (self-hosted
  vendor bundle is fine and preferred), ship it with `integrity="sha384-..."`
  and add a gate to `scripts/verify-csp-nonce.ts` so the hash cannot be dropped.
