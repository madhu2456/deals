# DNS records (deals.madhudadi.in)

DNS is owned and operated by the domain owner at the DNS provider — this repo
cannot change it. This file records the audit finding (F-DEAL-008), the exact
records to apply, and the monitoring steps that gate enforcement.

## Finding F-DEAL-008 (P3): DMARC is `p=none`

| Record | Type | Value | Status |
|--------|------|-------|--------|
| `_dmarc.madhudadi.in` | TXT | `v=DMARC1; p=none;` | audit (2026-08-14) — publish-only, no enforcement |

`p=none` tells receiving mail servers to accept all mail and only send
aggregate reports to `rua`. It protects nothing; it only measures.

## Target records (apply via the DNS provider)

### Step 1 — enforce quarantine (apply now)

```text
_dmarc.madhudadi.in  TXT  "v=DMARC1; p=quarantine; rua=mailto:hello@madhudadi.in; ruf=mailto:hello@madhudadi.in; fo=1"
```

- `p=quarantine` — mail that fails DMARC goes to spam instead of being dropped.
- `rua` — aggregate XML reports (who is sending as the domain, aligned or not).
- `ruf` + `fo=1` — forensic per-message failure reports (only senders who
  request them get these; keep `fo=1` so failures are reported).

### Step 2 — monitor ≥ 14 days, then `p=reject`

Before enforcing, confirm the domain has working SPF and DKIM (DMARC fails
mail with neither aligned):

```bash
dig +short TXT madhudadi.in            # SPF record must exist and end in -all or ~all
dig +short TXT _dmarc.madhudadi.in     # current DMARC record
```

Watch the `rua` mailbox for **14+ consecutive days of clean aggregate
reports** — no legitimate senders failing SPF/DKIM alignment. Only then:

```text
_dmarc.madhudadi.in  TXT  "v=DMARC1; p=reject; rua=mailto:hello@madhudadi.in; ruf=mailto:hello@madhudadi.in; fo=1"
```

(Optional later hardening: `sp=reject` for subdomains once no subdomain mail
exists.) If the domain has no mail-sending at all, quarantine → reject can be
fast-tracked, but the 14-day window is the safe default.

## Verification

```bash
dig +short TXT _dmarc.madhudadi.in
# expect: "v=DMARC1; p=quarantine; rua=mailto:hello@madhudadi.in; ruf=mailto:hello@madhudadi.in; fo=1"
```

## Owner-ops checklist

| Date (UTC) | Action | Result |
|------------|--------|--------|
| 2026-08-14 | Filed F-DEAL-008 — apply `p=quarantine` record | pending |
|  | After 14 days clean aggregates → `p=reject` |  |
|  | Confirm with `dig +short TXT _dmarc.madhudadi.in` |  |
