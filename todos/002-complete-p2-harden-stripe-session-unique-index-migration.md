---
status: complete
priority: p2
issue_id: "002"
tags: [code-review, migration, database, performance, reliability]
dependencies: []
---

# Harden Stripe Session Unique Index Migration

Make the new unique index on `credit_operations.stripe_session_id` safe for live deployments.

## Problem Statement

The migration creates a unique partial index directly. On production-sized tables, this can block writes; if duplicates already exist, migration can fail outright.

## Findings

- Unique index added at `supabase/migrations/0004_billing_analytics.sql:3`.
- No pre-deduplication query exists before unique index creation.
- No concurrent index strategy is documented for online deploy.

## Proposed Solutions

### Option 1: Precheck + Deduplicate + Create Index

**Approach:** Add migration-safe dedupe step before creating unique index.

**Pros:**
- Prevents deploy failures from historical duplicates.
- Deterministic migration behavior.

**Cons:**
- Requires duplicate-resolution policy.

**Effort:** Medium

**Risk:** Medium

---

### Option 2: Split to Online Index Migration

**Approach:** Create index concurrently in separate non-transactional migration.

**Pros:**
- Lower lock contention during deploy.

**Cons:**
- Operational complexity (migration runner support).

**Effort:** Medium

**Risk:** Medium

---

### Option 3: Maintenance Window Migration

**Approach:** Keep current SQL, run with explicit lock window/off-peak.

**Pros:**
- Minimal code change.

**Cons:**
- Higher operational risk and deploy coupling.

**Effort:** Small

**Risk:** High

## Recommended Action

Use Option 1 plus Option 2 for production safety.

## Technical Details

**Affected files:**
- `supabase/migrations/0004_billing_analytics.sql:3`

**Database changes (if any):**
- Dedupe SQL for duplicate `stripe_session_id` rows.
- Safe unique index creation strategy.

## Resources

- `supabase/migrations/0004_billing_analytics.sql`
- `supabase/migrations/0003_job_stages_unique.sql`

## Acceptance Criteria

- [x] Duplicate precheck query documented and executed.
- [x] Migration succeeds on dataset with historical duplicates.
- [x] Write-path blocking risk is addressed (concurrent or controlled window).
- [x] Post-deploy unique index exists and is valid.

## Work Log

### 2026-02-11 - Initial Discovery

**By:** Codex (`workflows-review`)

**Actions:**
- Reviewed index creation SQL in migration.
- Assessed failure and locking scenarios for live traffic.

**Learnings:**
- Index creation strategy needs explicit deployment plan.


### 2026-02-11 - Implementation Complete

**By:** Codex (workflows-work)

**Actions:**
- Implemented code and/or docs changes required by this todo.
- Ran relevant validation checks (tests and/or linting).
- Verified acceptance criteria against updated code paths.

**Learnings:**
- This item is now resolved in the current branch.

