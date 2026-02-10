# PROJECT PLAN

## Avatar-Based Amazon Listing Optimizer

**Version 4.0** | Vision-First Hybrid (Complete Build Spec) | February 2026
Solo Project | MVP Scope | Build Spec (Single Source of Truth)

**CONFIDENTIAL**

---

## 1. CORE PRINCIPLE

This product evaluates Amazon listings the same way real shoppers decide:

1. **CTR** — "Would I click this in search?"
2. **CVR** — "Would I buy after clicking?"

## 2. DECISION HIERARCHY

All evaluation decisions follow a strict hierarchy. This is the single canonical statement of the rule — it is not repeated elsewhere in this document.

1. **Vision is the single source of truth.** The vision model's judgment on images determines the base score and the winner. All other signals are secondary.
2. **Text adjusts confidence, bounded.** Text alignment may adjust the vision score by a bounded amount (see Scoring Model). Text can NEVER exceed vision influence. Text can NEVER overturn a vision winner.
3. **Avatars explain impact.** Avatars provide human-readable explanations of why one listing wins. They do not affect scores.
4. **Pipeline ordering is mandatory.** Later stages may not override earlier ones.
5. **No LLM invents scoring logic.** All scoring weights are predefined constants. No LLM is allowed to invent, modify, or dynamically adjust scoring logic.

## 3. MAGIC MOMENT

The magic moment is: **a user sees their first side-by-side verdict with specific, actionable image fixes they can make today.**

Not just a score. Not just a winner. The moment they see "Your main image loses because X — here's exactly what to change" and think "I can do that right now."

## 4. NON-GOALS (MVP — STRICT)

The following are explicitly out of scope for MVP and MUST NOT be built unless required to reach the magic moment:

- Multi-marketplace support (Shopify, Walmart, Etsy)
- Non-US Amazon domains (.co.uk, .de, etc.)
- Pixel-perfect Amazon UI reproduction
- Full listing copywriter or "autopilot" optimization
- Team collaboration, permissions, or shared workspaces
- Chrome extension or browser injection
- Bulk analysis or API access
- Massive raw review scraping (1,000+ reviews per ASIN)

**Feature acceptance rule:** If a feature does not directly improve (1) CTR insight accuracy, (2) CVR insight accuracy, or (3) speed to the magic moment — it is deferred.

## 5. TECH STACK

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Backend** | Python 3.12+ / FastAPI | Best ecosystem for vision/LLM API integration, native async, type hints, fast solo-dev iteration |
| **Database** | PostgreSQL 16+ | Relational for credits/users/jobs, JSONB for flexible LLM response storage, proven at scale |
| **Cache / Queue** | Redis 7+ | Vision result cache, daily credit counters, job queue backend |
| **Background Jobs** | RQ (Redis Queue) | Simpler than Celery for solo dev. Idempotent workers, retry support, job deduplication |
| **Frontend** | Next.js 14+ (React) | SSR for initial load, client-side for interactive verdict UI, SSE support built in |
| **Progressive Delivery** | Server-Sent Events (SSE) | One-way server-to-client updates as pipeline stages complete. Simpler than WebSocket for this use case |
| **Vision API** | OpenAI GPT-4o Vision (primary), Anthropic Claude Vision (fallback) | Best-in-class image analysis. Fallback prevents single-vendor lock-in |
| **Text LLM** | OpenAI GPT-4o (primary) | Text alignment and avatar generation. Same vendor reduces integration complexity |
| **Hosting** | Railway or Fly.io | Simple deployment for solo dev, supports PostgreSQL + Redis + background workers |
| **File Storage** | S3-compatible (R2 or S3) | Cached image snapshots, experiment archives |

**Dependency rule:** No additional frameworks, libraries, or services beyond this list without updating this document first.

## 6. USER MODEL & AUTHENTICATION

### User Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `email` | string (unique) | Login identifier |
| `created_at` | timestamp | Account creation |
| `credit_balance` | integer | Current available credits |
| `daily_credit_used` | integer | Credits used today (reset at UTC midnight) |
| `daily_credit_reset_date` | date | Date of last daily reset |
| `is_active` | boolean | Account status |

### Authentication

- **Method:** Email magic link (passwordless). No passwords to store, no OAuth complexity.
- **Session:** JWT with 7-day expiry, stored in httpOnly cookie.
- **Why magic link:** Solo MVP, minimal auth surface area, no password reset flow needed.

### Data Isolation

- All database queries MUST include `user_id` in WHERE clauses. No global queries on user-scoped tables.
- Jobs, credits, experiments, and cached results are scoped to the user who created them.
- Job deduplication key: `(user_id, asin_a, asin_b, prompt_version)`.

## 7. EVALUATION PIPELINE

### Stage Sequence

```
User selects 2 ASINs
  → Stage 1: Vision CTR evaluation
  → Stage 2: Vision PDP evaluation
  → Stage 3: Text alignment evaluation
  → Stage 4: Avatar interpretation
  → Stage 5: Final verdict + fixes (deterministic)
```

This ordering is mandatory. Later stages may not override earlier ones. Each stage's output is persisted before the next stage begins.

### Per-Stage Definitions

| Stage | Input | Output | API Calls |
|-------|-------|--------|-----------|
| 1. Vision CTR | Main images for both ASINs | CTR base scores (1-10 each) + evidence | 1 vision call per ASIN (2 total) |
| 2. Vision PDP | Full PDP image set for both ASINs | CVR base scores (1-10 each) + evidence | 1 vision call per ASIN (2 total) |
| 3. Text alignment | Title, bullets, description for both ASINs | Text adjustment values (-1.0 to +1.0 per ASIN per dimension) | 1 text LLM call |
| 4. Avatar interpretation | All scores + evidence from stages 1-3 | Human-readable explanation of why winner wins + specific fixes | 1 text LLM call |
| 5. Final verdict | All scores + adjustments | Final scores, winner, confidence, fix list | 0 API calls (deterministic) |

## 8. PIPELINE FAILURE HANDLING

Each stage has explicit failure semantics. "Failure" means: API timeout (>60s), API error (4xx/5xx), schema validation failure on LLM output, or confidence below minimum threshold.

### Per-Stage Failure Rules

| Stage | On Failure | Credits | Cached Results |
|-------|-----------|---------|----------------|
| 1. Vision CTR | **Abort entire run.** No partial results. | Full refund | Nothing cached |
| 2. Vision PDP | **Abort.** Stage 1 results cached for reuse on retry. | Refund stages 2-4 credits. Stage 1 credits consumed (results are cached and reusable). |  Stage 1 cached |
| 3. Text alignment | **Continue without text adjustment.** Set all text adjustments to 0.0. Flag verdict as "vision-only (text unavailable)". | Refund stage 3 credits only | Stages 1-2 cached |
| 4. Avatar interpretation | **Continue without avatar.** Show verdict without explanation. Flag as "explanation unavailable". | Refund stage 4 credits only | Stages 1-3 cached |
| 5. Final verdict | **Cannot fail** (deterministic computation). If it throws, this is a bug — log, refund everything, alert. | Full refund | Nothing trusted |

### Retry Policy

- Automatic retry: 1 retry with exponential backoff (2s, then 4s) for stages 1-2 only (expensive, worth retrying).
- No automatic retry for stages 3-4 (cheap, graceful degradation is better than waiting).
- User-initiated retry: always available. Cached results from previous stages are reused automatically (see Vision Result Cache).

### Confidence Threshold

- If the vision model returns a score but the spread between ASINs is < 0.5 points, flag the verdict as "low confidence — too close to call."
- This is informational, not a failure. The run completes normally.

## 9. LATENCY BUDGET & PROGRESSIVE DELIVERY

### Per-Stage Latency Targets

| Stage | Target | Max Acceptable | Notes |
|-------|--------|---------------|-------|
| 1. Vision CTR | 10s | 20s | 2 parallel vision calls |
| 2. Vision PDP | 15s | 30s | 2 parallel vision calls, more images |
| 3. Text alignment | 5s | 10s | Single text LLM call |
| 4. Avatar interpretation | 5s | 10s | Single text LLM call |
| 5. Final verdict | <1s | 1s | Deterministic computation |
| **Total pipeline** | **36s** | **71s** | **Target < 90s end-to-end** |

### Progressive Delivery via SSE

Results stream to the frontend as each stage completes. The user never stares at a blank screen:

1. **Job accepted** → Show "Analyzing..." with pipeline stage indicator
2. **Stage 1 complete** → Show CTR base scores immediately ("ASIN A: 7.2 vs ASIN B: 5.8 — A is winning on click appeal")
3. **Stage 2 complete** → Show CVR base scores ("ASIN A: 6.5 vs ASIN B: 7.1 — B has stronger PDP")
4. **Stage 3 complete** → Update scores with text adjustments, show confidence change
5. **Stage 4 complete** → Show avatar explanation and specific fixes
6. **Stage 5 complete** → Show final verdict with full breakdown

**SSE event format:**
```
event: stage_complete
data: {"stage": 1, "stage_name": "vision_ctr", "results": {...}, "elapsed_ms": 8200}
```

**Frontend rule:** Each stage result is displayed within 500ms of the SSE event arriving. No waiting for all stages before showing anything.

## 10. SCORING MODEL (DETERMINISTIC)

### Score Range

All scores use a **1.0 to 10.0** scale (one decimal place). 1.0 = worst possible, 10.0 = best possible.

### Formula

For each ASIN, per dimension (CTR and CVR):

```
final_score = clamp(vision_base_score + text_adjustment, 1.0, 10.0)
```

Where:
- `vision_base_score`: 1.0–10.0, produced by the vision model (stages 1 and 2)
- `text_adjustment`: -1.0 to +1.0, produced by text alignment (stage 3). Clamped to this range before application.
- `clamp(x, min, max)`: ensures the result stays within 1.0–10.0

### Weight Constraints (Enforced in Code)

| Constraint | Rule | Enforcement |
|-----------|------|-------------|
| Text bounded | `abs(text_adjustment) <= 1.0` | Clamp before applying |
| Text cannot flip winner | If vision winner = A, final winner must = A | Post-computation assertion |
| No LLM in scoring | Formula is hardcoded, not generated | Code review + test |
| Deterministic | Same inputs always produce same outputs | Golden test validation |

### Winner Determination

```
ctr_winner = ASIN with higher final_ctr_score
cvr_winner = ASIN with higher final_cvr_score

If ctr_winner == cvr_winner:
    overall_winner = ctr_winner
    confidence = "high"

If ctr_winner != cvr_winner:
    overall_winner = ctr_winner  (CTR is top-of-funnel, takes precedence)
    confidence = "split — A wins on clicks, B wins on conversions"
```

### Tie-Breaking

If final scores are identical (within 0.1):
- Declare "too close to call"
- Show both with a note: "These listings are effectively equal on [dimension]. Focus on other differentiation."

## 11. VISION RESULT CACHE

### Purpose

Avoid redundant vision API calls when the same image is evaluated with the same prompt version. Critical for: experiment re-runs, retries after partial failure, and multiple users evaluating the same ASIN.

### Cache Key

```
cache_key = hash(image_content_hash, prompt_version_id, evaluation_type)
```

Where:
- `image_content_hash`: SHA-256 of the actual image bytes (not the URL — URLs can change, images can be updated)
- `prompt_version_id`: e.g., `vision-ctr-v1.1`
- `evaluation_type`: `ctr` or `pdp`

### Cache Rules

| Rule | Value | Rationale |
|------|-------|-----------|
| **TTL** | 7 days | Amazon images change infrequently. 7 days balances freshness with cost savings. |
| **Storage** | Redis (hot) + PostgreSQL (warm) | Redis for fast lookups, PostgreSQL `vision_cache` table for persistence across Redis restarts |
| **Invalidation — prompt change** | Invalidate ALL cache entries for the changed evaluation type | New prompt version = new evaluation logic = old results are invalid |
| **Invalidation — manual** | Admin endpoint to flush cache for a specific ASIN | For debugging or when a seller updates their images |
| **Cache hit behavior** | Skip the vision API call entirely, use cached score + evidence | Deduct 0 credits for cached stages (user sees "cached result" indicator) |
| **Cache miss behavior** | Normal vision API call, store result in cache on success | Full credits deducted |

### Credit Interaction

- Cached vision results cost **0 credits**. Only fresh API calls cost credits.
- The pre-execution credit check uses the worst-case cost (all cache misses). Actual deduction adjusts after execution based on cache hits.
- Credit display shows: "Estimated: 18 credits (may be less with cached results)."

## 12. CREDIT SYSTEM

### Purpose

Credits exist to cap cost, not to meter value.

### Per-Stage Credit Costs

| Stage | Credits | Rationale |
|-------|---------|-----------|
| 1. Vision CTR | 6 | 2 vision API calls (primary cost driver) |
| 2. Vision PDP | 8 | 2 vision API calls, more images per call |
| 3. Text alignment | 2 | 1 text LLM call (secondary cost) |
| 4. Avatar interpretation | 2 | 1 text LLM call (secondary cost) |
| 5. Final verdict | 0 | Deterministic computation, no API call |
| **Typical total** | **18** | Well within 25-credit max |

### Rules

- Credits are deducted BEFORE execution (worst-case estimate: all cache misses = 18 credits).
- After execution completes, actual cost is reconciled. Overpaid credits (from cache hits) are refunded immediately.
- Failed stages refund per the failure table in Section 8.
- No single run may exceed **25 credits**.
- Daily cap: **100 credits per user per day** (resets at UTC midnight).
- Monthly hard budget: configurable per-user, default **500 credits/month**.

### Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| User has exactly 18 credits, run costs 18 | Run proceeds. Balance goes to 0. No fence-post error — `>=` check, not `>`. |
| User has 15 credits, run estimates 18 | Run blocked. Message: "Insufficient credits. This run requires up to 18 credits, you have 15." |
| Partial failure refund + retry creates surplus | Refunds cannot exceed credits originally deducted for that run. Refund is capped at `min(refund_amount, credits_deducted_for_this_run)`. Balance can never exceed what it was before the run started due to refunds from that run. |
| Two concurrent runs both pass pre-check | Use `SELECT ... FOR UPDATE` on the user's credit row to serialize concurrent deductions. Second run may be blocked if first run consumed the credits. |
| Daily cap resets mid-run | Run that started before midnight is allowed to complete. Daily cap is checked at run START only, not per-stage. |
| User initiates run, then immediately cancels | If no stages have started executing, full refund. If stages have started, refund only for stages that haven't completed. Completed stage results are cached. |
| "Daily" definition | UTC midnight. No timezone ambiguity. `daily_credit_reset_date` column on user table is compared to `current_date AT TIME ZONE 'UTC'`. |

## 13. PROMPT VERSIONING & QUALITY CONTROL

### Prompt Types

Three prompt types must be versioned:

1. `vision-ctr` — Vision CTR evaluation prompt
2. `vision-pdp` — Vision PDP evaluation prompt
3. `avatar-explanation` — Avatar interpretation prompt

(Text alignment uses a structured extraction prompt that is versioned the same way but changes less frequently.)

### Versioning Rules

- Semantic versioning: `{type}-v{major}.{minor}` (e.g., `vision-ctr-v1.2`)
- All prompts registered in `prompt_versions` table with columns: `id`, `type`, `version`, `content`, `content_hash` (SHA-256), `created_at`, `is_active`
- Only one version per type may be `is_active = true` at a time.
- Every job record stores the `prompt_version_id` used, for full reproducibility.

### Deployment Gate

No prompt version may be activated in production without passing the golden test suite (see below).

## 14. GOLDEN TEST SET

### Purpose

Protect against silent degradation when prompts, models, or code change.

### Golden Test Schema

Each golden test record contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Auto-increment |
| `asin_a` | string | First ASIN |
| `asin_b` | string | Second ASIN |
| `expected_ctr_winner` | enum (A, B, TIE) | Human-labeled CTR winner |
| `expected_cvr_winner` | enum (A, B, TIE) | Human-labeled CVR winner |
| `expected_ctr_score_a` | float | Expected CTR score for ASIN A (±0.5 tolerance) |
| `expected_ctr_score_b` | float | Expected CTR score for ASIN B (±0.5 tolerance) |
| `expected_cvr_score_a` | float | Expected CVR score for ASIN A (±0.5 tolerance) |
| `expected_cvr_score_b` | float | Expected CVR score for ASIN B (±0.5 tolerance) |
| `labeled_by` | string | Who determined the expected outcome |
| `labeled_at` | timestamp | When the labeling was done |
| `last_reviewed_at` | timestamp | Last time a human verified this test is still valid |
| `notes` | text | Why this pair was chosen, what it tests |

### Labeling Process

1. Select 5-10 ASIN pairs that cover diverse scenarios: clear winner, close call, split CTR/CVR, different categories.
2. The product owner (you) manually evaluates each pair and records expected winners and approximate scores.
3. Golden tests are reviewed quarterly or whenever a product category shifts significantly.
4. Disagreements between model output and golden test require human re-evaluation before the test is updated. The model does not auto-correct the golden set.

### Drift Detection (Composite Check)

After any prompt version change or model update, run all golden tests. **Both checks must pass:**

| Check | Rule | Failure Meaning |
|-------|------|-----------------|
| **Winner stability** | Expected winner must not flip for any golden test pair | The prompt change reversed a known-correct judgment |
| **Score tolerance** | All scores must be within ±0.5 of expected values (on 1-10 scale = 5% tolerance) | The prompt change significantly shifted scoring calibration |

- If **either** check fails: deployment is blocked. The prompt change must be revised or golden tests must be re-labeled with justification.
- If **both** pass: deployment proceeds.

## 15. TESTING STRATEGY

### Test Layers

| Layer | What It Tests | Tool | When It Runs |
|-------|--------------|------|-------------|
| **Unit tests** | Scoring formula, credit calculations, cache key generation, data validation | pytest | Every commit (CI) |
| **Integration tests** | Pipeline stage orchestration, credit deduction + refund flow, SSE delivery, job deduplication | pytest + test DB | Every commit (CI) |
| **Contract tests** | LLM response schema validation (does the vision model return the expected JSON shape?) | pytest with mocked API responses | Every commit (CI) |
| **Golden tests** | Prompt regression detection (winner stability + score tolerance) | Custom golden test runner | Before prompt deployment |
| **E2E tests** | Full user flow: login → select ASINs → see progressive results → save experiment | Playwright | Pre-deploy |

### Unit Test Coverage Requirements

The following MUST have unit tests:

- **Scoring formula:** Every path through `clamp`, text adjustment application, winner determination, tie-breaking.
- **Credit calculations:** Pre-deduction estimate, post-execution reconciliation, refund logic for each failure scenario, fence-post (exact balance = exact cost), concurrent deduction serialization.
- **Cache key generation:** Correct hash composition, different images produce different keys, different prompt versions produce different keys, same inputs produce same key (determinism).
- **Data validation:** ASIN format validation, score range enforcement (reject scores outside 1.0-10.0), text adjustment clamping.

### Integration Test Scenarios

- Full pipeline happy path (all stages succeed).
- Stage 2 failure → stage 1 results cached, credits partially refunded, retry reuses cache.
- Stage 3 failure → graceful degradation, verdict flagged as vision-only.
- Stage 4 failure → verdict shown without avatar explanation.
- Concurrent runs by same user for same ASIN pair → deduplication returns same job ID.
- Concurrent runs by same user for different ASIN pairs → both proceed, credit serialization works.
- Cache hit on re-run → 0 credits for cached stages, results identical to first run.
- Daily cap enforcement → run blocked when daily usage + estimated cost > 100.

### Edge Cases That MUST Be Tested

- Identical ASINs (user enters same ASIN twice) → reject with clear error before consuming credits.
- ASIN with no images → fail at stage 1 with specific error, not a generic 500.
- ASIN with 1 image vs ASIN with 9 images → pipeline handles asymmetric image counts.
- Vision model returns score outside 1.0-10.0 → schema validation catches it, stage fails gracefully.
- Text adjustment that would flip the vision winner → clamped, assertion prevents flip, logged as anomaly.
- Experiment save with identical inputs to existing experiment → update existing, don't create duplicate.
- User with 0 credits → blocked at pre-check, not after job is queued.

## 16. EXPERIMENTS & RETENTION LOOP

### Purpose

Every simulation can be saved as a baseline experiment. Experiments create switching costs, historical learning, and natural re-engagement.

### User Capabilities

- Save any completed run as an experiment baseline
- Log what changed between runs (images, title, bullets, price) via structured tags
- Re-run simulation with current listing state
- See deltas: score changes, winner changes, confidence changes between baseline and re-run
- Compare up to 3 experiments side-by-side

### Experiment Record Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Owner |
| `asin_a` | string | First ASIN |
| `asin_b` | string | Second ASIN |
| `job_id` | UUID | Link to the run that produced this experiment |
| `scores_snapshot` | JSONB | All final scores, adjustments, and verdicts |
| `change_tags` | string[] | What the user changed (e.g., ["main_image", "title"]) |
| `notes` | text | User's freeform notes |
| `created_at` | timestamp | When saved |
| `prompt_versions_used` | JSONB | Prompt version IDs used in this run |

## 17. EXPERIMENT RETENTION POLICY

To prevent unbounded storage growth:

| Tier | Data | Retention | Storage |
|------|------|-----------|---------|
| **Hot** | Last 50 experiments per user (full data including raw API responses) | Indefinite (until displaced by newer experiments) | PostgreSQL |
| **Warm** | Experiments 51-200 per user (scores, verdicts, metadata only — raw API responses archived) | 90 days after archival | PostgreSQL (slim) + S3 (raw responses) |
| **Cold** | Experiments older than 90 days in warm tier | Deleted permanently | N/A |

### Rules

- Raw API responses (vision model output, text LLM output) are the largest data. These are archived to S3 when an experiment leaves the hot tier.
- Scores, verdicts, change tags, and notes are kept in PostgreSQL permanently for the hot tier (last 50).
- When a user saves experiment #51, experiment #1 (oldest) moves to warm tier.
- Users can "pin" up to 5 experiments to prevent them from leaving the hot tier.
- Archival runs as a daily background job.

## 18. OPERATIONAL SIMPLICITY CHECKLIST

Before MVP is considered complete, all items below must be true:

- [ ] All background jobs are idempotent
- [ ] Duplicate requests return the same job ID (keyed on `user_id, asin_a, asin_b, prompt_version`)
- [ ] Prompt versions are pinned per run
- [ ] Image content hashes (SHA-256) are stored for every vision call
- [ ] Credit cost is checked BEFORE execution (worst-case estimate)
- [ ] Failed jobs refund credits per the failure table in Section 8
- [ ] All LLM outputs are schema-validated (reject malformed responses)
- [ ] No worker stores state in memory (all state in PostgreSQL or Redis)
- [ ] Vision result cache is operational (Section 11)
- [ ] SSE progressive delivery is functional (Section 9)
- [ ] Golden test suite passes (Section 14)
- [ ] All unit and integration tests pass (Section 15)

## 19. RISKS & MITIGATIONS

| Risk | Mitigation |
|------|-----------|
| Vision model regression | Golden tests (composite check: winner stability + score tolerance) + image-hash enforcement |
| "Everything looks fine" output | Forced evidence references — vision model must cite specific image regions |
| User distrust | Show "What the model saw" panel — transparency into vision model reasoning |
| Runaway API costs | Credit caps (25/run, 100/day) + vision result cache + hard monthly budget |
| Vision API downtime | Fallback to secondary vision provider (Anthropic Claude Vision) |
| Stale cache results | 7-day TTL + prompt-version-aware invalidation + manual flush endpoint |
| Credit race conditions | `SELECT ... FOR UPDATE` serialization on credit row |
| Experiment storage bloat | Tiered retention: hot (50) → warm (200, archived) → cold (deleted) |

## 20. SUCCESS METRICS

| Metric | What It Measures | Target |
|--------|-----------------|--------|
| CTR verdict agreement rate | "Yes, I'd click that too" — user agrees with the model's CTR winner | > 80% |
| Image-fix adoption rate | User makes at least one suggested change within 7 days | > 30% |
| Second simulation within 24h | User returns to re-evaluate after making changes | > 40% |
| % of simulations saved as experiments | User engagement with the retention loop | > 50% |
| Golden test stability | No winner flips or score drift > ±0.5 across prompt changes | 100% pass rate |
| Pipeline completion rate | Runs that complete all 5 stages without abort | > 95% |
| P50 pipeline latency | Median time from job start to final verdict | < 45s |
| P95 pipeline latency | 95th percentile end-to-end | < 90s |
