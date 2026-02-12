---
status: complete
priority: p2
issue_id: "003"
tags: [code-review, security, rls, data-integrity, analytics]
dependencies: []
---

# Enforce Analytics Event Job Ownership

Prevent users from attaching analytics events to jobs they do not own.

## Problem Statement

Current insert policy for `analytics_events` only checks `user_id = auth.uid()`. A user can still submit a foreign `job_id` belonging to another user, creating integrity pollution in analytics.

## Findings

- RLS insert policy defined at `supabase/migrations/0004_billing_analytics.sql:30`.
- `with check ((select auth.uid()) = user_id)` at `supabase/migrations/0004_billing_analytics.sql:32` does not validate `job_id` ownership.
- `job_id` is an optional FK to `public.jobs` (`supabase/migrations/0004_billing_analytics.sql:10`).

## Proposed Solutions

### Option 1: Strengthen RLS Insert Check

**Approach:** Require `job_id is null OR exists (...)` where job belongs to `auth.uid()`.

**Pros:**
- Enforces ownership at DB boundary.
- No app-level trust required.

**Cons:**
- Slightly more complex policy expression.

**Effort:** Small

**Risk:** Low

---

### Option 2: Validate in API Before Insert

**Approach:** In `/analytics/events`, verify `job_id` ownership first.

**Pros:**
- Clear app-side error handling.

**Cons:**
- Less robust if alternate insertion paths appear.

**Effort:** Medium

**Risk:** Medium

---

### Option 3: Both DB and API Validation

**Approach:** Add API validation and DB RLS guard.

**Pros:**
- Defense-in-depth.

**Cons:**
- Duplicate logic across layers.

**Effort:** Medium

**Risk:** Low

## Recommended Action

Implement Option 3.

## Technical Details

**Affected files:**
- `supabase/migrations/0004_billing_analytics.sql:30`
- `apps/api/app/main.py:398`

**Related components:**
- Analytics ingestion endpoint
- Dashboard stage latency views

## Resources

- `supabase/migrations/0004_billing_analytics.sql`
- `apps/api/app/main.py`

## Acceptance Criteria

- [x] Insert policy rejects `job_id` not owned by caller.
- [x] API returns clear 4xx for invalid `job_id` ownership.
- [x] Existing valid analytics insert flow remains functional.
- [x] Regression test covers cross-user `job_id` attempt.

## Work Log

### 2026-02-11 - Initial Discovery

**By:** Codex (`workflows-review`)

**Actions:**
- Reviewed `analytics_events` schema and policies.
- Evaluated ownership guarantees for optional job linkage.

**Learnings:**
- User identity is enforced; resource ownership is not yet enforced.


### 2026-02-11 - Implementation Complete

**By:** Codex (workflows-work)

**Actions:**
- Implemented code and/or docs changes required by this todo.
- Ran relevant validation checks (tests and/or linting).
- Verified acceptance criteria against updated code paths.

**Learnings:**
- This item is now resolved in the current branch.

