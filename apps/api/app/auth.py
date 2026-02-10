from __future__ import annotations

from dataclasses import dataclass

import jwt
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


def require_user(authorization: str | None = Header(default=None)) -> AuthenticatedUser:
    """
    Validates Supabase JWT for Railway API endpoints.

    This is intentionally minimal for the initial skeleton. We will
    harden this once we add real DB access + RLS interactions.
    """
    token = _extract_bearer_token(authorization)

    jwt_secret = get_env("SUPABASE_JWT_SECRET")
    try:
        payload = jwt.decode(
            token,
            jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid JWT") from exc

    return AuthenticatedUser(
        user_id=str(payload.get("sub")),
        email=payload.get("email"),
    )

