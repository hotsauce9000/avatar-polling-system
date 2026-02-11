from __future__ import annotations

from dataclasses import dataclass

import httpx
from fastapi import Header, HTTPException

from .config import get_env


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str
    email: str | None


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization header")
    return authorization.removeprefix("Bearer ").strip()


async def require_user(
    authorization: str | None = Header(default=None),
) -> AuthenticatedUser:
    """
    Validates Supabase JWT for Railway API endpoints.

    This is intentionally minimal for the initial skeleton. We will
    harden this once we add real DB access + RLS interactions.
    """
    token = _extract_bearer_token(authorization)

    supabase_url = get_env("SUPABASE_URL").rstrip("/")
    anon_key = get_env("SUPABASE_ANON_KEY")

    # Validate token by asking Supabase Auth for the user. This avoids needing
    # the JWT secret locally (simpler for early MVP).
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": anon_key,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{supabase_url}/auth/v1/user", headers=headers)
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503, detail="Auth provider unreachable"
        ) from exc

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid JWT")

    data = resp.json()
    return AuthenticatedUser(user_id=str(data.get("id")), email=data.get("email"))
