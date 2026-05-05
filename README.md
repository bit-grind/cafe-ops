# Cafe Ops

Internal operations dashboard for The Cafe. This app combines sales reporting, role-based dashboards, supplier bill review, invoice extraction, and an AI-assisted question interface for day-to-day ops work.

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

The app uses Supabase-authenticated users with lightweight role handling:

- `admin`: full access including user management.
- `kitchen`: kitchen costs and supplier-focused views.
- `guest`: read-only access to selected dashboard, ask, and supplier views.

Role and tab resolution lives primarily in `src/lib/adminAuth.ts` and `src/app/api/me/route.ts`.

## Key Data Sources

- `sales_business_day`: daily sales totals and KPI inputs.
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
- Most authenticated client pages call `/api/me` to determine role-specific navigation and redirects.
- The Ask AI route blends multiple data sources: sales totals, product sales, holiday/date parsing, Brisbane weather, Xero bills, and extracted invoice line items.
- Xero bills support line-item drilldown and attachment viewing.

## Recommended Cleanup Direction

The safest structural improvements are:

1. Keep shared clients and env access centralized.
2. Continue extracting helper logic from large route files, especially `src/app/api/ask/route.ts`.
3. Add focused tests around date parsing, role checks, and Xero bill mapping before deeper refactors.
