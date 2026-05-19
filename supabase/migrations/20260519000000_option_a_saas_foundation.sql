-- Option A SaaS foundation.
-- This migration adds organization-level tenancy while staying compatible
-- with the current single-business deployment.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'organization_role') then
    create type organization_role as enum ('owner', 'admin', 'kitchen', 'guest');
  end if;
end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  timezone text not null default 'Australia/Brisbane',
  currency_code text not null default 'AUD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role organization_role not null default 'guest',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_members_user_id_idx
  on public.organization_members(user_id);

create table if not exists public.organization_onboarding (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  business_profile_complete boolean not null default false,
  xero_connected boolean not null default false,
  pos_configured boolean not null default false,
  suppliers_mapped boolean not null default false,
  historical_data_imported boolean not null default false,
  launched_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  status text not null default 'not_connected',
  settings jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_onboarding enable row level security;
alter table public.integration_connections enable row level security;

drop policy if exists "members can read their organizations" on public.organizations;
create policy "members can read their organizations"
on public.organizations
for select
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organizations.id
      and m.user_id = auth.uid()
  )
);

drop policy if exists "members can read organization memberships" on public.organization_members;
create policy "members can read organization memberships"
on public.organization_members
for select
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_members.organization_id
      and m.user_id = auth.uid()
  )
);

drop policy if exists "members can read onboarding state" on public.organization_onboarding;
create policy "members can read onboarding state"
on public.organization_onboarding
for select
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_onboarding.organization_id
      and m.user_id = auth.uid()
  )
);

drop policy if exists "members can read integration status" on public.integration_connections;
create policy "members can read integration status"
on public.integration_connections
for select
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = integration_connections.organization_id
      and m.user_id = auth.uid()
  )
);

-- Add organization_id to existing business tables when they exist. The foreign
-- keys are nullable during the transition so the current Blue Poppy deployment
-- can keep running while routes are migrated one by one.
do $$
declare
  table_name text;
  tables text[] := array[
    'sales_business_day',
    'sales_by_product',
    'ask_queries',
    'xero_connection',
    'xero_bill_cache',
    'extracted_line_items',
    'recipes',
    'kitchen_suppliers',
    'kitchen_supplier_candidates'
  ];
begin
  foreach table_name in array tables loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I add column if not exists organization_id uuid references public.organizations(id)', table_name);
      execute format('create index if not exists %I on public.%I(organization_id)', table_name || '_organization_id_idx', table_name);
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.kitchen_suppliers') is not null then
    create unique index if not exists kitchen_suppliers_org_contact_name_uidx
      on public.kitchen_suppliers(organization_id, contact_name)
      where organization_id is not null;
  end if;
end $$;
