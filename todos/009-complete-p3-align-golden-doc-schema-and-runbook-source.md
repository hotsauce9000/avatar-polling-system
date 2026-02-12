---
status: complete
priority: p3
issue_id: "009"
tags: [code-review, docs, quality, testing]
dependencies: []
---

# Align Golden Docs Schema and Single Source of Truth

Reduce drift between markdown golden docs, fixture JSON, and runbook command docs.

## Problem Statement

Golden metadata is split across markdown and JSON with partially different schema naming and duplicated execution guidance. This increases documentation drift risk over time.

## Findings

- Markdown frontmatter uses `expected_ctr_winner`/`expected_cvr_winner`/`expected_overall_winner` at `golden_tests/golden_pair_001.md:5` to `golden_tests/golden_pair_001.md:7`.
- JSON fixture uses `expected.winner/total_a/total_b/confidence` at `golden_tests/fixtures/golden_pair_001.json`.
- Test command is duplicated in `golden_tests/README.md:12` and `docs/runbooks/testing.md:8`.

## Proposed Solutions

### Option 1: Make JSON Fixture Canonical

**Approach:** Keep canonical test metadata only in JSON and reduce markdown to links/context.

**Pros:**
- Eliminates schema drift.
- Easier automation.

**Cons:**
- Less human-readable detail in markdown.

**Effort:** Small

**Risk:** Low

---

### Option 2: Enforce Sync Validation Script

**Approach:** Add script/test that validates markdown and JSON consistency.

**Pros:**
- Preserves both formats.

**Cons:**
- Adds maintenance burden.

**Effort:** Medium

**Risk:** Low

---

### Option 3: Keep Both, Manual Review

**Approach:** Document that humans must keep files in sync.

**Pros:**
- No code changes.

**Cons:**
- High drift probability.

**Effort:** Small

**Risk:** Medium

## Recommended Action

Implement Option 1.

## Technical Details

**Affected files:**
- `golden_tests/golden_pair_001.md:5`
- `golden_tests/fixtures/golden_pair_001.json`
- `golden_tests/README.md:12`
- `docs/runbooks/testing.md:8`

## Resources

- `golden_tests/golden_pair_001.md`
- `golden_tests/fixtures/golden_pair_001.json`
- `golden_tests/README.md`
- `docs/runbooks/testing.md`

## Acceptance Criteria

- [x] Canonical golden schema is clearly defined in one location.
- [x] Non-canonical docs reference canonical source rather than duplicating fields.
- [x] Test execution instructions have one authoritative location.

## Work Log

### 2026-02-11 - Initial Discovery

**By:** Codex (`workflows-review`)

**Actions:**
- Compared markdown and JSON golden schemas.
- Identified duplicate command documentation.

**Learnings:**
- Drift is manageable now but likely to grow as fixtures scale.


### 2026-02-11 - Implementation Complete

**By:** Codex (workflows-work)

**Actions:**
- Implemented code and/or docs changes required by this todo.
- Ran relevant validation checks (tests and/or linting).
- Verified acceptance criteria against updated code paths.

**Learnings:**
- This item is now resolved in the current branch.

