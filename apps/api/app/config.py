from __future__ import annotations

import os

from dotenv import load_dotenv


def load_env() -> None:
    # Local dev convenience. Production should rely on real env vars.
    load_dotenv(override=False)


def get_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_optional_env(name: str, default: str | None = None) -> str | None:
    return os.getenv(name, default)

