from __future__ import annotations

from typing import TypedDict


class CreditPack(TypedDict):
    id: str
    label: str
    credits: int
    price_usd: int
    blurb: str


# Initial launch packs (v1). Keep simple and explicit for MVP.
INITIAL_CREDIT_PACKS: list[CreditPack] = [
    {
        "id": "starter",
        "label": "Starter",
        "credits": 50,
        "price_usd": 19,
        "blurb": "Good for first tests and iteration.",
    },
    {
        "id": "growth",
        "label": "Growth",
        "credits": 150,
        "price_usd": 49,
        "blurb": "Best value for weekly optimization.",
    },
    {
        "id": "scale",
        "label": "Scale",
        "credits": 400,
        "price_usd": 99,
        "blurb": "For teams running many experiments.",
    },
]

