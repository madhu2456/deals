# Deals by Madhu Dadi

**Verified deals, coupons, and discounts for everyone.**

Live product of [Madhu Dadi](https://madhudadi.in) — built for real savings on software, SaaS tools, cloud, design apps, learning platforms, and more.

> **Domain:** [deals.madhudadi.in](https://deals.madhudadi.in)  
> **Repo:** [github.com/madhu2456/deals](https://github.com/madhu2456/deals)

---

## What is Deals?

Deals is a curated directory of **verified discounts and coupon codes**. Community submissions are reviewed before they go public. Search by brand, filter by category, copy codes, and claim offers in one click.

| Feature | Details |
|--------|---------|
| Public directory | Browse, search, and filter deals |
| Deal pages | Coupon copy, claim tracking, related offers |
| Submit flow | Community submissions → admin review |
| Admin dashboard | Approve, reject, edit, feature, delete |
| SEO / AEO / GEO | Sitemap, robots, JSON-LD, FAQ, `llms.txt` |
| Deploy | Docker + Nginx + GitHub Actions → DigitalOcean |

---

## Built by Madhu Dadi

Explore more projects and writing:

| Link | What you’ll find |
|------|------------------|
| **[madhudadi.in](https://madhudadi.in)** | Portfolio — products, experiments, and case studies |
| **[madhudadi.in/blog](https://madhudadi.in/blog)** | Blog — engineering, growth, and build-in-public notes |
| **[udemyenroller.madhudadi.in](https://udemyenroller.madhudadi.in)** | Udemy Course Enroller — automate free-course enrollment |
| **[adticks.com](https://adticks.com)** | Adticks — SEO & GEO so sites get found by Google *and* AI search |

**SEO & GEO for this project** is improved with [Adticks](https://adticks.com).

---

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui**
- **Prisma 5** + **SQLite** (swap to PostgreSQL when you outgrow it)
- **JWT** admin auth (`jose`)
- **Docker Compose** production image + Nginx reverse proxy

---

## Local development

```bash
# Clone
git clone https://github.com/madhu2456/deals.git
cd deals

# Install
pnpm install

# Env
cp .env.example .env
# edit ADMIN_* and NEXT_PUBLIC_SITE_URL if needed

# Database
pnpm exec prisma migrate dev
pnpm seed          # categories + 7 curated deals (create-if-missing, idempotent)

# Dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) for local dev. Admin: `/admin`.

**Production ports on the shared server:** host `3002` (Nginx → deals). Host `3000` is used by [madhudadi.in](https://madhudadi.in).

Default admin (change before production):

- Username: `admin`
- Password: set in `.env` (`ADMIN_PASSWORD`)

---

## Production deploy (DigitalOcean)

### 1. Bootstrap the droplet

```bash
# As root on a fresh Ubuntu server
export REPO_URL="https://github.com/madhu2456/deals.git"
export DOMAIN="deals.madhudadi.in"

git clone "$REPO_URL" /opt/deals
cd /opt/deals
chmod +x deploy.sh docker/entrypoint.sh
./deploy.sh
```

This installs Docker, creates `.env`, builds the app, starts Compose, and configures Nginx.

### 2. SSL (after DNS A record points to the droplet)

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d deals.madhudadi.in -d www.deals.madhudadi.in
```

> Note: DNS must exist first — A record (apex → droplet IP) and CNAME www → deals.madhudadi.in (Proxied) — before certbot runs; it must see both names to issue the www certificate.

### 3. GitHub Actions CI/CD

Add **repository secrets**:

| Secret | Example |
|--------|---------|
| `DEPLOY_HOST` | Droplet IP or `deals.madhudadi.in` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | Private SSH key for that user |

Optional: `DEPLOY_PATH` (default `/opt/deals`), `DEPLOY_PORT` (SSH).

Push to `main` → workflow SSHs in and runs `./deploy.sh --update`.

### Manual update

```bash
cd /opt/deals && ./deploy.sh --update
```

---

## Project structure

```text
app/                 App Router pages (public + admin + API)
components/ui/       shadcn primitives
lib/                 Data, auth, SEO JSON-LD, helpers
prisma/              Schema + migrations + seed
docker/              Container entrypoint
deploy.sh            Droplet bootstrap / update
.github/workflows/   CI/CD deploy to DigitalOcean
public/              Icons, web manifest
```

---

## Environment variables

See [`.env.example`](./.env.example). Important:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | SQLite path (Docker: `file:/app/data/deals.db`) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Admin login |
| `ADMIN_SECRET` | JWT signing secret (≥ 32 chars) |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for sitemap, OG, schema |

### Cloudflare Turnstile (production, optional)

Bot protection for `/submit`. Keys are env-only — never commit real values.

1. Cloudflare dashboard → **Turnstile** → **Add site** (`deals.madhudadi.in`).
2. Set **both** variables in the server `.env`:
   - `TURNSTILE_SECRET_KEY` — server-side secret (verify token)
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — public site key (widget)
3. Deploy. Parity is fail-closed: with both keys set the server verifies the
   token and the form renders the widget; with neither set the form falls back
   to honeypot + timing checks; setting **exactly one** key is a
   misconfiguration and production rejects submissions until the second key is
   added (`lib/actions.ts`). `pnpm test:turnstile-config` enforces the parity
   rule in CI.

---

## SEO / AEO / GEO

- Dynamic `sitemap.xml` + AI-friendly `robots.txt`
- JSON-LD: Organization, WebSite, FAQ, Product/Offer, Breadcrumbs, ItemList
- Deal JSON-LD prices derive only from parseable currency-prefixed `discountedPrice` values; FREE_TIER deals emit price `"0"`; unparseable prices are omitted rather than estimated.
- Answer-first homepage copy + FAQ for answer engines
- The [`/llms.txt`](https://deals.madhudadi.in/llms.txt) route (`app/llms.txt/route.ts`) for LLM context
- `/search?q=…` is a thin 307 redirect to `/deals?q=…` (kept for legacy bookmarks;
  `noindex`, not in the sitemap — nothing in the UI links to it)

Visibility work is supported by **[Adticks](https://adticks.com)** (SEO & GEO).

---

## More from Madhu

- Portfolio → [madhudadi.in](https://madhudadi.in)
- Blog → [madhudadi.in/blog](https://madhudadi.in/blog)
- Udemy Enroller → [udemyenroller.madhudadi.in](https://udemyenroller.madhudadi.in)
- Adticks (SEO & GEO) → [adticks.com](https://adticks.com)

---

## License

Private / all rights reserved unless otherwise noted.  
© Madhu Dadi — [madhudadi.in](https://madhudadi.in)
