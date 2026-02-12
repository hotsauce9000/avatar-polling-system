-- Stripe purchase idempotency + analytics event table.

-- Safety: deduplicate historical stripe_session_id collisions before applying uniqueness.
with ranked as (
  select
    idempotency_key,
    row_number() over (
      partition by stripe_session_id
      order by created_at asc, idempotency_key asc
    ) as rn
  from public.credit_operations
  where stripe_session_id is not null
)
delete from public.credit_operations c
using ranked r
where c.idempotency_key = r.idempotency_key
  and r.rn > 1;

create unique index if not exists idx_credit_operations_stripe_session_unique
  on public.credit_operations (stripe_session_id)
  where stripe_session_id is not null;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid null references public.jobs(id) on delete set null,
  event_name text not null,
  stage_number smallint null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_events_user_created
  on public.analytics_events (user_id, created_at desc);

create index if not exists idx_analytics_events_event_created
  on public.analytics_events (event_name, created_at desc);

create index if not exists idx_analytics_events_job_created
  on public.analytics_events (job_id, created_at desc);

alter table public.analytics_events enable row level security;
drop policy if exists "Users see own analytics events" on public.analytics_events;
create policy "Users see own analytics events" on public.analytics_events
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own analytics events" on public.analytics_events;
create policy "Users insert own analytics events" on public.analytics_events
  for insert
  with check (
    (select auth.uid()) = user_id
    and (
      job_id is null
      or exists (
        select 1
        from public.jobs j
        where j.id = job_id
          and j.user_id = (select auth.uid())
      )
    )
  );

create or replace function public.apply_credit_purchase(
  p_user_id uuid,
  p_amount integer,
  p_idempotency_key uuid,
  p_stripe_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
  updated_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('applied', false, 'reason', 'unauthorized');
  end if;

  if p_user_id is null then
    return jsonb_build_object('applied', false, 'reason', 'missing_user_id');
  end if;

  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('applied', false, 'reason', 'invalid_amount');
  end if;

  if p_idempotency_key is null then
    return jsonb_build_object('applied', false, 'reason', 'missing_idempotency_key');
  end if;

  if p_stripe_session_id is null or length(trim(p_stripe_session_id)) = 0 then
    return jsonb_build_object('applied', false, 'reason', 'missing_stripe_session_id');
  end if;

  insert into public.user_profiles (id)
  values (p_user_id)
  on conflict (id) do nothing;

  insert into public.credit_operations (
    idempotency_key,
    user_id,
    operation_type,
    amount,
    stripe_session_id
  )
  values (
    p_idempotency_key,
    p_user_id,
    'purchase',
    p_amount,
    p_stripe_session_id
  )
  on conflict (idempotency_key) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    if exists (
      select 1
      from public.credit_operations
      where stripe_session_id = p_stripe_session_id
    ) then
      return jsonb_build_object('applied', false, 'reason', 'stripe_session_already_processed');
    end if;
    return jsonb_build_object('applied', false, 'reason', 'idempotency_key_already_processed');
  end if;

  update public.user_profiles
  set credit_balance = credit_balance + p_amount,
      updated_at = now()
  where id = p_user_id;
  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    delete from public.credit_operations where idempotency_key = p_idempotency_key;
    return jsonb_build_object('applied', false, 'reason', 'user_profile_not_found');
  end if;

  return jsonb_build_object('applied', true, 'reason', 'applied');

exception
  when unique_violation then
    return jsonb_build_object('applied', false, 'reason', 'stripe_session_already_processed');
end;
$$;

revoke all on function public.apply_credit_purchase(uuid, integer, uuid, text) from public;
revoke all on function public.apply_credit_purchase(uuid, integer, uuid, text) from anon;
revoke all on function public.apply_credit_purchase(uuid, integer, uuid, text) from authenticated;
grant execute on function public.apply_credit_purchase(uuid, integer, uuid, text) to service_role;
