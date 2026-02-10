from __future__ import annotations

import os
from uuid import uuid4

from arq.connections import RedisSettings
from dotenv import load_dotenv


load_dotenv(override=False)


async def run_pipeline(ctx: dict, job_id: str) -> dict:
    """
    Placeholder ARQ job.

    Eventually this will orchestrate stages 0-5 and persist results to Supabase.
    """
    return {"job_id": job_id, "status": "completed"}


async def startup(ctx: dict) -> None:
    # Placeholder for: startup recovery sweep (Postgres authoritative job state).
    ctx["worker_instance_id"] = str(uuid4())


class WorkerSettings:
    functions = [run_pipeline]
    on_startup = startup

    redis_settings = RedisSettings.from_dsn(
        os.getenv("REDIS_URL", "redis://localhost:6379/0")
    )

