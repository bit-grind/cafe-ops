# Option A SaaS Roadmap

This project is moving toward a hosted, plug-and-play business ops platform. The web app remains the source of truth, while installable experiences such as PWA, iOS, Android, or desktop shells point at the hosted app.

## Product Direction

- Hosted SaaS first, downloadable wrappers second.
- Each customer business is an organization with its own users, roles, integrations, settings, and data.
- Onboarding should configure the business without code changes: create organization, invite users, connect Xero, configure POS/imports, map suppliers, and import history.
- The app should continue to support the existing Blue Poppy deployment while tenant support is introduced incrementally.

## Phase 1: SaaS Foundation

- Add organization and membership tables.
- Resolve the current organization for every authenticated request.
- Return organization context from `/api/me`.
- Move admin/kitchen/guest roles from user-only metadata toward organization memberships.
- Add a first-run onboarding checklist table.
- Keep current single-business behavior as a fallback until all routes are tenant-scoped.

Tenant mode is guarded by `ENABLE_ORGANIZATIONS=true`. Leave it unset or set to
`false` for the existing Blue Poppy deployment.

## Phase 2: Tenant-Scoped Data

Add `organization_id` to business data tables and update reads/writes:

- `sales_business_day`
- `sales_by_product`
- `ask_queries`
- `xero_connection`
- `xero_bill_cache`
- `extracted_line_items`
- `recipes`
- `kitchen_suppliers`
- related extraction/cache tables

Every server route should derive `organization_id` from the authenticated user, never from the client body.

## Phase 3: Self-Serve Onboarding

Create an onboarding flow:

1. Business profile
2. Team invite
3. Xero connection
4. POS/import setup
5. Supplier mapping
6. Historical data import
7. Launch dashboard

The onboarding state should live in the database so support/admin tooling can inspect progress.

## Phase 4: Integration System

Normalize each integration behind the same lifecycle:

- `connect`
- `sync`
- `status`
- `settings`
- `disconnect`
- `last_error`

Start with Xero and CSV imports, then productize Lightspeed once portal automation is reliable enough for customers.

## Phase 5: Installable Experience

- Add PWA manifest and app icons for browser install.
- Generalize the iOS shell from Blue Poppy branding to customer-neutral branding.
- Add Android shell after the hosted onboarding flow is stable.
- Consider desktop packaging only if businesses need local files, printers, or local network integrations.

## Phase 6: Commercial Readiness

- Billing and plans.
- Support/admin console.
- Audit logs.
- Usage limits.
- Error reporting.
- Backups and tenant export.
- Privacy policy and terms.
- Security review of service-role access and RLS policies.
