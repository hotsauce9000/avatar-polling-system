from __future__ import annotations

from typing import Any

import httpx

from .config import get_env


def _rest_base_url() -> str:
    return f"{get_env('SUPABASE_URL').rstrip('/')}/rest/v1"


def _service_headers() -> dict[str, str]:
    service_key = get_env("SUPABASE_SERVICE_ROLE_KEY")
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def insert_one(table: str, row: dict[str, Any]) -> dict[str, Any]:
    url = f"{_rest_base_url()}/{table}"
    headers = {**_service_headers(), "Prefer": "return=representation"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, headers=headers, json=row)
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, list):
        return data[0] if data else {}
    return data


async def select_many(table: str, params: dict[str, str]) -> list[dict[str, Any]]:
    url = f"{_rest_base_url()}/{table}"
    headers = _service_headers()
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers, params=params)
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, list):
        return data
    return [data]


async def select_one(table: str, params: dict[str, str]) -> dict[str, Any] | None:
    rows = await select_many(table, params)
    if not rows:
        return None
    return rows[0]

