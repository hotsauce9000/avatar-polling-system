-- Avatar Polling System (v5.1 MVP)
-- Core tables + basic RLS policy templates.
--
-- Notes:
-- - This is written for Supabase Postgres where `auth.users` exists.
-- - RLS policies use `(select auth.uid())` wrapper for initPlan caching.
-- - Some details are intentionally left as TODO for iteration.

-- Enable UUID generation (available by default on Supabase, but safe to ensure).
create extension if not exists "pgcrypto";

-- 1) User profile (extends auth.users)
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  credit_balance integer not null default 54,
  daily_credit_used integer not null default 0,
  daily_credit_reset_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_profiles_id on public.user_profiles (id);

-- Create profile row on signup.
create or replace function public.create_user_profile()
returns trigger as $$
begin
  insert into public.user_profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_user_profile();

alter table public.user_profiles enable row level security;
drop policy if exists "Users see own profile" on public.user_profiles;
create policy "Users see own profile" on public.user_profiles
  for all
  using ((select auth.uid()) = id);

-- 2) Jobs
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'created',
  asin_a text not null,
  asin_b text not null,
  reserved_credits integer not null default 0,
  prompt_versions_pinned jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_jobs_user_id on public.jobs (user_id);
create index if not exists idx_jobs_created_at on public.jobs (created_at desc);

alter table public.jobs enable row level security;
drop policy if exists "Users see own jobs" on public.jobs;
create policy "Users see own jobs" on public.jobs
  for all
  using ((select auth.uid()) = user_id);

-- 3) Job stages (progressive delivery)
create table if not exists public.job_stages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  stage_number smallint not null,
  status text not null default 'pending',
  output jsonb not null default '{}'::jsonb,
  credits_used integer not null default 0,
  provider_used text null,
  prompt_version_id uuid null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_stages_job_id on public.job_stages (job_id);
create index if not exists idx_job_stages_created_at on public.job_stages (created_at desc);

alter table public.job_stages enable row level security;
drop policy if exists "Users see own job stages" on public.job_stages;
create policy "Users see own job stages" on public.job_stages
  for all
  using (
    exists (
      select 1
      from public.jobs j
      where j.id = job_stages.job_id
        and j.user_id = (select auth.uid())
    )
  );

-- 4) Prompt versions
create table if not exists public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  version text not null,
  content text not null,
  content_hash text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_prompt_versions_type_version
  on public.prompt_versions (type, version);
create index if not exists idx_prompt_versions_active
  on public.prompt_versions (type, is_active);

-- Prompt versions are admin-managed; lock them down by default.
alter table public.prompt_versions enable row level security;

-- 5) Vision cache (Postgres-only, single tier)
create table if not exists public.vision_cache (
  id uuid primary key default gen_random_uuid(),
  evaluation_type text not null,
  image_content_hash text not null,
  prompt_version_id uuid not null references public.prompt_versions(id),
  cached_output jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vision_cache_lookup
  on public.vision_cache (evaluation_type, image_content_hash, prompt_version_id);
create index if not exists idx_vision_cache_created_at
  on public.vision_cache (created_at desc);

alter table public.vision_cache enable row level security;

-- 6) Credit operations (idempotency)
create table if not exists public.credit_operations (
  idempotency_key uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_type text not null, -- 'reserve' | 'refund' | 'settle' | 'purchase'
  amount integer not null,
  job_id uuid null references public.jobs(id) on delete set null,
  stripe_session_id text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_operations_user_created
  on public.credit_operations (user_id, created_at desc);

alter table public.credit_operations enable row level security;
drop policy if exists "Users see own credit ops" on public.credit_operations;
create policy "Users see own credit ops" on public.credit_operations
  for select
  using ((select auth.uid()) = user_id);

-- 7) Experiments
create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asin_a text not null,
  asin_b text not null,
  job_id uuid not null references public.jobs(id) on delete cascade,
  scores_snapshot jsonb not null,
  change_tags text[] not null default '{}'::text[],
  notes text null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_experiments_user_created
  on public.experiments (user_id, created_at desc);

alter table public.experiments enable row level security;
drop policy if exists "Users see own experiments" on public.experiments;
create policy "Users see own experiments" on public.experiments
  for all
  using ((select auth.uid()) = user_id);

