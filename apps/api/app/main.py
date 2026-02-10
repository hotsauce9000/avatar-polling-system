from __future__ import annotations

from uuid import uuid4

from fastapi import Depends, FastAPI

from .auth import AuthenticatedUser, require_user
from .config import load_env


load_env()

app = FastAPI(title="Avatar Polling System API", version="0.1.0")


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


@app.post("/jobs")
def create_job(user: AuthenticatedUser = Depends(require_user)) -> dict:
    # Placeholder until we add Supabase + credits + ARQ enqueue.
    job_id = str(uuid4())
    return {"job_id": job_id, "status": "created", "user_id": user.user_id}


@app.get("/jobs/{job_id}")
def get_job(job_id: str, user: AuthenticatedUser = Depends(require_user)) -> dict:
    return {"job_id": job_id, "status": "unknown", "user_id": user.user_id}


@app.get("/jobs/{job_id}/stages")
def get_job_stages(job_id: str, user: AuthenticatedUser = Depends(require_user)) -> dict:
    return {"job_id": job_id, "stages": [], "user_id": user.user_id}


@app.get("/credits/balance")
def get_credits_balance(user: AuthenticatedUser = Depends(require_user)) -> dict:
    # Placeholder until we add credits table + atomic UPDATE logic.
    return {"user_id": user.user_id, "credit_balance": None}

