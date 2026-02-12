---
status: complete
priority: p1
issue_id: "001"
tags: [code-review, security, billing, supabase, migration]
dependencies: []
---

# Restrict Credit Purchase RPC Execution

Lock down `apply_credit_purchase` so untrusted clients cannot mint credits.

## Problem Statement

`apply_credit_purchase` is introduced as a `SECURITY DEFINER` function and currently has no explicit execute-grant hardening or caller authorization guard. In Supabase/Postgres deployments, this can expose a direct credit-minting path if the function is invokable by client roles.

## Findings

- `supabase/migrations/0004_billing_analytics.sql:34` creates `public.apply_credit_purchase(...)`.
- `supabase/migrations/0004_billing_analytics.sql:42` sets `security definer`.
- The function accepts `p_user_id` and `p_amount` (`supabase/migrations/0004_billing_analytics.sql:35`, `supabase/migrations/0004_billing_analytics.sql:36`) and applies balance updates (`supabase/migrations/0004_billing_analytics.sql:97`).
- No `REVOKE EXECUTE` / restrictive `GRANT EXECUTE` is present in the migration.

## Proposed Solutions

### Option 1: Service-Role-Only Execution

**Approach:** Revoke execute from broad roles and grant only to `service_role`.

**Pros:**
- Clear hard boundary for billing mutation.
- Minimal application changes.

**Cons:**
- Requires role grants to be managed correctly across environments.

**Effort:** Small

**Risk:** Low

---

### Option 2: Keep Execute Broad, Enforce In-Function Caller Guard

**Approach:** Validate caller identity inside function (for example `auth.role()` or `auth.uid()` checks) and reject unauthorized calls.

**Pros:**
- Defense-in-depth at data layer.

**Cons:**
- More policy logic inside PL/pgSQL.
- Still risk if guard logic is wrong.

**Effort:** Medium

**Risk:** Medium

---

### Option 3: Remove RPC and Perform Purchase Write in API Transaction

**Approach:** Move credit apply logic to API service using constrained SQL primitives.

**Pros:**
- Centralizes business logic in app layer.
- Easier to unit test in Python.

**Cons:**
- Larger refactor.
- More moving parts for rollback.

**Effort:** Large

**Risk:** Medium

## Recommended Action

Use Option 1 now, then add Option 2 as defense-in-depth.

## Technical Details

**Affected files:**
- `supabase/migrations/0004_billing_analytics.sql:34`
- `supabase/migrations/0004_billing_analytics.sql:42`
- `apps/api/app/main.py:470`

**Related components:**
- Stripe webhook handler (`/webhooks/stripe`)
- Supabase RPC layer
- Credit balance accounting

**Database changes (if any):**
- Add explicit `REVOKE/GRANT EXECUTE` statements for function.

## Resources

- `supabase/migrations/0004_billing_analytics.sql`
- `apps/api/app/main.py`

## Acceptance Criteria

- [x] Function execute privileges are restricted to trusted role(s) only.
- [x] Unauthorized caller cannot invoke credit apply RPC.
- [x] Webhook happy path still credits once per session.
- [x] Replay webhook remains idempotent.

## Work Log

### 2026-02-11 - Initial Discovery

**By:** Codex (`workflows-review`)

**Actions:**
- Reviewed migration introducing `apply_credit_purchase`.
- Confirmed `SECURITY DEFINER` usage and missing explicit execute hardening.
- Correlated with webhook invocation path in API.

**Learnings:**
- Billing idempotency logic is present but role boundary remains primary risk.


### 2026-02-11 - Implementation Complete

**By:** Codex (workflows-work)

**Actions:**
- Implemented code and/or docs changes required by this todo.
- Ran relevant validation checks (tests and/or linting).
- Verified acceptance criteria against updated code paths.

**Learnings:**
- This item is now resolved in the current branch.

