from __future__ import annotations

import os
from uuid import uuid4

from arq.connections import RedisSettings

from .config import load_env
from .pipeline import run_pipeline_for_job


load_env()


async def run_pipeline(ctx: dict, job_id: str) -> dict:
    # ARQ entrypoint (expects Redis). For local dev without Redis, prefer:
    #   python -m worker_app.poller
    return await run_pipeline_for_job(job_id)


async def startup(ctx: dict) -> None:
    ctx["worker_instance_id"] = str(uuid4())


class WorkerSettings:
    functions = [run_pipeline]
    on_startup = startup

    redis_settings = RedisSettings.from_dsn(
        os.getenv("REDIS_URL", "redis://localhost:6379/0")
    )
