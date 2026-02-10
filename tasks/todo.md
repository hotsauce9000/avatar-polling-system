# Work Execution Todo (v5.1 MVP)

Source of truth: `docs/plans/2026-02-10-feat-amazon-avatar-listing-optimizer-mvp-plan.md`

## Phase 0: Decisions (Unblockers)

- [x] Confirm repo structure: monorepo with `apps/web`, `apps/api`, `apps/worker`
- [x] Confirm package manager for web: npm
- [x] Confirm Python packaging for api/worker: `requirements.txt` + `venv`
- [ ] Confirm initial credit packs (or defer and stub config)

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
- [ ] Hero section (product name, tagline, value prop, CTA)
- [ ] How It Works (3-step visual)
- [x] Magic link auth UI (email input, simple form)

Page 2: Dashboard
- [x] Top nav (logo, credits, user menu)
- [x] ASIN input card (2 URL/ASIN fields, compare button, validation)
- [ ] Credit balance + usage info
- [ ] Recent experiments list

Page 3: Results - Pipeline Running
- [ ] Stage progress indicator (6 stages)
- [ ] Product cards for both ASINs (thumbs, titles, basic info from Stage 0)
- [ ] Stage-by-stage results (CTR -> CVR -> text -> avatars -> verdict)
- [ ] Skeleton/loading states for upcoming stages

Page 4: Results - Complete
- [ ] Score comparison panel (CTR, CVR, Overall) + winner badges
- [ ] Confidence meter + split verdict handling
- [ ] Avatar cards (3 personas)
- [ ] "What the model saw" evidence panel
- [ ] Fix recommendations list (prioritized, evidence-linked)
- [ ] Save as experiment + change tags input

Page 5: Experiments
- [ ] Experiment list with filters (date, ASIN, pinned)
- [ ] Side-by-side comparison (2-3 experiments)
- [ ] Score deltas highlighted (improved/declined)

## Review

- [ ] Fill in after completing initial skeleton (what was built, how to run it, what's next)
