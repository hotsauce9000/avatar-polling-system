from __future__ import annotations

from typing import Any

import pytest

from worker_app import poller


@pytest.mark.asyncio
async def test_startup_recovery_requeues_stale_processing_and_seeding_jobs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("WORKER_RECOVERY_MAX_JOBS", "25")
    monkeypatch.setenv("WORKER_RECOVERY_PROCESSING_STALE_SECONDS", "600")
    monkeypatch.setenv("WORKER_RECOVERY_SEEDING_STALE_SECONDS", "120")

    update_calls: list[tuple[str, dict[str, str], dict[str, Any]]] = []

    async def fake_select_many(table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        assert table == "jobs"
        assert params["limit"] == "25"
        assert params["updated_at"].startswith("lt.")
        status = params["status"]
        if status == "eq.processing":
            return [{"id": "job-proc-1"}, {"id": "job-proc-2"}]
        if status == "eq.seeding":
            return [{"id": "job-seed-1"}]
        raise AssertionError(f"Unexpected status filter: {status}")

    async def fake_update_many(
        table: str,
        match_params: dict[str, str],
        patch: dict[str, Any],
    ) -> list[dict[str, Any]]:
        update_calls.append((table, dict(match_params), dict(patch)))
        if table == "jobs" and match_params["id"] == "eq.job-proc-1":
            return [{"id": "job-proc-1"}]
        if table == "jobs" and match_params["id"] == "eq.job-proc-2":
            return []
        if table == "jobs" and match_params["id"] == "eq.job-seed-1":
            return [{"id": "job-seed-1"}]
        if table == "job_stages":
            return [{"id": "stage-1"}]
        return []

    monkeypatch.setattr(poller, "select_many", fake_select_many)
    monkeypatch.setattr(poller, "update_many", fake_update_many)

    result = await poller.run_startup_recovery_sweep()

    assert result == {
        "processing_recovered": 1,
        "seeding_recovered": 1,
        "total_recovered": 2,
    }

    stage_reset_calls = [call for call in update_calls if call[0] == "job_stages"]
    assert len(stage_reset_calls) == 1
    _, stage_match, stage_patch = stage_reset_calls[0]
    assert stage_match == {"job_id": "eq.job-proc-1", "status": "eq.in_progress"}
    assert stage_patch == {
        "status": "pending",
        "started_at": None,
        "completed_at": None,
    }


@pytest.mark.asyncio
async def test_startup_recovery_noop_when_no_stale_jobs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_select_many(table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        assert table == "jobs"
        return []

    async def fake_update_many(
        table: str,
        match_params: dict[str, str],
        patch: dict[str, Any],
    ) -> list[dict[str, Any]]:
        raise AssertionError("No updates expected when no stale jobs are found")

    monkeypatch.setattr(poller, "select_many", fake_select_many)
    monkeypatch.setattr(poller, "update_many", fake_update_many)

    result = await poller.run_startup_recovery_sweep()

    assert result == {
        "processing_recovered": 0,
        "seeding_recovered": 0,
        "total_recovered": 0,
    }
