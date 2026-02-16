from __future__ import annotations

import asyncio
import sys
from typing import Any
from datetime import datetime, timedelta, timezone

from .config import get_optional_env, load_env
from .pipeline import run_pipeline_for_job, utc_now_iso
from .supabase_rest import delete_many, select_many, update_many


def read_int_env(name: str, default: int, *, minimum: int, maximum: int) -> int:
    raw = get_optional_env(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    if value < minimum:
        return minimum
    if value > maximum:
        return maximum
    return value


async def _recover_stale_jobs(
    status: str,
    *,
    stale_seconds: int,
    limit: int,
    reset_in_progress_stages: bool,
) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=stale_seconds)
    jobs = await select_many(
        "jobs",
        {
            "select": "id,status,updated_at",
            "status": f"eq.{status}",
            "updated_at": f"lt.{cutoff.isoformat()}",
            "order": "updated_at.asc",
            "limit": str(limit),
        },
    )

    recovered = 0
    for job in jobs:
        job_id = str(job.get("id") or "")
        if not job_id:
            continue

        updated = await update_many(
            "jobs",
            {"id": f"eq.{job_id}", "status": f"eq.{status}"},
            {"status": "queued", "updated_at": utc_now_iso()},
        )
        if not updated:
            continue

        recovered += 1
        if reset_in_progress_stages:
            await update_many(
                "job_stages",
                {"job_id": f"eq.{job_id}", "status": "eq.in_progress"},
                {
                    "status": "pending",
                    "started_at": None,
                    "completed_at": None,
                },
            )

    return recovered


async def run_startup_recovery_sweep() -> dict[str, int]:
    max_jobs = read_int_env("WORKER_RECOVERY_MAX_JOBS", 200, minimum=1, maximum=1000)
    processing_stale_seconds = read_int_env(
        "WORKER_RECOVERY_PROCESSING_STALE_SECONDS",
        900,
        minimum=60,
        maximum=86400,
    )
    seeding_stale_seconds = read_int_env(
        "WORKER_RECOVERY_SEEDING_STALE_SECONDS",
        180,
        minimum=30,
        maximum=86400,
    )

    processing_recovered = await _recover_stale_jobs(
        "processing",
        stale_seconds=processing_stale_seconds,
        limit=max_jobs,
        reset_in_progress_stages=True,
    )
    seeding_recovered = await _recover_stale_jobs(
        "seeding",
        stale_seconds=seeding_stale_seconds,
        limit=max_jobs,
        reset_in_progress_stages=False,
    )
    return {
        "processing_recovered": processing_recovered,
        "seeding_recovered": seeding_recovered,
        "total_recovered": processing_recovered + seeding_recovered,
    }


async def run_cleanup_sweep() -> dict[str, int]:
    vision_cache_ttl_days = read_int_env("VISION_CACHE_TTL_DAYS", 7, minimum=1, maximum=365)
    analytics_retention_days = read_int_env(
        "ANALYTICS_EVENTS_RETENTION_DAYS",
        30,
        minimum=1,
        maximum=3650,
    )
    now = datetime.now(timezone.utc)
    vision_cutoff = now - timedelta(days=vision_cache_ttl_days)
    analytics_cutoff = now - timedelta(days=analytics_retention_days)

    deleted_vision_cache = await delete_many(
        "vision_cache",
        {"created_at": f"lt.{vision_cutoff.isoformat()}"},
    )
    deleted_analytics_events = await delete_many(
        "analytics_events",
        {"created_at": f"lt.{analytics_cutoff.isoformat()}"},
    )
    return {
        "vision_cache_deleted": len(deleted_vision_cache),
        "analytics_events_deleted": len(deleted_analytics_events),
        "total_deleted": len(deleted_vision_cache) + len(deleted_analytics_events),
    }


async def _claim_job_with_status(
    status: str,
    extra_filters: dict[str, str] | None = None,
    *,
    order: str = "created_at.asc",
) -> str | None:
    filters: dict[str, str] = {
        "select": "id,status,created_at,asin_a,asin_b",
        "status": f"eq.{status}",
        "order": order,
        "limit": "1",
    }
    if extra_filters:
        filters.update(extra_filters)

    jobs = await select_many("jobs", filters)
    if not jobs:
        return None

    job_id = str(jobs[0].get("id"))
    if not job_id:
        return None

    updated = await update_many(
        "jobs",
        {"id": f"eq.{job_id}", "status": f"eq.{status}"},
        {"status": "processing", "updated_at": utc_now_iso()},
    )
    if not updated:
        return None
    return job_id


async def claim_next_job() -> str | None:
    # Prefer jobs created by the current API flow.
    job_id = await _claim_job_with_status("queued")
    if job_id:
        return job_id

    # Back-compat: older API versions created jobs as `created` and inserted
    # placeholder stage rows. Process those too, but only once they're older
    # than a short cutoff to avoid racing with any in-flight seeding.
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=30)
    job_id = await _claim_job_with_status(
        "created",
        {"created_at": f"lt.{cutoff.isoformat()}"},
        order="created_at.desc",
    )
    if job_id:
        return job_id

    return None


async def main_loop() -> int:
    load_env()
    print("worker: poller started (DB-backed; no Redis required)", flush=True)
    cleanup_interval_seconds = read_int_env(
        "WORKER_CLEANUP_INTERVAL_SECONDS",
        3600,
        minimum=60,
        maximum=86400,
    )
    try:
        recovery = await run_startup_recovery_sweep()
        print(
            "worker: startup recovery complete "
            f"(processing={recovery['processing_recovered']}, "
            f"seeding={recovery['seeding_recovered']}, "
            f"total={recovery['total_recovered']})",
            flush=True,
        )
    except Exception as e:
        print(f"worker: startup recovery error: {e}", file=sys.stderr, flush=True)

    next_cleanup_at = datetime.now(timezone.utc)
    while True:
        try:
            if datetime.now(timezone.utc) >= next_cleanup_at:
                try:
                    cleanup = await run_cleanup_sweep()
                    print(
                        "worker: cleanup sweep complete "
                        f"(vision_cache={cleanup['vision_cache_deleted']}, "
                        f"analytics_events={cleanup['analytics_events_deleted']}, "
                        f"total={cleanup['total_deleted']})",
                        flush=True,
                    )
                except Exception as e:
                    print(f"worker: cleanup sweep error: {e}", file=sys.stderr, flush=True)
                next_cleanup_at = datetime.now(timezone.utc) + timedelta(seconds=cleanup_interval_seconds)

            job_id = await claim_next_job()
            if not job_id:
                await asyncio.sleep(2.0)
                continue
            print(f"worker: claimed job {job_id}", flush=True)
            result: dict[str, Any] = await run_pipeline_for_job(job_id)
            print(f"worker: finished job {job_id} -> {result.get('status')}", flush=True)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"worker: loop error: {e}", file=sys.stderr, flush=True)
            await asyncio.sleep(2.0)


def main() -> None:
    raise SystemExit(asyncio.run(main_loop()))


if __name__ == "__main__":
    main()
