# RLS Notes

This project relies on Supabase Row Level Security (RLS) for user data isolation.

Guiding rules (from `PROJECT_PLAN_v5.0_HYBRID.md`):

- Policies should use `(select auth.uid())` (wrapped) to enable initPlan caching.
- Add B-tree indexes on `user_id` columns for RLS performance.

Tables intended to be user-scoped:

- `public.user_profiles`
- `public.jobs`
- `public.job_stages` (policy via join to `jobs.user_id`)
- `public.experiments`
- `public.credit_operations` (select-only for users)

Admin-managed tables (lock down by default):

- `public.prompt_versions`
- `public.vision_cache`

