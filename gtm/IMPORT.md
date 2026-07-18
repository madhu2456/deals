# Import GTM container — complete measurement

**File:** `GTM-PT2ZHD3W-complete-measurement.json`  
**Container:** `GTM-PT2ZHD3W` (deals.madhudadi.in)  
**GA4:** `G-THQ1ZPJ4B7`

## Import steps

1. Open [Google Tag Manager](https://tagmanager.google.com) → container **deals.madhudadi.in** (`GTM-PT2ZHD3W`).
2. **Admin** (top) → **Import Container**.
3. Choose file: `gtm/GTM-PT2ZHD3W-complete-measurement.json`.
4. **Workspace:** choose existing Default (or create “Complete measurement”).
5. **Import option:**
   - Prefer **Merge** → **Overwrite conflicting tags, triggers, and variables**  
     (keeps anything extra you added; replaces your current GA4 Config with the full set).
   - Or **Overwrite** if you want a clean slate for this container.
6. **Confirm** → review the summary → **Import**.
7. **Preview** on `https://deals.madhudadi.in` → verify tags fire.
8. **Submit** → **Publish**.

## What you get

### Tags
| Tag | When it fires |
|-----|----------------|
| **GA4 - Configuration** | All Pages (`page_view`) |
| **GA4 - Event - page_view (History Change)** | Soft navigations (App Router) |
| **GA4 - Event - get_deal** | User clicks Get Deal |
| **GA4 - Event - copy_coupon** | User copies a coupon code |
| **GA4 - Event - submit_deal** | Community deal submitted |
| **GA4 - Event - search** | Site search (when dataLayer pushes `search`) |
| **GA4 - Event - select_content** | Content selection events |
| **GA4 - Event - outbound_click (fallback)** | External link clicks |

### Variables
- `GA4 Measurement ID` = `G-THQ1ZPJ4B7`
- `js - page_title` = `document.title` (custom JS; GTM import does not accept built-in `PAGE_TITLE`)
- Data Layer vars: `deal_id`, `deal_slug`, `deal_title`, `brand_name`, `deal_url`, `coupon_code`, `link_url`, `category_id`, `search_term`, `results_count`, `content_*`

### Site code (already in this repo)
The app pushes:

```js
dataLayer.push({ event: 'get_deal', deal_id, deal_slug, deal_title, brand_name, deal_url, ... })
dataLayer.push({ event: 'copy_coupon', coupon_code, ... })
dataLayer.push({ event: 'submit_deal', category_id })
```

## GA4 recommended events (Admin → Events)

Mark as **conversions** (optional):
- `get_deal`
- `submit_deal`
- `copy_coupon`

## Avoid double counting

This container owns GA4. The site loads **GTM only** (direct `gtag.js` was removed from the layout).  
Do **not** add another GA4 Config for `G-THQ1ZPJ4B7` outside this setup.

## Verify after publish

1. GTM **Preview** → open deals site.
2. Click **Get Deal** on a deal → tag `GA4 - Event - get_deal` should fire.
3. GA4 → **Realtime** → Events → see `get_deal`, `page_view`.
