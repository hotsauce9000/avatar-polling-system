from __future__ import annotations

import asyncio
import sys
from typing import Any
from datetime import datetime, timedelta, timezone

from .config import load_env
from .pipeline import run_pipeline_for_job, utc_now_iso
from .supabase_rest import select_many, update_many


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
    while True:
        try:
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
