-- Staff onboarding course.
--
-- Trainees are new hires without ops logins. Each gets a single unguessable
-- invite link; we store only the SHA-256 of that token, so a database read
-- never yields a working link. Progress is server-owned: the browser is a
-- cache, not the record.

create table if not exists public.training_trainee (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  -- SHA-256 (hex) of the invite token. The raw token is shown to the manager
  -- once, at creation, and is unrecoverable afterwards.
  token_hash text not null unique,
  -- Last 4 characters of the token, so the roster can tell two links apart
  -- without storing anything that helps forge one.
  token_hint text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  last_seen_at timestamptz,
  signed_off_at timestamptz,
  signed_off_name text,
  -- Which version of the course was actually signed off.
  content_version text
);

alter table public.training_trainee enable row level security;
revoke all on public.training_trainee from public, anon, authenticated;
grant all on public.training_trainee to service_role;

create index if not exists training_trainee_status_idx
  on public.training_trainee (status, created_at desc);

create table if not exists public.training_module_progress (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.training_trainee(id) on delete cascade,
  -- Module ids live in src/lib/training/content.ts, not in a lookup table:
  -- the course is versioned with the code.
  module_id text not null,
  best_score integer not null,
  total integer not null,
  attempts integer not null default 1,
  first_completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trainee_id, module_id)
);

alter table public.training_module_progress enable row level security;
revoke all on public.training_module_progress from public, anon, authenticated;
grant all on public.training_module_progress to service_role;

create index if not exists training_module_progress_trainee_idx
  on public.training_module_progress (trainee_id);
