# Log retention — F055

**Scope**: `deals.madhudadi.in` (this repo). F055 covers all logging sinks
estate-wide; this is the DE-portion. Verified 2026-09-26 against the working
tree at `remediation/v8.7-r2`.

## Result

> 180 days retained on every logging sink this app owns.

| Sink | Where | Retention | Evidence |
| --- | --- | --- | --- |
| Container stdout/stderr (`deals`) | Docker `json-file` driver | 20m x 350 files = **7,000 MB** | `docker inspect deals-app` → `LogConfig json-file max-size=20m max-file=350` |
| Container build/runtime metadata (image layers, `docker history`) | Local image store | **unbounded** (deleted only by explicit prune / image removal) | `docker image inspect deals-app` → `Created` timestamp |
| Host `deploy.sh` install log | `~/.deploy-history` (host) | **unbounded** — append-only, grows ~1 line per deploy | `deploy.sh` writes `date +%F %T ...` on every `--update` |
| Nginx access/error for `deals.madhudadi.in` | host, `/var/log/nginx/` | **unbounded** — managed by the host's logrotate, not by this app | `deploy.sh --install-nginx` drops `nginx/deals.conf`; nginx itself writes `access.log` / `error.log` |
| App error lines (DB failure paths in `lib/sitemap-chunks.ts`, `app/sitemap.ts`, `app/feed.xml/route.ts`, `lib/rate-limit.ts`, `lib/admin-auth.ts`, `lib/actions.ts`, `app/error.tsx`) | container stdout → same `json-file` sink | as above | each failure logs with a `[tag]` prefix |

## Why the caps, and where the 180 days comes from

The Docker `json-file` default is **no rotation at all** — container logs grow
until they fill the droplet disk, and on this single-droplet host a full disk
is an outage, not a nuisance. Rotation caps disk usage, but the caps must be
sized so that the retained window still covers the audit's **>= 180 days**:

```
per-container capacity = max-size x max-file = 20 MB x 350 = 7,000 MB
measured volume        = 0 B of request logging
```

The 20m x 350 pair is the same pin the rest of the estate uses
(`Adticks/docker-compose.prod.yml`, all 7 services), so one arithmetic note
covers the estate rather than one per repo. Adticks measured a structured-JSON
planning rate of 34.6 MB/day and documented 7,000 / 34.6 = **202 days**.

**This app logs strictly less than that**, so the Adticks figure is the
conservative bound here:

- Next.js request logging is off by default in production `next start`
  (`NEXT_PUBLIC_*` untouched, no `logging` config in `next.config.ts`).
  Verified empirically on 2026-09-26 against the hardened production
  container: **300 page views moved the `json-file` log by 0 bytes** — the
  only bytes present are the 33 startup lines (migration output, Prisma
  PRAGMA output, `Ready in 0ms`), ~1 KB total.
- The app's `console.*` calls are all failure paths (DB down, rate-limit
  misconfiguration, admin auth failure). Even a continuous error loop that
  logs one line/second at ~400 B/line — the estate planning rate with a 60%
  margin over the measured ~250 B Adticks record — lands at 34.6 MB/day.

So retained history is **>= 202 days** at the estate planning rate and
unbounded-in-practice at the measured 0 B/request rate, because the only way
the counter moves is an actual error. 7,000 MB is a **ceiling, not an
allocation**: disk is consumed only as logs accrue, so at the measured rate
well under 7 MB will ever be written.

### Sizing table

| `max-file` | Retained capacity | Days @ 34.6 MB/day |
| --- | --- | --- |
| 300 | 6,000 MB | 173 (< 180 — **do not use**) |
| 350 | 7,000 MB | 202 |
| 400 | 8,000 MB | 231 |

## Sinks this app does NOT own

These exist on the estate but not in this repo, so no config here can change
them. They are recorded so the audit row is not read as an unexamined gap:

- **Host systemd journal** (`/var/log/journal`) for the Docker daemon and
  nginx processes — owner-ops host concern.
- **rclone offsite backup copies** (`../backups/`, `F032`) — retention
  governed by `scripts/backup-sqlite.sh` `RETENTION_DAYS` (default 14), not
  by logging.
- **GTM analytics / Cloudflare edge logs** — third-party retention; GTM data
  is not a security log sink for this app (no PII goes to it beyond the
  standard client-side payload).

## Verification

```bash
pnpm test:log-retention    # scripts/verify-log-retention.ts
```

The gate asserts, against the file on disk:

1. the single `deals` service pins `logging.driver: json-file`;
2. `max-size` and `max-file` are present and numeric;
3. `max-size * max-file >= 6300 MB`, i.e. the capacity that yields 180 days at
   the 35 MB/day planning bound (a deliberately round number below the
   measured 7,000 MB);
4. `SECURITY_OPT`/`cap_drop`/`read_only` remain present (a regression here is
   a different finding, F010 — asserted here so the two stay in lockstep);
5. this file still documents the retention arithmetic (grep for the
   `>= 180` claim and the measured 0 B evidence).
