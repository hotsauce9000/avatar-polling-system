from __future__ import annotations

import re

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .auth import AuthenticatedUser, require_user
from .config import load_env
from .supabase_rest import insert_one, select_many, select_one


load_env()

app = FastAPI(title="Avatar Polling System API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ASIN_RE = re.compile(r"^[A-Z0-9]{10}$")


class CreateJobRequest(BaseModel):
    asin_a: str
    asin_b: str


def parse_asin(value: str) -> str:
    raw = value.strip()

    # Accept raw ASIN.
    if ASIN_RE.fullmatch(raw.upper()):
        return raw.upper()

    # Accept common Amazon URL formats.
    m = re.search(r"/dp/([A-Z0-9]{10})", raw, re.IGNORECASE)
    if m:
        return m.group(1).upper()

    m = re.search(r"/gp/product/([A-Z0-9]{10})", raw, re.IGNORECASE)
    if m:
        return m.group(1).upper()

    raise HTTPException(status_code=400, detail="Invalid ASIN or Amazon URL")


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


@app.post("/jobs")
async def create_job(
    body: CreateJobRequest,
    user: AuthenticatedUser = Depends(require_user),
) -> dict:
    asin_a = parse_asin(body.asin_a)
    asin_b = parse_asin(body.asin_b)

    if asin_a == asin_b:
        raise HTTPException(status_code=400, detail="Cannot compare listing to itself")

    job = await insert_one(
        "jobs",
        {
            "user_id": user.user_id,
            "asin_a": asin_a,
            "asin_b": asin_b,
            "status": "created",
        },
    )
    job_id = str(job.get("id"))

    # Minimal vertical slice: write placeholder stages so the UI can prove
    # progressive delivery + Realtime subscription before the real pipeline.
    await insert_one(
        "job_stages",
        {
            "job_id": job_id,
            "stage_number": 0,
            "status": "completed",
            "output": {"note": "Stage 0 placeholder (job created)."},
        },
    )
    await insert_one(
        "job_stages",
        {
            "job_id": job_id,
            "stage_number": 1,
            "status": "completed",
            "output": {
                "note": "Stage 1 placeholder (vision CTR).",
                "ctr_winner": "TIE",
                "confidence": 0.0,
            },
        },
    )

    return {"job_id": job_id, "status": job.get("status", "created")}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str, user: AuthenticatedUser = Depends(require_user)) -> dict:
    job = await select_one("jobs", {"select": "*", "id": f"eq.{job_id}"})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if str(job.get("user_id")) != user.user_id:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/jobs/{job_id}/stages")
async def get_job_stages(
    job_id: str, user: AuthenticatedUser = Depends(require_user)
) -> dict:
    job = await select_one("jobs", {"select": "id,user_id", "id": f"eq.{job_id}"})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if str(job.get("user_id")) != user.user_id:
        raise HTTPException(status_code=404, detail="Job not found")

    stages = await select_many(
        "job_stages",
        {
            "select": "*",
            "job_id": f"eq.{job_id}",
            "order": "stage_number.asc",
        },
    )
    return {"job_id": job_id, "stages": stages}


@app.get("/credits/balance")
async def get_credits_balance(user: AuthenticatedUser = Depends(require_user)) -> dict:
    profile = await select_one(
        "user_profiles", {"select": "*", "id": f"eq.{user.user_id}"}
    )
    if not profile:
        # Backfill safety: profile rows are usually created by trigger, but
        # older users (created pre-migration) won't have one.
        profile = await insert_one("user_profiles", {"id": user.user_id})

    return {
        "user_id": user.user_id,
        "credit_balance": profile.get("credit_balance"),
        "daily_credit_used": profile.get("daily_credit_used"),
        "daily_credit_reset_date": profile.get("daily_credit_reset_date"),
    }
