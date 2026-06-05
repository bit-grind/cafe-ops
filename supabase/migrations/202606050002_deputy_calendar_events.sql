create table if not exists public.deputy_calendar_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('deputy', 'zapier')),
  external_id text not null,
  employee_id integer,
  employee_name text not null,
  type text not null check (type in ('leave', 'unavailable', 'available', 'shift')),
  status text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  date_start date not null,
  date_end date not null,
  comment text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id, type)
);

alter table public.deputy_calendar_events enable row level security;

create index if not exists deputy_calendar_events_range_idx
  on public.deputy_calendar_events (date_start, date_end);

create index if not exists deputy_calendar_events_employee_idx
  on public.deputy_calendar_events (employee_name);
