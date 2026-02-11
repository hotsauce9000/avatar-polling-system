# Avatar Polling System

Build spec: `PROJECT_PLAN_v5.0_HYBRID.md`

Current plan: `docs/plans/2026-02-10-feat-amazon-avatar-listing-optimizer-mvp-plan.md`

Runbooks:

- Env vars: `docs/runbooks/env.md`

## Local Dev

Start web + api + worker poller:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```

Stop:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-dev.ps1
```

## Repo Layout (Planned)

- `apps/web`: Next.js frontend (Vercel)
- `apps/api`: FastAPI HTTP API (Railway)
- `apps/worker`: ARQ workers (Railway)
- `supabase`: SQL migrations and policies
- `prompts`: versioned LLM prompts
- `golden_tests`: golden test inputs + expected outcomes

## Pipeline Notes

- Stage 0: tries Apify actor with retry/backoff, then direct Amazon HTML fallback.
- Stages 1-4: use OpenAI when configured; fallback to heuristics if unavailable.
- Stage 5: deterministic weighted verdict from stage scores.
- Billing: Stripe checkout session + webhook crediting with idempotency.
- Analytics: job/stage lifecycle events in `analytics_events`.
