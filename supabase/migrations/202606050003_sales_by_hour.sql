create table if not exists public.sales_by_hour (
  business_date date not null,
  hour integer not null check (hour >= 0 and hour <= 23),
  gross_sales numeric not null default 0,
  net_sales numeric not null default 0,
  tax numeric not null default 0,
  order_count integer not null default 0,
  aov numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (business_date, hour)
);

alter table public.sales_by_hour enable row level security;
revoke all on public.sales_by_hour from public, anon, authenticated;
grant all on public.sales_by_hour to service_role;

create or replace function public.replace_sales_by_hour(p_business_date date, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted integer;
begin
  delete from public.sales_by_hour where business_date = p_business_date;
  insert into public.sales_by_hour (
    business_date, hour, gross_sales, net_sales, tax, order_count, aov, updated_at
  )
  select
    p_business_date,
    x.hour,
    x.gross_sales,
    x.net_sales,
    x.tax,
    x.order_count,
    x.aov,
    now()
  from jsonb_to_recordset(p_rows) as x(
    hour integer,
    gross_sales numeric,
    net_sales numeric,
    tax numeric,
    order_count integer,
    aov numeric
  );
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.replace_sales_by_hour(date, jsonb) from public, anon, authenticated;
grant execute on function public.replace_sales_by_hour(date, jsonb) to service_role;
