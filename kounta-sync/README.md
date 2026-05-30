# Kounta daily sync

Automatically pulls daily sales from Kounta (Lightspeed Restaurant K-Series) into
Blue Poppy Ops, so `sales_business_day` and `sales_by_product` stay current
without anyone running a script.

## How it works

A scheduled GitHub Action (`.github/workflows/kounta-sync.yml`) runs at **05:00
Brisbane** daily. It:

1. Headless-logs into `my.kounta.com` with stored credentials.
2. Exports the **sales summary** and **sales-by-product** reports via Kounta's
   report export endpoint:
   `…/report/<report>?export=true&DateFrom=YYYY-MM-DD&DateTo=YYYY-MM-DD&SiteID=0&TerminalID=0`
3. Parses the CSVs and POSTs them to the app's import routes
   (`/api/import-daily`, `/api/import-products`), which upsert into Supabase.

No data is stored on any local machine; everything runs in GitHub's cloud runner.

## One-time setup — add these repo secrets

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
Add each yourself (so the password is never handled by anyone else):

| Secret | Value |
|--------|-------|
| `KOUNTA_USER` | your Kounta login email |
| `KOUNTA_PASS` | your Kounta password |
| `IMPORT_SECRET` | **the same value** as `IMPORT_SECRET` in the Vercel project env (the app uses it to authenticate imports) |

That's it — the nightly run starts automatically.

## Backfill / manual run

**Actions → "Kounta daily sync" → Run workflow.** Leave the date fields blank to
sync yesterday, or set `date_from` / `date_to` (YYYY-MM-DD) to backfill a range.
The summary pulls the whole range in one request; products are pulled per day.

## If the first run fails

The login selectors are the only unverified part. On failure the job uploads a
**`kounta-sync-error` screenshot artifact** (Actions run → Artifacts) showing
where it stopped — usually a one-line selector tweak in `sync.mjs`'s `login()`.

## Run locally (optional)

```bash
cd kounta-sync
npm install
npx playwright install chromium
KOUNTA_USER=… KOUNTA_PASS=… IMPORT_SECRET=… APP_URL=https://ops.thebluepoppy.co node sync.mjs
```
