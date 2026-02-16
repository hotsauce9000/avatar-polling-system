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
- `REDIS_URL` (optional; only needed if you run the ARQ/Redis worker)

## Optional (Pipeline Providers)

- `OPENAI_API_KEY` enables model-based scoring for stages 1-4.
- `OPENAI_VISION_MODEL` (default: `gpt-4o-mini`)
- `OPENAI_TEXT_MODEL` (default: `gpt-4o-mini`)
- `APIFY_API_KEY` enables stage 0 Apify fetch attempt.
- `APIFY_ACTOR_ID` (default: `apify~web-scraper`)
- `APIFY_MAX_ATTEMPTS` (default: `2`)
- `APIFY_RUN_TIMEOUT_SECONDS` (default: `180`)
- `APIFY_POLL_INTERVAL_SECONDS` (default: `2`)
- `DIRECT_FETCH_MAX_ATTEMPTS` (default: `2`)

## Optional (Worker Startup Recovery)

- `WORKER_RECOVERY_MAX_JOBS` (default: `200`)
- `WORKER_RECOVERY_PROCESSING_STALE_SECONDS` (default: `900`)
- `WORKER_RECOVERY_SEEDING_STALE_SECONDS` (default: `180`)
- `WORKER_CLEANUP_INTERVAL_SECONDS` (default: `3600`)
- `VISION_CACHE_TTL_DAYS` (default: `7`)
- `ANALYTICS_EVENTS_RETENTION_DAYS` (default: `30`)

## Optional (Billing)

- `STRIPE_SECRET_KEY` for checkout session creation.
- `STRIPE_WEBHOOK_SECRET` for webhook signature verification.
- `WEB_APP_BASE_URL` (default: `http://localhost:3000`) for checkout success/cancel URLs.

Notes:

- Stage 0 now attempts Apify first and falls back to direct Amazon HTML fetch.
- If Apify returns HTTP 403, your token likely lacks actor run permissions.
- Stage 0 retries Apify and direct fetches with exponential backoff before failing.
- Stages 1-4 fall back to heuristics if model calls fail.
- Prompt files are SHA-256 hashed at runtime when OpenAI stages run.
  If `jobs.prompt_versions_pinned.prompt_hashes` includes a hash for a prompt path,
  the worker enforces an exact match before using that prompt.

Use `.env.example` as the template.

## Local Dev (Recommended)

Run everything (web + api + worker poller):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

Stop:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-dev.ps1
```

Notes:

- The default worker mode is a DB-backed poller (no Redis required).
- If you later want Redis/ARQ, run the ARQ worker entrypoint instead of the poller.
