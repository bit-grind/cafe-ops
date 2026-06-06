# Kounta daily sync

Automatically pulls daily sales from Kounta (Lightspeed Restaurant K-Series) into
Cafe Ops, so `sales_business_day`, `sales_by_hour`, and `sales_by_product` stay current
without anyone running a script.

## How it works

Two scheduled GitHub Actions keep sales current:

- `.github/workflows/kounta-live-sales.yml` starts an hourly browser session
  from **05:08 to 14:08 Brisbane**. Each session polls Kounta every minute for
  up to 70 minutes and stops at 14:20, so a delayed hourly launch does not
  create a data gap.
- `.github/workflows/kounta-sync.yml` also requests a lightweight one-shot live
  refresh every 10 minutes from **05:03 to 14:23 Brisbane** as a backup. Live
  refreshes import the sales summary and Sales Summary by Hour buckets while
  skipping product rows.
- The same workflow runs the full daily sync at **14:30 Brisbane**, right after
  the shop closes. It imports the final sales summary, hourly buckets, and
  product rows.

The full daily sync:

1. Headless-logs into `my.kounta.com` with stored credentials.
2. Exports the **sales summary**, **sales-by-hour**, and **sales-by-product** reports via Kounta's
   report export endpoint:
   `…/report/<report>?export=true&DateFrom=YYYY-MM-DD&DateTo=YYYY-MM-DD&SiteID=0&TerminalID=0`
3. Parses the CSVs and POSTs timestamped HMAC-signed requests to the app's
   import routes (`/api/import-daily`, `/api/import-hours`, `/api/import-products`).
4. Replaces each imported day's hourly/product rows transactionally, so removed
   buckets and products do not leave stale rows behind.
5. Generates the dashboard morning brief as soon as product rows for the newest
   sales day finish importing. Vercel also runs a scheduled brief cron as a
   backup if sales data is inserted another way.

No data is stored on any local machine; everything runs in GitHub's cloud runner.

## One-time setup — add these repo secrets and variable

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
Add each yourself (so the password is never handled by anyone else):

| Secret | Value |
|--------|-------|
| `KOUNTA_USER` | your Kounta login email |
| `KOUNTA_PASS` | your Kounta password |
| `IMPORT_SECRET` | **the same value** as `IMPORT_SECRET` in the Vercel project env (the app uses it to authenticate imports) |

Then open the **Variables** tab in the same screen and add:

| Variable | Value |
|----------|-------|
| `APP_URL` | the deployed Cafe Ops app URL, for example `https://your-app.example.invalid` |

That's it — the daily run starts automatically.

Optional script controls: `SYNC_HOURS=false` skips Sales Summary by Hour imports,
and `SYNC_PRODUCTS=false` skips product rows. Scheduled live refreshes also set
`ALLOW_MISSING_CURRENT_DAY=true`, which exits cleanly when Kounta has not created
today's summary row yet; manual and final daily syncs remain strict.

## Backfill / manual run

**Actions → "Kounta daily sync" → Run workflow.** Leave the date fields blank to
sync today's Brisbane business date, or set `date_from` / `date_to` (YYYY-MM-DD) to backfill a range.
The summary pulls the whole range in one request; products are pulled per day.

For a live summary monitor, run **Actions → "Kounta live sales" → Run workflow**.
It uses the same date inputs, imports hourly buckets, skips product
export/import, and polls once per minute for 60 minutes by default. Set
`monitor_minutes` to `0` for a one-shot summary/hourly refresh.

## Debugging a failed run

The login selectors are the only unverified part. For a failed manual run,
re-run the workflow with `upload_debug_screenshot` enabled. That opt-in uploads
a **`kounta-sync-error` screenshot artifact** for one day. Treat the screenshot
as sensitive because it may contain account content.

## Run locally (optional)

```bash
cd kounta-sync
npm install
npx playwright install chromium
KOUNTA_USER=... KOUNTA_PASS=... IMPORT_SECRET=... APP_URL=https://your-app.example.invalid node sync.mjs
```
