from __future__ import annotations

from typing import Any

import pytest

from worker_app.pipeline import (
    PromptIntegrityError,
    stage0_listing_fetch,
    stage1_main_image_ctr,
    stage2_gallery_cvr,
    stage3_text_alignment,
    stage4_avatars,
    stage5_verdict,
    validate_stage_output,
)


def _fake_listing(asin: str) -> dict[str, Any]:
    return {
        "asin": asin,
        "url": f"https://www.amazon.com/dp/{asin}",
        "ok": True,
        "provider": "direct_html",
        "title": f"Product {asin}",
        "bullets": [
            "Clinically tested active ingredients",
            "Fast-acting formula with visible results",
            "Simple routine for daily use",
            "Unscented and sensitive-skin friendly",
            "30-day satisfaction guarantee",
        ],
        "main_image_url": f"https://images.example.com/{asin}/main.jpg",
        "image_urls": [
            f"https://images.example.com/{asin}/1.jpg",
            f"https://images.example.com/{asin}/2.jpg",
            f"https://images.example.com/{asin}/3.jpg",
        ],
    }


@pytest.mark.asyncio
async def test_stage0_schema_gate_passes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("APIFY_API_KEY", raising=False)

    async def fake_direct_fetch(asin: str) -> dict[str, Any]:
        return _fake_listing(asin)

    monkeypatch.setattr("worker_app.pipeline.fetch_amazon_listing_direct_reliable", fake_direct_fetch)

    output = await stage0_listing_fetch({"asin_a": "B000000001", "asin_b": "B000000002"})
    validate_stage_output(0, output)
    assert output["ok"] is True


@pytest.mark.asyncio
async def test_stage1_to_stage3_schema_gates_pass_in_heuristics_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    stage0 = {
        "asin_a": _fake_listing("B000000001"),
        "asin_b": _fake_listing("B000000002"),
    }

    async def fake_download(url: str, max_bytes: int = 2_000_000) -> dict[str, Any]:
        is_a = "/B000000001/" in url
        width = 1400 if is_a else 1000
        height = 1400 if is_a else 1000
        return {
            "url": url,
            "ok": True,
            "http_status": 200,
            "width": width,
            "height": height,
            "content_type": "image/jpeg",
            "bytes_downloaded": min(max_bytes, 50_000),
        }

    monkeypatch.setattr("worker_app.pipeline.download_bytes_limited", fake_download)

    stage1 = await stage1_main_image_ctr(stage0)
    validate_stage_output(1, stage1)
    assert stage1["ctr_winner"] in {"A", "B", "TIE"}

    stage2 = await stage2_gallery_cvr(stage0)
    validate_stage_output(2, stage2)
    assert stage2["cvr_winner"] in {"A", "B", "TIE"}

    stage3 = await stage3_text_alignment(stage0)
    validate_stage_output(3, stage3)
    assert stage3["text_winner"] in {"A", "B", "TIE"}


@pytest.mark.asyncio
async def test_stage4_and_stage5_schema_gates_pass(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    stage1 = {"stage_name": "main_image_ctr", "provider": "heuristics", "asin_a": {"score": 0.74}, "asin_b": {"score": 0.62}, "ctr_winner": "A", "confidence": 0.12}
    stage2 = {"stage_name": "gallery_cvr", "provider": "heuristics", "asin_a": {"score": 0.66}, "asin_b": {"score": 0.58}, "cvr_winner": "A", "confidence": 0.08}
    stage3 = {
        "stage_name": "text_alignment",
        "provider": "heuristics",
        "asin_a": {"metrics": {"score": 0.61}},
        "asin_b": {"metrics": {"score": 0.55}},
        "text_winner": "A",
        "confidence": 0.06,
    }

    stage4 = await stage4_avatars(stage1, stage2, stage3)
    validate_stage_output(4, stage4)
    assert len(stage4["avatars"]) == 3

    verdict = await stage5_verdict(
        {"id": "job-123", "asin_a": "B000000001", "asin_b": "B000000002"},
        stage1,
        stage2,
        stage3,
        stage4,
    )
    validate_stage_output(5, verdict)
    assert verdict["winner"] in {"A", "B", "TIE"}


@pytest.mark.asyncio
async def test_stage1_raises_on_prompt_hash_mismatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    async def fake_download(url: str, max_bytes: int = 2_000_000) -> dict[str, Any]:
        return {
            "url": url,
            "ok": True,
            "http_status": 200,
            "width": 1200,
            "height": 1200,
        }

    monkeypatch.setattr("worker_app.pipeline.download_bytes_limited", fake_download)

    stage0 = {
        "asin_a": _fake_listing("B000000001"),
        "asin_b": _fake_listing("B000000002"),
    }
    job = {
        "prompt_versions_pinned": {
            "prompt_hashes": {
                "vision-ctr/v1.0.md": "0" * 64,
            }
        }
    }

    with pytest.raises(PromptIntegrityError):
        await stage1_main_image_ctr(stage0, job)
