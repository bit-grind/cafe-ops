# Security Operations

## Deploying the lockdown migration

1. Apply `supabase/migrations/202605300001_security_lockdown.sql`.
2. Confirm the migration created `user_role`, `daily_brief`, `app_rate_limit`,
   and `import_nonce`, plus their service-role-only RPC functions.
3. Deploy the matching application build only after the migration succeeds.
4. Trigger a one-day manual Kounta sync and confirm both imports succeed.
5. Confirm guest accounts can open `/ops` and sales-only Ask AI, but receive
   `403` responses for bills, supplier data, recipes, food costs, and briefs.

The migration enables RLS and revokes direct browser-role access to operational
tables. Server routes use the Supabase service-role key after authenticating and
authorizing each caller.

## Secrets

Rotate these after applying the migration:

| Secret | Callers |
| --- | --- |
| `CRON_SECRET` | Vercel cron and any manual cron caller |
| `IMPORT_SECRET` | Vercel app and GitHub Actions Kounta sync |
| `RATE_LIMIT_KEY` | Vercel app only |
| `XERO_CLIENT_SECRET` | Vercel app and Xero OAuth app |

Set `APP_ORIGIN=https://ops.thebluepoppy.co` in production so OAuth redirects
never derive their destination from an inbound request host.

Keep `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, Xero secrets, and Kounta
credentials server-side. Never prefix them with `NEXT_PUBLIC_`.

## Edge protection

In the Vercel Firewall dashboard:

1. Enable the managed OWASP ruleset if it is available on your plan.
2. Add rate limits for `/api/ask`, `/api/import-daily`, `/api/import-products`,
   and `/api/xero/callback`.
3. Restrict the import routes to expected GitHub Actions traffic where practical;
   retain the application-level HMAC check regardless.
4. Enable Attack Challenge Mode during an active abuse event.

The app also enforces per-user Ask AI rate limits, signed imports with replay
protection, payload caps, tool-call budgets, response-size budgets, and strict
guest data boundaries.

## Routine checks

- Review weekly Dependabot updates for npm packages and GitHub Actions.
- Keep GitHub Actions pinned to commit SHAs.
- Run `npm audit --omit=dev --audit-level=high` before each release.
- Run `npm --prefix kounta-sync audit --omit=dev --audit-level=high`.
- Only enable the Kounta failure screenshot artifact for a manual debugging run.
