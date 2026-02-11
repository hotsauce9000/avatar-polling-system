---
status: complete
priority: p2
issue_id: "006"
tags: [code-review, testing, ci, quality]
dependencies: []
---

# Fix Golden Test Runtime Dependency Gap

Ensure documented golden test command works in clean environments.

## Problem Statement

The new golden tests are async and require `pytest-asyncio`, but the runbook command does not include dependency bootstrap guidance. In this environment, the documented command fails.

## Findings

- Test command documented at `docs/runbooks/testing.md:8` and `golden_tests/README.md:12`.
- Async tests use `@pytest.mark.asyncio` at `tests/test_golden_pipeline.py:19` and `tests/test_golden_pipeline.py:49`.
- Local execution of `python -m pytest tests/test_golden_pipeline.py -q` failed with "async def functions are not natively supported" and `PytestUnknownMarkWarning`.
- `pytest-asyncio` is only declared in `requirements-dev.txt:2`.

## Proposed Solutions

### Option 1: Update Runbook with Install Prereqs

**Approach:** Add explicit setup steps (install runtime + dev requirements) before pytest commands.

**Pros:**
- Fastest fix.
- Improves onboarding reliability.

**Cons:**
- Relies on humans/CI to follow docs.

**Effort:** Small

**Risk:** Low

---

### Option 2: Add Unified `requirements-test.txt` and CI Gate

**Approach:** Create dedicated test dependency set and use it in CI + docs.

**Pros:**
- Stable repeatable test environment.

**Cons:**
- Adds dependency file maintenance.

**Effort:** Medium

**Risk:** Low

---

### Option 3: Add Tooling Wrapper (`make test` / script)

**Approach:** One command handles installation and test execution.

**Pros:**
- Reduces operator error.

**Cons:**
- Extra script maintenance.

**Effort:** Medium

**Risk:** Low

## Recommended Action

Implement Option 2 and reference it from runbooks.

## Technical Details

**Affected files:**
- `docs/runbooks/testing.md:8`
- `golden_tests/README.md:12`
- `tests/test_golden_pipeline.py:19`
- `requirements-dev.txt:2`

## Resources

- Test output from `python -m pytest tests/test_golden_pipeline.py -q` (2026-02-11 review run)
- `docs/runbooks/testing.md`
- `golden_tests/README.md`

## Acceptance Criteria

- [x] Documented golden test command passes in a fresh environment.
- [x] Async pytest plugin dependency is explicitly installed by test setup.
- [x] CI includes golden test execution as a required gate.
- [x] No `UnknownMarkWarning` for `pytest.mark.asyncio`.

## Work Log

### 2026-02-11 - Initial Discovery

**By:** Codex (`workflows-review`)

**Actions:**
- Executed documented golden test command.
- Captured async plugin failure.
- Verified dependency declaration location.

**Learnings:**
- Test gate exists in docs but not yet operationally self-contained.


### 2026-02-11 - Implementation Complete

**By:** Codex (workflows-work)

**Actions:**
- Implemented code and/or docs changes required by this todo.
- Ran relevant validation checks (tests and/or linting).
- Verified acceptance criteria against updated code paths.

**Learnings:**
- This item is now resolved in the current branch.

