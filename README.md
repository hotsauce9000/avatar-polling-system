# Avatar Polling System

Build spec: `PROJECT_PLAN_v5.0_HYBRID.md`

Current plan: `docs/plans/2026-02-10-feat-amazon-avatar-listing-optimizer-mvp-plan.md`

## Repo Layout (Planned)

- `apps/web`: Next.js frontend (Vercel)
- `apps/api`: FastAPI HTTP API (Railway)
- `apps/worker`: ARQ workers (Railway)
- `supabase`: SQL migrations and policies
- `prompts`: versioned LLM prompts
- `golden_tests`: golden test inputs + expected outcomes

