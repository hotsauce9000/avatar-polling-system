# Work Execution Todo (v5.1 MVP)

Source of truth: `docs/plans/2026-02-10-feat-amazon-avatar-listing-optimizer-mvp-plan.md`

## Phase 0: Decisions (Unblockers)

- [x] Confirm repo structure: monorepo with `apps/web`, `apps/api`, `apps/worker`
- [x] Confirm package manager for web: npm
- [x] Confirm Python packaging for api/worker: `requirements.txt` + `venv`
- [x] Confirm initial credit packs (or defer and stub config)

## Phase 1: Repo Skeleton + Tooling

- [x] Create folder structure (`apps/`, `prompts/`, `supabase/`, `golden_tests/`)
- [x] Add `.gitignore` (node, python, env, supabase)
- [x] Initialize git repo and create initial commit

## Phase 2: Web App (Next.js)

- [x] Scaffold Next.js app in `apps/web` (TypeScript, App Router)
- [x] Add basic routes and layout shells
- [x] Add Supabase client wiring (no secrets committed; `.env.example` only)

## Phase 3: API App (FastAPI)

- [x] Scaffold FastAPI app in `apps/api`
- [x] Add health endpoint and config loading
- [x] Add JWT validation stub (Supabase JWT secret in env)
- [x] Add endpoint: `POST /jobs`
- [x] Add endpoint: `GET /jobs/{id}`
- [x] Add endpoint: `GET /jobs/{id}/stages`
- [x] Add endpoint: `GET /credits/balance`

## Phase 4: Worker (ARQ)

- [x] Scaffold ARQ worker in `apps/worker`
- [x] Add job recovery sweep stub (Postgres authoritative)
- [x] Add stage runner skeleton (stages 0-5; parallel 1/2/3)
- [x] Wire DB-backed worker poller (no Redis required) that claims `jobs.status=queued`
- [x] Update API to seed `job_stages` (0-5) and then set `jobs.status=queued` (avoid claim race)

## Phase 5: Supabase Schema (SQL Files)

- [x] Create initial migrations in `supabase/migrations/`
- [x] Define table: `user_profiles`
- [x] Define table: `jobs`
- [x] Define table: `job_stages`
- [x] Define table: `experiments`
- [x] Define table: `prompt_versions`
- [x] Define table: `vision_cache`
- [x] Define table: `credit_operations`
- [x] Add RLS policy templates + indexes (use `(select auth.uid())` wrapper)
- [x] Add Storage bucket notes (private + signed URLs)

## Phase 6: Prompts + Golden Tests (Repo Artifacts)

- [x] Create prompt file: `prompts/vision-ctr/v1.0.md`
- [x] Create prompt file: `prompts/vision-pdp/v1.0.md`
- [x] Create prompt file: `prompts/text-alignment/v1.0.md`
- [x] Create prompt file: `prompts/avatar-explanation/v1.0.md`
- [x] Create `prompts/CHANGELOG.md`
- [x] Add placeholder golden test docs in `golden_tests/`

## Phase 7: Frontend UI (From Prior Notes)

### Design System

- Theme: dark mode (deep navy/slate backgrounds, high contrast)
- Colors: Primary `#1E40AF` (blue), Secondary `#3B82F6`, CTA `#F59E0B` (amber), backgrounds `#0F172A` -> `#1E293B`
- Fonts: Fira Code (headings/data) + Fira Sans (body)
- Icons: Lucide

### Pages to Build

Page 1: Landing + Auth
- [x] Hero section (product name, tagline, value prop, CTA)
- [x] How It Works (3-step visual)
- [x] Magic link auth UI (email input, simple form)

Page 2: Dashboard
- [x] Top nav (logo, credits, user menu)
- [x] ASIN input card (2 URL/ASIN fields, compare button, validation)
- [x] Credit balance + usage info
- [x] Recent experiments list

Page 3: Results - Pipeline Running
- [x] Stage progress indicator (6 stages)
- [x] Product cards for both ASINs (thumbs, titles, basic info from Stage 0)
- [x] Stage-by-stage results (CTR -> CVR -> text -> avatars -> verdict)
- [x] Skeleton/loading states for upcoming stages

Page 4: Results - Complete
- [x] Score comparison panel (CTR, CVR, Overall) + winner badges
- [x] Confidence meter + split verdict handling
- [x] Avatar cards (3 personas)
- [x] "What the model saw" evidence panel
- [x] Fix recommendations list (prioritized, evidence-linked)
- [x] Save as experiment + change tags input

Page 5: Experiments
- [x] Experiment list with filters (date, ASIN, pinned)
- [x] Side-by-side comparison (2-3 experiments)
- [x] Score deltas highlighted (improved/declined)

## Phase 8: Pipeline Provider Upgrades

- [x] Stage 0: attempt Apify actor fetch first, fallback to direct HTML fetch
- [x] Stage 1: OpenAI vision scoring (main image CTR) with heuristic fallback
- [x] Stage 2: OpenAI vision scoring (gallery CVR) with heuristic fallback
- [x] Stage 3: OpenAI text scoring with heuristic fallback
- [x] Stage 4: OpenAI avatar generation with heuristic fallback
- [x] Persist stage provider in `job_stages.provider_used`

## Phase 9: Reliability + Billing + Analytics + Golden Tests

- [x] Add Apify retry/backoff reliability and direct-fetch retry fallback in stage 0
- [x] Add Stripe checkout endpoint + webhook signature verification + idempotent credit apply
- [x] Add credit operation history API + dashboard view
- [x] Add analytics event storage + API ingestion + worker stage latency instrumentation
- [x] Add dashboard latency summary (P50/P95 from `stage_completed` events)
- [x] Add executable golden tests (`tests/test_golden_pipeline.py`) with fixture baseline

## Review

- [x] Fill in after completing initial skeleton (what was built, how to run it, what's next)

Summary:
- Upgraded worker pipeline to use provider-based execution with safe fallbacks.
- Added Apify-first listing fetch in stage 0 (falls back to direct Amazon fetch when Apify run is not permitted).
- Replaced placeholder heuristic-only stage outputs with OpenAI-backed scoring/generation for stages 1-4 (with automatic fallback to heuristics).
- Enhanced dashboard and results pages with credit visibility, recent history, progress UI, verdict/avatars/evidence/fixes, and experiment saving.
- Added a dedicated experiments page with filters and side-by-side score delta comparison.
- Confirmed and exposed initial credit packs (v1) via API + dashboard section.
- Added Stripe purchase flow (checkout + webhook) with idempotent credit application in Postgres.
- Added analytics events for job/stage/purchase flows and surfaced stage latency summaries on dashboard.
- Added executable golden tests for deterministic stage-5 verdict stability and schema shape.
- Hardened stage 0 listing fetch with retry/backoff for both Apify and direct HTML providers.

How to run:
- Start local stack: `powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1`
- Open: `/dashboard`, run a comparison, then inspect `/jobs/{jobId}`.
- Open experiments: `/experiments`.

What's next:
- If stage 0 shows Apify HTTP 403, replace token with one that has actor run permission, or set a different `APIFY_ACTOR_ID`.
- Configure Stripe webhook endpoint in dashboard and point it to `/webhooks/stripe`.
- Expand golden fixtures from 1 pair to 5-10 real ASIN pairs before production gatekeeping.

---

# Phase 10: Premium SaaS UI Upgrade

Source: `docs/plans/2026-02-11-feat-premium-saas-ui-upgrade-plan.md`

## Phase 1: Foundation
- [x] 1. Install `lucide-react`
- [x] 2. `globals.css` - add 6-12 violet CSS vars, fix font (remove Arial override), h-dvh
- [x] 3. `layout.tsx` - fix metadata to "Avatar Polling System" + real description

## Phase 2: Sidebar + Route Group + Auth + Security
- [x] 4. Create `middleware.ts` - server-side auth gating
- [x] 5. Create `AppSidebar.tsx` - 240px sidebar, Lucide icons, mobile hamburger, aria, Escape close
- [x] 6. Create `(app)/layout.tsx` - sidebar + main wrapper, auth check, onAuthStateChange listener
- [x] 7. Move 3 page files into `(app)/` route group
- [x] 8. Remove inline headers + per-page auth listeners from moved pages
- [x] 9. Split dashboard into sub-components (Comparison, Credits, CreditPacks, RecentJobs)

## Phase 3: Page Upgrades
- [x] 10. Landing - auth redirect, gradient heading, violet CTA, card hover lift, focus rings
- [x] 11. Dashboard - violet Compare btn, Lucide icons, hover states, grid breakpoint shift
- [x] 12. Job detail - Lucide icons, winner badge, violet fix badges, avatar borders, violet save btn
- [x] 13. Experiments - hover states, delta color coding, Lucide icons, violet focus rings

## Phase 4: Polish
- [x] 14. Cursor-pointer audit + targeted transitions (no transition-all)
- [x] 15. Standardize button heights to h-10
- [x] 16. Fix dark mode: text-zinc-500 -> add dark variants, auth callback dark mode
- [x] 17. Stripe URL validation + responsive testing + realtime/Stripe regression check

## Phase 10 Review

Summary:
- Implemented route-group shell with a fixed 240px sidebar (`AppSidebar`) and consolidated auth/session listener in `(app)/layout.tsx`.
- Moved authenticated routes to `src/app/(app)/...` and removed page-level headers and listener duplication.
- Split dashboard into `DashboardComparison`, `DashboardCredits`, `DashboardCreditPacks`, and `DashboardRecentJobs`.
- Applied premium UI pass across landing/dashboard/job detail/experiments with violet accents, Lucide icons, targeted transitions, and hover/focus consistency.
- Added Stripe checkout hostname validation before redirect: `new URL(url).hostname.endsWith('.stripe.com')`.

Validation:
- `npm run lint` (apps/web) passed.
- `npm run build` (apps/web) passed.

Additional QA completed:
- `node scripts/qa-premium-ui-upgrade.mjs` (apps/web) passed.
- Responsive overflow checks passed at 375/768/1024/1440 on landing/dashboard/experiments/job detail.
- Stripe success banner and checkout redirect attempt (`checkout.stripe.com`) verified.
- Job detail realtime smoke verified (job + stage fetches + realtime UI state), and source wiring confirmed (`channel` + `postgres_changes` + `subscribe` + `removeChannel`).
