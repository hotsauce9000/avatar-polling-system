# Environment Variables

This repo uses 2 local env files:

- Root `.env` is for the Python API + worker.
- `apps/web/.env.local` is for the Next.js frontend.

Never commit real secrets. These files are gitignored.

## Required (Web)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_BASE_URL` (local dev: `http://localhost:8000`)

## Required (API/Worker)

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (used for auth validation)
- `SUPABASE_SERVICE_ROLE_KEY` (used for server-side DB writes)
- `REDIS_URL` (only needed once we wire background jobs)

Use `.env.example` as the template.

