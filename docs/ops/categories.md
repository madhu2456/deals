# Category indexation policy (thin-hub protection)

## Decision (F-DEAL-009, P3): working as designed — monitor, no code change

The audit finding "thin-category indexation cap" describes intentional
behavior. Categories with fewer than `MIN_CATEGORY_DEALS_FOR_INDEX` approved,
non-expired deals are kept **out of the indexable surface** so Google/AI
crawlers are not pointed at near-empty hubs. This is the same thin-hub
protection used on the portfolio/blog properties. **No code change.**

## Enforcement points (single source of truth: `lib/data.ts`)

| Location | Behavior |
|----------|----------|
| `lib/data.ts` — `MIN_CATEGORY_DEALS_FOR_INDEX = 3` | The cap. One constant. |
| `app/sitemap.ts` | Omits category routes with `< 3` live deals from `sitemap.xml`. |
| `app/categories/[slug]/page.tsx` | `robots: index:false` for categories below the cap (page still reachable and linked — just not indexable). |
| `app/llms.txt/route.ts` | Reports "Categories indexable in search (≥3 deals)" — live count per deployment. |

"Live deal" = `status: APPROVED` and no passed `expiryDate` (matches the
public listing filter).

## Current surface (baseline = fresh `pnpm seed`)

- 12 categories defined (`DEFAULT_CATEGORIES` in `lib/categories.ts`).
- 7 curated deals across 4 categories:

| Category | Seed deals | Indexable (≥ 3)? |
|----------|-----------|------------------|
| ai-and-machine-learning | 3 | yes |
| security-and-privacy | 2 | no |
| productivity | 1 | no |
| health-and-wellness | 1 | no |
| (8 other categories) | 0 | no |

Production may differ (admin-approved submissions + expiry dates). The live
truth is the `llms.txt` line "Categories indexable in search" and
`/sitemap.xml` category entries — check those, not this table.

## Growth path (owner-ops monitor)

A category becomes indexable when it reaches **≥ 3 live deals**; that is the
only action that changes the surface. Suggested cadence: monthly, compare the
`llms.txt` indexable-category count against the previous month. Curation
priority order when adding deals (most growth value first):

1. Categories with 2 live deals (one more deal flips them indexable):
   `security-and-privacy`.
2. Categories with 1 live deal: `productivity`, `health-and-wellness`.
3. Categories with 0 deals: pick from `DEFAULT_CATEGORIES` with the strongest
   real-world offer inventory (e.g. cloud-and-hosting, development-tools,
   learning-and-education).

## Tracking

| Date (UTC) | Indexable categories (from llms.txt) | Live deals | Note |
|------------|--------------------------------------|------------|------|
| 2026-08-14 | 1 (ai-and-machine-learning) | 7 (seed baseline) | F-DEAL-009 closed as designed |
