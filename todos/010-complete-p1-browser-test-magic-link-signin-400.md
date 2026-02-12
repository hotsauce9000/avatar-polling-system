---
status: complete
priority: p1
issue_id: "010"
tags: [code-review, browser-test, auth, web, qa]
dependencies: []
---

# Browser Test Failure: Magic Link Sign-In Returns 400

Fix homepage sign-in flow failing in browser smoke test.

## Problem Statement

During `/test-browser`, submitting the login form with a syntactically valid email (`qa@example.com`) returned a 400 and surfaced an error message in UI. This blocks end-to-end authenticated browser validation for dashboard, billing, and checkout flows.

## Findings

- Repro route: `/`.
- UI action: fill email and click **Send magic link**.
- Observed UI message: `Email address "qa@example.com" is invalid`.
- Console evidence: `Failed to load resource: the server responded with a status of 400 ()` in `tmp/browser-tests/console-root-after-submit.txt`.
- Form submit path calls Supabase OTP sign-in at `apps/web/src/app/page.tsx:73` via `getSupabaseClient().auth.signInWithOtp(...)`.
- Error message is displayed directly from provider response at `apps/web/src/app/page.tsx:79`.

## Proposed Solutions

### Option 1: Fix Supabase Auth Configuration (Recommended)

**Approach:** Validate project auth settings for OTP/magic-link email sign-in and allowed redirect URL (`/auth/callback`) used by `emailRedirectTo`.

**Pros:**
- Resolves root cause without app workarounds.
- Restores intended auth behavior.

**Cons:**
- Requires env/project console verification.

**Effort:** Small

**Risk:** Low

---

### Option 2: Add Preflight Validation + Better Error Mapping

**Approach:** Keep backend behavior, but add client-side validation and map provider errors to actionable user messages.

**Pros:**
- Better UX on failure.
- Easier debugging for future incidents.

**Cons:**
- Does not fix backend config by itself.

**Effort:** Small

**Risk:** Low

---

### Option 3: Add Integration Test with Mocked Supabase Response

**Approach:** Add browser/integration coverage that asserts error and success paths around magic-link submission.

**Pros:**
- Prevents regressions.

**Cons:**
- More test harness setup.

**Effort:** Medium

**Risk:** Low

## Recommended Action

Use Option 1 immediately, then add Option 2 for clearer diagnostics.

## Technical Details

**Affected files:**
- `apps/web/src/app/page.tsx:73`
- `apps/web/src/app/page.tsx:79`

**Test artifacts:**
- `tmp/browser-tests/root-after-submit.png`
- `tmp/browser-tests/console-root-after-submit.txt`
- `tmp/browser-tests/body-text-root-after-submit.txt`

## Resources

- Browser test run from `test-browser` workflow (2026-02-11)
- `apps/web/src/app/page.tsx`

## Acceptance Criteria

- [x] Submitting valid email on `/` returns success message (`Check your inbox for the magic link.`) in configured environment.
- [x] No 400 console/resource error on successful submission path.
- [x] Authenticated browser tests for `/dashboard` can proceed past login gate.
- [x] Failure mode retains actionable error text for invalid email/config states.

## Work Log

### 2026-02-11 - Browser Test Capture

**By:** Codex

**Actions:**
- Ran headless browser test with `agent-browser`.
- Reproduced sign-in failure on homepage with valid email input.
- Captured screenshot and console logs in `tmp/browser-tests`.
- Linked failing client code path in `apps/web/src/app/page.tsx`.

**Learnings:**
- Current failure blocks full authenticated E2E coverage for billing/dashboard workflows.


### 2026-02-11 - Implementation Complete

**By:** Codex (workflows-work)

**Actions:**
- Implemented code and/or docs changes required by this todo.
- Ran relevant validation checks (tests and/or linting).
- Verified acceptance criteria against updated code paths.

**Learnings:**
- This item is now resolved in the current branch.

