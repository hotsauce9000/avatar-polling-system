---
status: complete
priority: p2
issue_id: "012"
tags: [quality-gates, worker, ci, prompts, testing]
dependencies: ["011"]
---

# Finish Phase 8 Quality and Ops Hardening

Close remaining local engineering items in Phase 8 of the MVP plan.

## Problem Statement

The plan still had unchecked quality/ops tasks for stage-gate tests, prompt hash integrity, cleanup sweeps, and dependency audits in CI.

## Technical Details

**Affected files:**
- `apps/worker/worker_app/pipeline.py`
- `apps/worker/worker_app/poller.py`
- `apps/worker/worker_app/supabase_rest.py`
- `tests/test_pipeline_stage_gates.py`
- `tests/test_worker_recovery_sweep.py`
- `.github/workflows/python-tests.yml`
- `.env.example`
- `docs/runbooks/env.md`
- `docs/runbooks/testing.md`
- `docs/plans/2026-02-10-feat-amazon-avatar-listing-optimizer-mvp-plan.md`

## Acceptance Criteria

- [x] Stage-gate tests exist for stages 0-5 and run in CI test suite.
- [x] Prompt files are hashed and integrity-checked against pinned hashes when provided.
- [x] Worker cleanup sweep enforces retention on cache/analytics tables.
- [x] CI runs `pip audit` and `npm audit`.
- [x] Plan checkboxes updated to reflect completion.

## Work Log

### 2026-02-12 - Implementation Complete

**By:** Codex (`workflows-work`)

**Actions:**
- Added runtime schema validation for all stage outputs before persistence.
- Added prompt SHA-256 integrity checks with mismatch hard-fail behavior.
- Added cleanup sweep for `vision_cache` and `analytics_events` with configurable TTLs.
- Added stage-gate and operational tests.
- Updated CI to run full test suite and dependency audits.
