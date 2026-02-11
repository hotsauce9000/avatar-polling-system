-- Enable Supabase Realtime for job stages (progressive delivery).
-- Safe to run multiple times.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'job_stages'
  ) then
    alter publication supabase_realtime add table public.job_stages;
  end if;
end $$;

