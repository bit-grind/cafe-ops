# AGENTS.md

Operating manual for any AI coding agent (Codex, Claude, etc.) working in this
repo. The goal is that a model arriving cold — with no memory of the previous
session or which model wrote the last change — can make a change without
breaking the non-obvious rules below, and prove it.

`README.md` is the human-facing overview (areas, stack, env vars). `SECURITY.md`
is the security rollout checklist. This file is the part that isn't obvious from
reading the code in five minutes.

## Verify loop (definition of done)

A change is not done until all three pass:

```bash
npm run lint        # eslint
npm test            # vitest run  (currently 37 tests)
npx tsc --noEmit    # typecheck (next build also type-checks, but this is faster)
```

`npm run build` runs the full Next.js production build and is the final gate CI
uses. Run it before declaring a risky change safe. Never hand verification back
to the user with "you should check X" when one of these commands could have
checked it.

## Invariants — break these and prod breaks quietly

### Timezone
- **Business days are Brisbane** (Australia/Brisbane, UTC+10, no DST). Derive
  "today" with `Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' })`,
  never `new Date().toISOString()`.
- **Week boundaries are Sydney Mon–Sun**, via `src/lib/dates.ts` (`mondayOf`,
  `isoDate`) — those read the instant back as Sydney calendar fields.
- **Vercel runs in UTC** (region `syd1`). All date math must be explicit: use
  the Brisbane helpers, or anchor at UTC midnight (`+ 'T00:00:00Z'`) and use
  `getUTCDate`/`setUTCDate`. Host-local `new Date('YYYY-MM-DD')` parsing is a
  bug waiting to happen.

### Authorization (`src/lib/adminAuth.ts`, `src/lib/serverAuth.ts`)
- **Reads** are session-gated: `getSessionUser(req)` resolves identity from the
  `Authorization` bearer. Roles come from the server-controlled `public.user_role`
  table — **never from `user_metadata`** (it is user-writable). Unknown users and
  lookup failures get **least privilege** (guest) on purpose; preserve that.
- `adminClient()` uses the **service_role key and bypasses RLS**. It is
  server-only — never import it into client code or leak its results unguarded.
- **External imports** (Kounta sync) are not session-gated. They use
  `verifySignedImport` — HMAC-SHA256 over `timestamp.nonce.body`, ±5 min window,
  headers `x-import-timestamp/-nonce/-signature` keyed by `IMPORT_SECRET` — plus
  `consumeImportNonce` for single-use replay protection.
- **Cron** routes use `checkCronAuth` (`CRON_SECRET`). **Webhooks** (Deputy/Zapier)
  use a header secret with a timing-safe compare. Secrets go in **headers, never
  query strings** (query strings land in request logs).
- All secret comparisons are constant-time (`secureCompare` / `timingSafeEqual`).
  Don't introduce `===` on a secret.

### Database (`supabase/migrations/`)
- Migrations are timestamped SQL files. Add a new one; don't edit applied ones.
- Tables: `enable row level security`, `revoke all ... from public, anon,
  authenticated`, and access only via `adminClient()` (service_role).
- RPCs (`create function`): `security invoker`, `set search_path = ''`, and
  `grant execute ... to service_role` only. Match this on every new function.

### Input validation
- Import payloads are validated in `src/lib/importValidation.ts` (finite-number
  coercion, row caps, dedup, calendar-date round-trip). Routes cap raw body size
  and return **400 only for input errors, 500 otherwise** — don't echo internal
  error text to clients.

## Data flow (how sales/brief get populated)
- `kounta-sync/sync.mjs` is an **external** GitHub-Actions job: headless Playwright
  logs into Kounta, exports CSVs, and POSTs HMAC-signed payloads to
  `/api/import-daily`, `/api/import-hours`, `/api/import-products`. The app does
  not pull from Kounta itself.
- The **daily brief is cron-owned** (`vercel.json` → `/api/brief/cron` at 04:30).
  Generation is gated by the `claim_daily_brief` RPC, which has a 5-minute
  stale-claim recovery. A dashboard **GET must never trigger paid AI work** —
  reads only return already-generated briefs. `generateBriefIfLatestSalesDay`
  also fires after a product import.

## Intentional decisions (don't "fix" these without asking)
- **Live takings stays pinned to today.** The 10-min poll on `/ops` refreshes the
  current Brisbane day regardless of which date is selected. This is deliberate
  (commit "Keep live takings on today").
- **Deputy birthdays are computed live** from employee `DateOfBirth` each request,
  never persisted. The `deputy_calendar_events` table only stores Zapier-pushed
  leave/unavailable/available/shift.
- **Deputy availability** (available vs unavailable) is inferred best-effort from
  Deputy's fields (`src/lib/deputyCalendar.ts`). Verify against a real
  `EmployeeAvailability` payload before changing the inference — changing it blind
  risks mislabeling.

## Conventions
- TypeScript everywhere; pure logic lives in `src/lib/*` with colocated
  `*.test.ts`. **Add/extend a vitest test when you add or change a pure function**
  (parsing, normalization, metrics, permissions).
- Match the surrounding style: small named helpers, explicit Brisbane/UTC date
  handling, no new dependencies for things the stdlib/Intl already do.
- Keep secrets out of source; new config goes through env vars (see README).

## Gotchas
- Concurrent editing sessions can leave macOS/cloud-sync conflict copies named
  `* 2.ts`, `* 2.json`, etc. in the tree. They are junk duplicates (usually an
  older version) — delete them; they are not tracked and not meant to be kept.
