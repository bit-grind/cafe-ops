# Cafe Ops

Internal operations dashboard for cafe teams. This app combines sales reporting, role-based dashboards, supplier bill review, invoice extraction, and an AI-assisted question interface for day-to-day ops work.

## Main Areas

- `/ops`: sales dashboard for daily, weekly, and monthly performance.
- `/ops/kitchen`: supplier-cost dashboard for kitchen-focused users.
- `/ops/bills`: Xero bills and extracted invoice line items.
- `/ops/ask`: AI assistant for sales, products, bills, and supplier questions.
- `/ops/admin`: user management for admins.

## Stack

- Next.js App Router
- React 19
- TypeScript
- Supabase Auth and database
- OpenAI chat completions API
- Xero OAuth and bills APIs

## Roles

The app uses Supabase-authenticated users with server-controlled roles:

- `staff`: normal operations access.
- `kitchen`: kitchen costs and supplier-focused views.
- `guest`: read-only sales dashboard and sales-only Ask AI access.

The configured `ADMIN_EMAIL` receives admin access independently of its stored
role. Stored roles live in `public.user_role`; user-editable auth metadata is
never trusted for authorization.

## Key Data Sources

- `sales_business_day`: daily sales totals and KPI inputs.
- `sales_by_hour`: hourly sales buckets from Kounta's Sales Summary by Hour report.
- `sales_by_product`: product-level sales results.
- `ask_queries`: logged Ask AI prompts and responses.
- `xero_connection`: stored Xero OAuth connection metadata.
- `extracted_line_items` and related extraction tables: product-level purchase data parsed from supplier PDFs.

## Environment Variables

At minimum, local development expects:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
ADMIN_EMAIL=...
APP_ORIGIN=https://your-app.example.invalid
NEXT_PUBLIC_GUEST_LOGIN_EMAIL=...
CRON_SECRET=...
IMPORT_SECRET=...
RATE_LIMIT_KEY=...
XERO_CLIENT_ID=...
XERO_CLIENT_SECRET=...
XERO_REDIRECT_URI=...
```

## Local Development

Install dependencies and run the app:

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Operational Notes

- The login page authenticates directly against Supabase.
- App branding can be supplied outside GitHub via server env or Supabase Storage; the committed defaults stay generic.
- Most authenticated client pages call `/api/me` to determine role-specific navigation and redirects.
- The Ask AI route blends multiple data sources: sales totals, product sales, holiday/date parsing, Brisbane weather, Xero bills, and extracted invoice line items.
- Xero bills support line-item drilldown and attachment viewing.
- Guest users cannot read supplier costs, Xero bills, extracted invoice lines, recipes, or generated daily briefs.
- Kounta imports require timestamped HMAC signatures and replay protection.

## Security Rollout

Apply `supabase/migrations/202605300001_security_lockdown.sql` before deploying
the matching app build. Then rotate `CRON_SECRET`, `IMPORT_SECRET`,
`RATE_LIMIT_KEY`, and the Xero client secret, and update each caller at the same
time. See `SECURITY.md` for the complete checklist.

CI runs linting, tests, a production dependency audit, and a full Next.js build.
