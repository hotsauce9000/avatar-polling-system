---
status: complete
priority: p2
issue_id: "007"
tags: [code-review, testing, quality, reliability]
dependencies: []
---

# Stabilize Golden Verdict Assertions

Reduce false-negative golden test failures from full-object equality.

## Problem Statement

The verdict stability test compares two complete verdict objects. This is brittle: additive metadata or benign structure changes can fail the test even when core scoring invariants are unchanged.

## Findings

- Full object equality assertion at `tests/test_golden_pipeline.py:46`.
- Core invariants already validated separately (`winner`, `scores`, `confidence`) at `tests/test_golden_pipeline.py:41` through `tests/test_golden_pipeline.py:45`.

## Proposed Solutions

### Option 1: Compare Normalized Stable Subset

**Approach:** Build canonical subset (winner, totals, confidence, prioritized fixes) and compare that.

**Pros:**
- Aligns assertion with intended contract.
- Lower brittleness.

**Cons:**
- Requires agreed stable contract fields.

**Effort:** Small

**Risk:** Low

---

### Option 2: Snapshot Contract with Explicit Exclusions

**Approach:** Snapshot full verdict minus known volatile fields.

**Pros:**
- Broad coverage.

**Cons:**
- Snapshot churn risk.

**Effort:** Medium

**Risk:** Medium

---

### Option 3: Keep Full Equality and Freeze Schema Aggressively

**Approach:** Treat any structural change as breaking change.

**Pros:**
- Strictest guard.

**Cons:**
- High maintenance friction.

**Effort:** Small

**Risk:** High

## Recommended Action

Implement Option 1.

## Technical Details

**Affected files:**
- `tests/test_golden_pipeline.py:46`

## Resources

- `tests/test_golden_pipeline.py`
- `golden_tests/fixtures/golden_pair_001.json`

## Acceptance Criteria

- [x] Test validates deterministic scoring contract without over-coupling to non-contract fields.
- [x] Benign metadata additions do not fail golden gate.
- [x] Intentional contract-breaking changes still fail tests.

## Work Log

### 2026-02-11 - Initial Discovery

**By:** Codex (`workflows-review`)

**Actions:**
- Reviewed golden verdict stability assertions.
- Identified overlap between targeted invariants and full-object assertion.

**Learnings:**
- Existing assertions already cover primary behavior; strict equality adds fragility.


### 2026-02-11 - Implementation Complete

**By:** Codex (workflows-work)

**Actions:**
- Implemented code and/or docs changes required by this todo.
- Ran relevant validation checks (tests and/or linting).
- Verified acceptance criteria against updated code paths.

**Learnings:**
- This item is now resolved in the current branch.

