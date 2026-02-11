---
status: complete
priority: p2
issue_id: "004"
tags: [code-review, billing, idempotency, database, reliability]
dependencies: []
---

# Make Credit Apply RPC Atomic and Deterministic

Simplify and harden idempotency handling in `apply_credit_purchase`.

## Problem Statement

Current RPC logic uses a pre-check on `stripe_session_id`, then inserts with conflict handling only on `idempotency_key`, and catches `unique_violation` generically. This creates race-dependent behavior and less precise outcomes.

## Findings

- Pre-check exists at `supabase/migrations/0004_billing_analytics.sql:64`.
- Insert conflict strategy only targets `idempotency_key` at `supabase/migrations/0004_billing_analytics.sql:90`.
- Generic exception path returns `unique_violation` at `supabase/migrations/0004_billing_analytics.sql:105`.
- Balance update at `supabase/migrations/0004_billing_analytics.sql:97` does not verify affected row count.

## Proposed Solutions

### Option 1: Single-Path Insert Outcome

**Approach:** Remove pre-check and rely on insert+row_count with explicit conflict target strategy.

**Pros:**
- Fewer race windows.
- Clear deterministic reason mapping.

**Cons:**
- Requires SQL rewrite and careful conflict design.

**Effort:** Medium

**Risk:** Medium

---

### Option 2: Keep Existing Logic, Improve Reason Mapping

**Approach:** Retain pre-check but map exception states explicitly and validate update row count.

**Pros:**
- Smaller SQL delta.

**Cons:**
- Preserves complexity and race-sensitive branches.

**Effort:** Medium

**Risk:** Medium

---

### Option 3: Move Orchestrated Idempotency to API

**Approach:** Keep DB constraints; orchestrate conflict semantics in app layer transaction.

**Pros:**
- Better observability and unit testing.

**Cons:**
- Larger architectural change.

**Effort:** Large

**Risk:** Medium

## Recommended Action

Implement Option 1 and add explicit update-row verification.

## Technical Details

**Affected files:**
- `supabase/migrations/0004_billing_analytics.sql:64`
- `supabase/migrations/0004_billing_analytics.sql:90`
- `supabase/migrations/0004_billing_analytics.sql:97`
- `supabase/migrations/0004_billing_analytics.sql:105`

## Resources

- `supabase/migrations/0004_billing_analytics.sql`
- `apps/api/app/main.py:470`

## Acceptance Criteria

- [x] RPC returns deterministic reasons for replay vs duplicate vs invalid input.
- [x] No race-sensitive pre-check is required for correctness.
- [x] Balance update success is validated before returning `applied=true`.
- [x] Concurrent replay test confirms exactly-once crediting.

## Work Log

### 2026-02-11 - Initial Discovery

**By:** Codex (`workflows-review`)

**Actions:**
- Traced function control flow and idempotency branches.
- Compared insert conflict behavior to stripe session uniqueness intent.

**Learnings:**
- Existing behavior is close but not minimal/deterministic under contention.


### 2026-02-11 - Implementation Complete

**By:** Codex (workflows-work)

**Actions:**
- Implemented code and/or docs changes required by this todo.
- Ran relevant validation checks (tests and/or linting).
- Verified acceptance criteria against updated code paths.

**Learnings:**
- This item is now resolved in the current branch.

