from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from worker_app.pipeline import stage4_avatars, stage5_verdict


FIXTURE_PATH = Path(__file__).resolve().parents[1] / "golden_tests" / "fixtures" / "golden_pair_001.json"


def load_fixture() -> dict[str, Any]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def stable_verdict_contract(verdict: dict[str, Any]) -> dict[str, Any]:
    scores = verdict.get("scores", {})
    asin_a = scores.get("asin_a", {}) if isinstance(scores, dict) else {}
    asin_b = scores.get("asin_b", {}) if isinstance(scores, dict) else {}
    return {
        "winner": verdict.get("winner"),
        "confidence": verdict.get("confidence"),
        "asin_a_total": asin_a.get("total"),
        "asin_b_total": asin_b.get("total"),
        "prioritized_fixes": verdict.get("prioritized_fixes"),
    }


@pytest.mark.asyncio
async def test_golden_pair_001_verdict_stability(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    fixture = load_fixture()

    stage1 = fixture["stages"]["stage1"]
    stage2 = fixture["stages"]["stage2"]
    stage3 = fixture["stages"]["stage3"]

    stage4 = await stage4_avatars(stage1, stage2, stage3)
    job = {
        "id": "golden-job-001",
        "asin_a": fixture["asin_a"],
        "asin_b": fixture["asin_b"],
    }

    verdict_a = await stage5_verdict(job, stage1, stage2, stage3, stage4)
    verdict_b = await stage5_verdict(job, stage1, stage2, stage3, stage4)

    expected = fixture["expected"]
    scores = verdict_a["scores"]

    assert verdict_a["winner"] == expected["winner"]
    assert verdict_a["winner"] == verdict_b["winner"]
    assert scores["asin_a"]["total"] == pytest.approx(expected["total_a"], abs=0.001)
    assert scores["asin_b"]["total"] == pytest.approx(expected["total_b"], abs=0.001)
    assert verdict_a["confidence"] == pytest.approx(expected["confidence"], abs=0.001)
    assert stable_verdict_contract(verdict_a) == stable_verdict_contract(verdict_b)


@pytest.mark.asyncio
async def test_golden_pair_001_stage_schema_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    fixture = load_fixture()

    stage1 = fixture["stages"]["stage1"]
    stage2 = fixture["stages"]["stage2"]
    stage3 = fixture["stages"]["stage3"]
    stage4 = await stage4_avatars(stage1, stage2, stage3)

    job = {
        "id": "golden-job-001",
        "asin_a": fixture["asin_a"],
        "asin_b": fixture["asin_b"],
    }
    verdict = await stage5_verdict(job, stage1, stage2, stage3, stage4)

    assert stage4["stage_name"] == "avatars"
    assert isinstance(stage4.get("avatars"), list)
    assert len(stage4["avatars"]) == 3

    required_verdict_keys = {
        "stage_name",
        "provider",
        "job_id",
        "asin_a",
        "asin_b",
        "scores",
        "winner",
        "confidence",
        "provider_summary",
        "prioritized_fixes",
    }
    assert required_verdict_keys.issubset(set(verdict.keys()))
