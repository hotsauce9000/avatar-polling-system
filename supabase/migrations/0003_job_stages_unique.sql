-- Ensure a job cannot have duplicate stage rows.
-- This helps worker idempotency and prevents accidental double-inserts.

-- Deduplicate if any duplicates exist (keep earliest created_at).
with ranked as (
  select
    id,
    row_number() over (
      partition by job_id, stage_number
      order by created_at asc
    ) as rn
  from public.job_stages
)
delete from public.job_stages s
using ranked r
where s.id = r.id
  and r.rn > 1;

create unique index if not exists idx_job_stages_job_id_stage_number_unique
  on public.job_stages (job_id, stage_number);

