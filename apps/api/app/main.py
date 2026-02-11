from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .auth import AuthenticatedUser, require_user
from .config import get_env, get_optional_env, load_env
from .credit_packs import CreditPack, INITIAL_CREDIT_PACKS
from .supabase_rest import insert_one, rpc, select_many, select_one, update_one


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
EVENT_NAME_RE = re.compile(r"^[a-z0-9_.:-]{2,64}$")


class CreateJobRequest(BaseModel):
    asin_a: str
    asin_b: str


class CreateCheckoutSessionRequest(BaseModel):
    pack_id: str
    success_url: str | None = None
    cancel_url: str | None = None


class TrackEventRequest(BaseModel):
    event_name: str = Field(min_length=2, max_length=64)
    job_id: str | None = None
    stage_number: int | None = Field(default=None, ge=0, le=5)
    properties: dict[str, Any] = Field(default_factory=dict)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def normalize_event_name(raw: str) -> str:
    normalized = raw.strip().lower().replace(" ", "_")
    if not EVENT_NAME_RE.fullmatch(normalized):
        raise HTTPException(status_code=400, detail="Invalid analytics event name")
    return normalized


def find_credit_pack(pack_id: str) -> CreditPack | None:
    for pack in INITIAL_CREDIT_PACKS:
        if pack["id"] == pack_id:
            return pack
    return None


def default_checkout_urls() -> tuple[str, str]:
    base_url = get_optional_env("WEB_APP_BASE_URL", "http://localhost:3000") or "http://localhost:3000"
    base_url = base_url.rstrip("/")
    return (
        f"{base_url}/dashboard?checkout=success",
        f"{base_url}/dashboard?checkout=cancel",
    )


def _parse_stripe_signature(sig_header: str) -> tuple[int, list[str]]:
    timestamp: int | None = None
    v1_signatures: list[str] = []

    for part in sig_header.split(","):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        key = key.strip()
        value = value.strip()
        if key == "t":
            try:
                timestamp = int(value)
            except ValueError as exc:
                raise HTTPException(
                    status_code=400, detail="Invalid Stripe signature timestamp"
                ) from exc
        elif key == "v1" and value:
            v1_signatures.append(value)

    if timestamp is None or not v1_signatures:
        raise HTTPException(status_code=400, detail="Malformed Stripe signature header")
    return timestamp, v1_signatures


def verify_stripe_signature(payload: bytes, sig_header: str, secret: str) -> None:
    timestamp, signatures = _parse_stripe_signature(sig_header)
    try:
        payload_text = payload.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid Stripe payload encoding") from exc
    signed = f"{timestamp}.{payload_text}".encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()

    if not any(hmac.compare_digest(expected, s) for s in signatures):
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook signature")

    tolerance_seconds = 300
    if abs(int(time.time()) - timestamp) > tolerance_seconds:
        raise HTTPException(status_code=400, detail="Stale Stripe webhook signature")


async def ensure_user_profile(user_id: str) -> dict[str, Any]:
    profile = await select_one("user_profiles", {"select": "*", "id": f"eq.{user_id}"})
    if profile:
        return profile
    return await insert_one("user_profiles", {"id": user_id})


async def ensure_job_owned_by_user(*, job_id: str, user_id: str) -> None:
    owned = await select_one(
        "jobs",
        {
            "select": "id,user_id",
            "id": f"eq.{job_id}",
            "user_id": f"eq.{user_id}",
        },
    )
    if not owned:
        raise HTTPException(status_code=400, detail="Invalid job_id for current user")


async def record_analytics_event(
    *,
    user_id: str,
    event_name: str,
    job_id: str | None = None,
    stage_number: int | None = None,
    properties: dict[str, Any] | None = None,
) -> None:
    payload: dict[str, Any] = {
        "user_id": user_id,
        "event_name": normalize_event_name(event_name),
        "properties": properties or {},
    }
    if job_id:
        payload["job_id"] = job_id
    if stage_number is not None:
        payload["stage_number"] = stage_number

    try:
        await insert_one("analytics_events", payload)
    except Exception:
        # Analytics should never block product flow.
        return


async def create_stripe_checkout_session(
    *,
    user: AuthenticatedUser,
    pack: CreditPack,
    success_url: str,
    cancel_url: str,
) -> dict[str, str]:
    secret_key = get_env("STRIPE_SECRET_KEY")
    payload = {
        "mode": "payment",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "client_reference_id": user.user_id,
        "allow_promotion_codes": "true",
        "metadata[user_id]": user.user_id,
        "metadata[pack_id]": pack["id"],
        "metadata[credits]": str(pack["credits"]),
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": str(pack["price_usd"] * 100),
        "line_items[0][price_data][product_data][name]": (
            f"{pack['label']} credits ({pack['credits']})"
        ),
        "line_items[0][price_data][product_data][description]": pack["blurb"],
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            "https://api.stripe.com/v1/checkout/sessions",
            auth=(secret_key, ""),
            data=payload,
        )

    if resp.status_code >= 400:
        snippet = (resp.text or "")[:400]
        raise HTTPException(
            status_code=502,
            detail=f"Stripe session creation failed (HTTP {resp.status_code}): {snippet}",
        )

    data = resp.json()
    checkout_url = data.get("url")
    session_id = data.get("id")
    if not isinstance(checkout_url, str) or not checkout_url:
        raise HTTPException(status_code=502, detail="Stripe did not return checkout URL")
    if not isinstance(session_id, str) or not session_id:
        raise HTTPException(status_code=502, detail="Stripe did not return session id")
    return {"checkout_url": checkout_url, "session_id": session_id}


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
            # Avoid a race where the worker claims the job before stage rows exist.
            "status": "seeding",
        },
    )
    job_id = str(job.get("id"))

    # Create stage rows up-front so the UI can render the full pipeline
    # immediately. The worker will update these as it runs.
    stages = {
        0: "listing_fetch",
        1: "main_image_ctr",
        2: "gallery_cvr",
        3: "text_alignment",
        4: "avatars",
        5: "verdict",
    }
    for stage_number, stage_name in stages.items():
        await insert_one(
            "job_stages",
            {
                "job_id": job_id,
                "stage_number": stage_number,
                "status": "pending",
                "output": {"stage_name": stage_name},
            },
        )

    await update_one(
        "jobs",
        {"id": f"eq.{job_id}"},
        {"status": "queued", "updated_at": utc_now_iso()},
    )
    await record_analytics_event(
        user_id=user.user_id,
        job_id=job_id,
        event_name="job_created",
        properties={"asin_a": asin_a, "asin_b": asin_b},
    )

    return {"job_id": job_id, "status": "queued"}


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


@app.get("/jobs/recent")
async def get_recent_jobs(
    user: AuthenticatedUser = Depends(require_user),
    limit: int = 6,
) -> dict:
    safe_limit = max(1, min(limit, 50))
    rows = await select_many(
        "jobs",
        {
            "select": "id,asin_a,asin_b,status,created_at",
            "user_id": f"eq.{user.user_id}",
            "order": "created_at.desc",
            "limit": str(safe_limit),
        },
    )
    return {"jobs": rows}


@app.get("/experiments/recent")
async def get_recent_experiments(
    user: AuthenticatedUser = Depends(require_user),
    limit: int = 6,
) -> dict:
    safe_limit = max(1, min(limit, 50))
    rows = await select_many(
        "experiments",
        {
            "select": "id,asin_a,asin_b,created_at,change_tags",
            "user_id": f"eq.{user.user_id}",
            "order": "created_at.desc",
            "limit": str(safe_limit),
        },
    )
    return {"experiments": rows}


@app.get("/credits/balance")
async def get_credits_balance(user: AuthenticatedUser = Depends(require_user)) -> dict:
    profile = await ensure_user_profile(user.user_id)
    return {
        "user_id": user.user_id,
        "credit_balance": profile.get("credit_balance"),
        "daily_credit_used": profile.get("daily_credit_used"),
        "daily_credit_reset_date": profile.get("daily_credit_reset_date"),
    }


@app.get("/credits/packs")
async def get_credit_packs(_user: AuthenticatedUser = Depends(require_user)) -> dict:
    return {
        "currency": "USD",
        "version": "v1",
        "packs": INITIAL_CREDIT_PACKS,
    }


@app.post("/credits/checkout")
async def create_credit_checkout(
    body: CreateCheckoutSessionRequest,
    user: AuthenticatedUser = Depends(require_user),
) -> dict:
    pack = find_credit_pack(body.pack_id)
    if not pack:
        raise HTTPException(status_code=400, detail="Unknown credit pack")

    default_success, default_cancel = default_checkout_urls()
    success_url = body.success_url or default_success
    cancel_url = body.cancel_url or default_cancel

    try:
        session = await create_stripe_checkout_session(
            user=user,
            pack=pack,
            success_url=success_url,
            cancel_url=cancel_url,
        )
    except RuntimeError as exc:
        # Missing env or similar local misconfiguration should be surfaced
        # as a handled API error so browsers receive CORS headers + JSON.
        raise HTTPException(
            status_code=503,
            detail=f"Stripe checkout is not configured: {exc}",
        ) from exc

    await record_analytics_event(
        user_id=user.user_id,
        event_name="stripe_checkout_session_created",
        properties={
            "pack_id": pack["id"],
            "credits": pack["credits"],
            "price_usd": pack["price_usd"],
            "stripe_session_id": session["session_id"],
        },
    )

    return {
        "checkout_url": session["checkout_url"],
        "session_id": session["session_id"],
        "pack_id": pack["id"],
    }


@app.get("/credits/operations")
async def get_credit_operations(
    user: AuthenticatedUser = Depends(require_user),
) -> dict:
    rows = await select_many(
        "credit_operations",
        {
            "select": "idempotency_key,operation_type,amount,job_id,stripe_session_id,created_at",
            "user_id": f"eq.{user.user_id}",
            "order": "created_at.desc",
            "limit": "50",
        },
    )
    return {"operations": rows}


@app.post("/analytics/events")
async def track_event(
    body: TrackEventRequest,
    user: AuthenticatedUser = Depends(require_user),
) -> dict:
    if body.job_id:
        await ensure_job_owned_by_user(job_id=body.job_id, user_id=user.user_id)

    await record_analytics_event(
        user_id=user.user_id,
        event_name=body.event_name,
        job_id=body.job_id,
        stage_number=body.stage_number,
        properties=body.properties,
    )
    return {"ok": True}


@app.get("/analytics/events")
async def get_analytics_events(
    user: AuthenticatedUser = Depends(require_user),
    limit: int = 200,
) -> dict:
    safe_limit = max(1, min(limit, 500))
    rows = await select_many(
        "analytics_events",
        {
            "select": "event_name,stage_number,properties,created_at",
            "user_id": f"eq.{user.user_id}",
            "order": "created_at.desc",
            "limit": str(safe_limit),
        },
    )
    return {"events": rows}


@app.post("/webhooks/stripe")
async def stripe_webhook(request: Request) -> dict:
    sig_header = request.headers.get("stripe-signature")
    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")

    payload = await request.body()
    webhook_secret = get_env("STRIPE_WEBHOOK_SECRET")
    verify_stripe_signature(payload, sig_header, webhook_secret)

    try:
        event = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook JSON") from exc

    event_type = str(event.get("type") or "")
    data_obj = event.get("data", {}).get("object")
    if not isinstance(data_obj, dict):
        return {"ok": True, "ignored": True, "reason": "missing_data_object"}

    if event_type != "checkout.session.completed":
        return {"ok": True, "ignored": True, "event_type": event_type}

    session_id = data_obj.get("id")
    metadata = data_obj.get("metadata")
    payment_status = str(data_obj.get("payment_status") or "")
    if not isinstance(session_id, str) or not session_id:
        raise HTTPException(status_code=400, detail="Stripe session id is missing")
    if payment_status and payment_status not in {"paid", "no_payment_required"}:
        return {
            "ok": True,
            "ignored": True,
            "reason": f"payment_status={payment_status}",
            "session_id": session_id,
        }
    if not isinstance(metadata, dict):
        raise HTTPException(status_code=400, detail="Stripe metadata is missing")

    user_id = metadata.get("user_id")
    pack_id_raw = metadata.get("pack_id")
    credits_raw = metadata.get("credits")
    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(status_code=400, detail="Missing user_id metadata")
    if not isinstance(pack_id_raw, str) or not pack_id_raw.strip():
        raise HTTPException(status_code=400, detail="Missing pack_id metadata")

    pack_id = pack_id_raw.strip()
    pack = find_credit_pack(pack_id)
    if not pack:
        raise HTTPException(status_code=400, detail="Unknown pack_id metadata")
    credits = int(pack["credits"])
    if credits <= 0:
        raise HTTPException(status_code=400, detail="Invalid pack credits")

    metadata_credits: int | None = None
    if credits_raw is not None:
        try:
            metadata_credits = int(str(credits_raw))
        except (TypeError, ValueError):
            metadata_credits = None

    currency_raw = data_obj.get("currency")
    if currency_raw is not None:
        currency = str(currency_raw).lower()
        if currency != "usd":
            return {
                "ok": True,
                "ignored": True,
                "reason": f"unsupported_currency={currency}",
                "session_id": session_id,
            }

    amount_total_raw = data_obj.get("amount_total")
    amount_total: int | None = None
    expected_unit_amount = int(pack["price_usd"]) * 100
    if amount_total_raw is not None:
        try:
            amount_total = int(amount_total_raw)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Invalid amount_total") from exc
        if amount_total < 0:
            raise HTTPException(status_code=400, detail="Invalid amount_total")
    if payment_status == "paid" and (amount_total is None or amount_total <= 0):
        return {
            "ok": True,
            "ignored": True,
            "reason": "invalid_paid_amount_total",
            "session_id": session_id,
        }

    idempotency_key = str(
        uuid.uuid5(
            uuid.NAMESPACE_URL,
            f"stripe:checkout.session.completed:{session_id}",
        )
    )
    rpc_result = await rpc(
        "apply_credit_purchase",
        {
            "p_user_id": user_id,
            "p_amount": credits,
            "p_idempotency_key": idempotency_key,
            "p_stripe_session_id": session_id,
        },
    )
    resolved = rpc_result
    if isinstance(rpc_result, list) and rpc_result and isinstance(rpc_result[0], dict):
        resolved = rpc_result[0]
    applied = bool(resolved.get("applied")) if isinstance(resolved, dict) else False
    reason = str(resolved.get("reason") or "") if isinstance(resolved, dict) else ""

    await record_analytics_event(
        user_id=user_id,
        event_name="stripe_checkout_completed",
        properties={
            "stripe_session_id": session_id,
            "pack_id": str(pack_id) if pack_id is not None else None,
            "credits": credits,
            "metadata_credits": metadata_credits,
            "amount_total": amount_total,
            "expected_unit_amount": expected_unit_amount,
            "metadata_credits_mismatch": (
                metadata_credits is not None and metadata_credits != credits
            ),
            "applied": applied,
            "reason": reason or None,
        },
    )
    return {
        "ok": True,
        "session_id": session_id,
        "applied": applied,
        "reason": reason or None,
    }
