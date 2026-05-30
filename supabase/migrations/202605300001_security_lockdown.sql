-- Blue Poppy Ops security foundation.
-- Apply this migration before deploying the matching application code.

create table if not exists public.user_role (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('staff', 'kitchen', 'guest')),
  updated_at timestamptz not null default now()
);
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.user_role'::regclass
      and contype = 'c'
  loop
    execute format('alter table public.user_role drop constraint %I', constraint_name);
  end loop;
end
$$;

update public.user_role
set role = case
  when role = 'kitchen' then 'kitchen'
  when role = 'guest' or email = 'guest@thebluepoppy.co' then 'guest'
  else 'staff'
end;

insert into public.user_role (user_id, email, role)
select
  id,
  email,
  case
    when email = 'guest@thebluepoppy.co' or raw_user_meta_data ->> 'role' = 'guest' then 'guest'
    when raw_user_meta_data ->> 'role' = 'kitchen' then 'kitchen'
    else 'staff'
  end
from auth.users
on conflict (user_id) do update
set
  email = excluded.email,
  role = case when user_role.role = 'admin' then 'staff' else user_role.role end,
  updated_at = now();

alter table public.user_role add constraint user_role_role_check check (role in ('staff', 'kitchen', 'guest'));
alter table public.user_role enable row level security;
revoke all on public.user_role from public, anon, authenticated;
grant all on public.user_role to service_role;

create table if not exists public.daily_brief (
  brief_date date primary key,
  generated_at timestamptz not null default now(),
  metrics jsonb not null default '{}'::jsonb,
  narrative text not null default '',
  model text
);
alter table public.daily_brief add column if not exists generation_status text not null default 'completed';
alter table public.daily_brief add column if not exists generation_started_at timestamptz;
alter table public.daily_brief drop constraint if exists daily_brief_generation_status_check;
alter table public.daily_brief add constraint daily_brief_generation_status_check
  check (generation_status in ('generating', 'completed', 'failed'));
alter table public.daily_brief enable row level security;
revoke all on public.daily_brief from public, anon, authenticated;
grant all on public.daily_brief to service_role;

create or replace function public.claim_daily_brief(p_brief_date date)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.daily_brief (
    brief_date, generated_at, metrics, narrative, model, generation_status, generation_started_at
  )
  values (p_brief_date, now(), '{}'::jsonb, '', null, 'generating', now())
  on conflict (brief_date) do update
    set generation_status = 'generating', generation_started_at = now()
    where daily_brief.generation_status = 'failed'
       or (
         daily_brief.generation_status = 'generating'
         and daily_brief.generation_started_at < now() - interval '5 minutes'
       );
  return found;
end;
$$;
revoke all on function public.claim_daily_brief(date) from public, anon, authenticated;
grant execute on function public.claim_daily_brief(date) to service_role;

create table if not exists public.app_rate_limit (
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  primary key (scope, key_hash, window_started_at)
);
alter table public.app_rate_limit enable row level security;
revoke all on public.app_rate_limit from public, anon, authenticated;
grant all on public.app_rate_limit to service_role;

create or replace function public.consume_rate_limit(
  p_scope text,
  p_key_hash text,
  p_window_seconds integer,
  p_limit integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  bucket timestamptz;
  seen integer;
begin
  if p_window_seconds < 10 or p_window_seconds > 3600 or p_limit < 1 or p_limit > 1000 then
    raise exception 'Invalid rate limit configuration';
  end if;
  bucket := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  delete from public.app_rate_limit where window_started_at < now() - interval '2 days';
  insert into public.app_rate_limit (scope, key_hash, window_started_at, request_count)
  values (p_scope, p_key_hash, bucket, 1)
  on conflict (scope, key_hash, window_started_at)
  do update set request_count = app_rate_limit.request_count + 1
  returning request_count into seen;
  return seen <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;

create table if not exists public.import_nonce (
  nonce text primary key,
  created_at timestamptz not null default now()
);
alter table public.import_nonce enable row level security;
revoke all on public.import_nonce from public, anon, authenticated;
grant all on public.import_nonce to service_role;

create or replace function public.consume_import_nonce(p_nonce text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.import_nonce where created_at < now() - interval '1 day';
  insert into public.import_nonce (nonce) values (p_nonce);
  return true;
exception when unique_violation then
  return false;
end;
$$;
revoke all on function public.consume_import_nonce(text) from public, anon, authenticated;
grant execute on function public.consume_import_nonce(text) to service_role;

create or replace function public.replace_sales_by_product(p_business_date date, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted integer;
begin
  delete from public.sales_by_product where business_date = p_business_date;
  insert into public.sales_by_product (
    business_date, position, product, quantity, quantity_pct, sale_amount, sale_pct, cost, gross_profit_pct
  )
  select
    p_business_date,
    x.position,
    x.product,
    x.quantity,
    x.quantity_pct,
    x.sale_amount,
    x.sale_pct,
    x.cost,
    x.gross_profit_pct
  from jsonb_to_recordset(p_rows) as x(
    position integer,
    product text,
    quantity numeric,
    quantity_pct numeric,
    sale_amount numeric,
    sale_pct numeric,
    cost numeric,
    gross_profit_pct numeric
  );
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;
revoke all on function public.replace_sales_by_product(date, jsonb) from public, anon, authenticated;
grant execute on function public.replace_sales_by_product(date, jsonb) to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'sales_business_day',
    'sales_by_product',
    'ask_queries',
    'xero_connection',
    'xero_bill_cache',
    'extraction_runs',
    'extracted_line_items',
    'recipes',
    'recipe_ingredients',
    'kitchen_suppliers'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on public.%I from public, anon, authenticated', table_name);
      execute format('grant all on public.%I to service_role', table_name);
    end if;
  end loop;
end
$$;

do $$
declare
  function_signature text;
begin
  if to_regclass('public.kitchen_supplier_candidates') is not null then
    execute 'revoke all on public.kitchen_supplier_candidates from public, anon, authenticated';
    execute 'grant select on public.kitchen_supplier_candidates to service_role';
  end if;

  for function_signature in
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_top_products'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', function_signature);
    execute format('grant execute on function %s to service_role', function_signature);
  end loop;
end
$$;
