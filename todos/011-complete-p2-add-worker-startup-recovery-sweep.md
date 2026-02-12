---
status: complete
priority: p2
issue_id: "011"
tags: [ops-hardening, worker, reliability, recovery]
dependencies: []
---

# Add Worker Startup Recovery Sweep

Re-queue stale jobs at worker startup so crash-interrupted runs can resume.

## Problem Statement

The DB poller only claims `queued` (and older `created`) jobs. If a worker crashes after marking a job as `processing`, that job can remain stuck indefinitely.

## Findings

- `apps/worker/worker_app/poller.py` had no startup recovery pass.
- `docs/plans/2026-02-10-feat-amazon-avatar-listing-optimizer-mvp-plan.md` still listed startup recovery as unfinished.

## Technical Details

**Affected files:**
- `apps/worker/worker_app/poller.py`
- `tests/test_worker_recovery_sweep.py`
- `docs/plans/2026-02-10-feat-amazon-avatar-listing-optimizer-mvp-plan.md`
- `docs/runbooks/env.md`
- `.env.example`

## Acceptance Criteria

- [x] Poller runs a startup recovery sweep before claiming jobs.
- [x] Stale `processing` jobs are re-queued atomically (`status=processing` -> `status=queued`).
- [x] Recovered jobs clear stuck stage rows (`job_stages.status=in_progress` -> `pending`).
- [x] Stale `seeding` jobs are re-queued.
- [x] Automated tests cover recovered and no-op paths.

## Work Log

### 2026-02-12 - Implementation Complete

**By:** Codex (`workflows-work`)

**Actions:**
- Added startup recovery sweep with configurable stale thresholds and max-job cap.
- Reset in-progress stage rows for recovered processing jobs.
- Added async unit tests for recovery and no-op behavior.
- Updated plan/runbook/env example documentation.
