---
status: complete
priority: p2
issue_id: "005"
tags: [code-review, billing, api, security, correctness]
dependencies: []
---

# Derive Credits Server-Side in Stripe Webhook

Avoid trusting mutable webhook metadata for credit amount.

## Problem Statement

Webhook handler currently reads `metadata[credits]` and applies that value directly. This ties accounting to metadata integrity and can drift from server pack definitions or Stripe totals.

## Findings

- Credits parsed from metadata at `apps/api/app/main.py:452` and `apps/api/app/main.py:458`.
- Applied amount is forwarded to RPC at `apps/api/app/main.py:474`.
- `pack_id` exists but is not used to derive authoritative credits (`apps/api/app/main.py:453`).

## Proposed Solutions

### Option 1: Derive Credits from Server Pack Catalog

**Approach:** Resolve `pack_id` against `INITIAL_CREDIT_PACKS` and ignore metadata credits for accounting.

**Pros:**
- Stronger business-rule integrity.
- Simple implementation.

**Cons:**
- Requires stable catalog versioning for historical events.

**Effort:** Small

**Risk:** Low

---

### Option 2: Validate Against Stripe Amount + Catalog

**Approach:** Compare Stripe session total/currency and pack metadata, reject mismatches.

**Pros:**
- Strongest end-to-end validation.

**Cons:**
- More webhook complexity.

**Effort:** Medium

**Risk:** Low

---

### Option 3: Continue Metadata-Driven Credits with Audit Alerts

**Approach:** Keep current behavior but log mismatch alarms.

**Pros:**
- Minimal behavior change.

**Cons:**
- Still permits mis-credit until detected.

**Effort:** Small

**Risk:** Medium

## Recommended Action

Implement Option 2.

## Technical Details

**Affected files:**
- `apps/api/app/main.py:451`
- `apps/api/app/main.py:458`
- `apps/api/app/main.py:474`

## Resources

- `apps/api/app/main.py`
- `apps/api/app/credit_packs.py`

## Acceptance Criteria

- [x] Webhook does not apply raw metadata credits without validation.
- [x] Credits applied are traceable to pack definition and/or Stripe amount.
- [x] Mismatch path is logged and returns safe non-apply response.
- [x] Existing successful purchase flow remains intact.

## Work Log

### 2026-02-11 - Initial Discovery

**By:** Codex (`workflows-review`)

**Actions:**
- Inspected webhook metadata parsing and RPC payload.
- Compared available trusted fields (`pack_id`, session context).

**Learnings:**
- A small validation layer can close accounting drift risk.


### 2026-02-11 - Implementation Complete

**By:** Codex (workflows-work)

**Actions:**
- Implemented code and/or docs changes required by this todo.
- Ran relevant validation checks (tests and/or linting).
- Verified acceptance criteria against updated code paths.

**Learnings:**
- This item is now resolved in the current branch.

