# Supabase Storage Notes

MVP expectations (from `PROJECT_PLAN_v5.0_HYBRID.md`):

- Buckets are private by default.
- Client access uses signed URLs (1h expiry).
- `storage.objects` access is restricted to the job owner via RLS.

TODO:

- Define bucket names (example: `listing-images`, `experiment-archives`).
- Add storage RLS policies once bucket/object naming is final.

