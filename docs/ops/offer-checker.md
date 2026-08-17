# Offer-validity checker (deals.madhudadi.in)

Operational runbook for `scripts/check-offer-validity.ts` (F231 / F-DEAL-001 / D012-A).

## What it does

REPORT-ONLY tool run daily at 04:00 UTC. It never auto-applies status changes,
never auto-approves, and never auto-publishes. It prints a JSON report and
exits `0` (nothing to do) or `1` (findings needing admin review):

- **Dated deals** (have `expiryDate`): compared against the clock; past-expiry
  deals are flagged for the admin to mark `status=EXPIRED` via the admin UI.
- **Perpetual deals** (no `expiryDate`): the offer URL is probed (HEAD→GET,
  10 s timeout, max 3 redirects, no credentials). 4xx/5xx and redirect loops
  are "broken — review"; Cloudflare/bot 403 is "inconclusive" (site up, bot
  blocked) and does NOT fail the run.

This is the guard behind the JSON-LD policy: perpetual deals emit
`schema.org/InStock` without `validThrough` (they have no end date) — the
checker + admin review is what keeps that InStock honest (F234).

## Install (host install = owner-ops)

The cron entry is installed on the production host by the owner/operator:

```bash
cd /opt/deals && ./deploy.sh --install-offer-checker-cron
```

Idempotent: re-runs replace the marked `deals-offer-check` entry instead of
duplicating it. Installed entry (daily 04:00 UTC, container exec — the image
ships `node_modules` + `scripts`, and the container has the live DB at
`/app/data/deals.db` plus outbound network for URL probes, so it works for
both named-volume and bind-mount deployments):

```cron
0 4 * * * cd /opt/deals && docker compose exec -T deals sh -c 'cd /app && ./node_modules/.bin/tsx scripts/check-offer-validity.ts' >>/var/log/deals-offer-check.log 2>&1; rc=$?; if [ ${rc} -ne 0 ]; then echo "deals offer-check found findings (exit ${rc}) — see /var/log/deals-offer-check.log"; fi
```

- **Log:** `/var/log/deals-offer-check.log` (JSON report each run).
- **Alerting (MAILTO):** findings exit non-zero, which appends the alert echo
  to the log AND produces cron output → cron mails it to `MAILTO`. Default:
  crontab owner (the deploy user). Override by re-running the installer with
  `OFFER_CHECK_MAILTO=you@example.com ./deploy.sh --install-offer-checker-cron`.

## Admin SLA on findings

- **Expired dated deals:** mark `status=EXPIRED` in the admin dashboard. SLA:
  within 5 working days of the finding (expired deals are already hidden from
  public listings by the expiry filter; EXPIRED status is lifecycle hygiene).
- **Broken perpetual URLs:** review the URL (offer may be dead), fix or mark
  EXPIRED. SLA: within 5 working days.
- **Inconclusive (403/timeout/network):** no action needed — the merchant
  blocks bots; site is likely up.

## Manual run

```bash
cd /opt/deals && docker compose exec deals sh -c 'cd /app && ./node_modules/.bin/tsx scripts/check-offer-validity.ts'
# local dev: pnpm check:offers
```

## Run log (owner-ops)

| Date (UTC) | Run OK? | Dated expired | Broken perpetual | Inconclusive | Action taken |
|------------|---------|---------------|-------------------|--------------|--------------|
|            |         |               |                   |              |              |
