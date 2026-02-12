from __future__ import annotations

import asyncio
import hashlib
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from .config import get_optional_env
from .supabase_rest import insert_many, insert_one, select_many, select_one, update_many


STAGES: list[tuple[int, str]] = [
    (0, "listing_fetch"),
    (1, "main_image_ctr"),
    (2, "gallery_cvr"),
    (3, "text_alignment"),
    (4, "avatars"),
    (5, "verdict"),
]

PROMPTS_DIR = Path(__file__).resolve().parents[3] / "prompts"
RETRYABLE_HTTP_STATUSES = {408, 409, 425, 429, 500, 502, 503, 504}


class PromptIntegrityError(RuntimeError):
    pass


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso_or_none(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def duration_ms(started_at: str | None, completed_at: str | None) -> int | None:
    start = parse_iso_or_none(started_at)
    end = parse_iso_or_none(completed_at)
    if not start or not end:
        return None
    delta = (end - start).total_seconds() * 1000.0
    return max(int(delta), 0)


def read_int_env(name: str, default: int, *, minimum: int = 1, maximum: int = 600) -> int:
    raw = get_optional_env(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    if value < minimum:
        return minimum
    if value > maximum:
        return maximum
    return value


def should_retry_apify_result(result: dict[str, Any]) -> bool:
    http_status = result.get("http_status")
    if isinstance(http_status, int) and http_status in RETRYABLE_HTTP_STATUSES:
        return True
    apify_status = str(result.get("apify_status") or "").upper()
    if apify_status in {"RUNNING", "TIMED-OUT"}:
        return True
    error = str(result.get("error") or "").lower()
    retryable_needles = [
        "timeout",
        "temporar",
        "connection",
        "network",
        "429",
        "rate",
    ]
    return any(needle in error for needle in retryable_needles)


async def record_analytics_event(
    *,
    user_id: str,
    event_name: str,
    job_id: str | None = None,
    stage_number: int | None = None,
    properties: dict[str, Any] | None = None,
) -> None:
    row: dict[str, Any] = {
        "user_id": user_id,
        "event_name": event_name,
        "properties": properties or {},
    }
    if job_id:
        row["job_id"] = job_id
    if stage_number is not None:
        row["stage_number"] = stage_number
    try:
        await insert_one("analytics_events", row)
    except Exception:
        return


def clamp01(value: float) -> float:
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return value


def safe_words(text: str) -> list[str]:
    words = re.findall(r"[A-Za-z0-9]+", text.lower())
    stop = {
        "the",
        "and",
        "for",
        "with",
        "your",
        "you",
        "from",
        "this",
        "that",
        "are",
        "not",
        "was",
        "were",
        "has",
        "have",
        "all",
        "new",
        "best",
        "amazon",
        "com",
    }
    return [w for w in words if len(w) >= 3 and w not in stop]


def strip_tags(raw: str) -> str:
    return re.sub(r"<[^>]+>", "", raw)


def normalize_ws(raw: str) -> str:
    return re.sub(r"\s+", " ", raw).strip()


def load_prompt(prompt_rel_path: str) -> str:
    path = PROMPTS_DIR / prompt_rel_path
    return path.read_text(encoding="utf-8")


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def normalize_sha256(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if re.fullmatch(r"[0-9a-f]{64}", normalized):
        return normalized
    return None


def get_expected_prompt_hash(job: dict[str, Any] | None, prompt_rel_path: str) -> str | None:
    if not isinstance(job, dict):
        return None
    pinned = job.get("prompt_versions_pinned")
    if not isinstance(pinned, dict):
        return None

    direct = normalize_sha256(pinned.get(prompt_rel_path))
    if direct:
        return direct

    prompt_hashes = pinned.get("prompt_hashes")
    if isinstance(prompt_hashes, dict):
        nested = normalize_sha256(prompt_hashes.get(prompt_rel_path))
        if nested:
            return nested

    short_key = prompt_rel_path.split("/", 1)[0]
    short = normalize_sha256(pinned.get(short_key))
    if short:
        return short

    if isinstance(prompt_hashes, dict):
        short_nested = normalize_sha256(prompt_hashes.get(short_key))
        if short_nested:
            return short_nested

    return None


def load_prompt_with_integrity(
    job: dict[str, Any] | None,
    prompt_rel_path: str,
) -> tuple[str, dict[str, Any]]:
    prompt = load_prompt(prompt_rel_path)
    actual_hash = sha256_hex(prompt)
    expected_hash = get_expected_prompt_hash(job, prompt_rel_path)
    if expected_hash and actual_hash != expected_hash:
        raise PromptIntegrityError(
            f"Prompt hash mismatch for {prompt_rel_path}: expected {expected_hash}, got {actual_hash}"
        )
    return prompt, {
        "path": prompt_rel_path,
        "hash_sha256": actual_hash,
        "expected_hash_sha256": expected_hash,
        "validated": bool(expected_hash),
    }


def _expect(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def _score_in_range(value: Any) -> bool:
    if not isinstance(value, (int, float)):
        return False
    return 0.0 <= float(value) <= 1.0


def validate_stage_output(stage_number: int, output: dict[str, Any]) -> None:
    errors: list[str] = []
    _expect(isinstance(output, dict), "output must be an object", errors)
    if errors:
        raise ValueError(f"Stage {stage_number} output schema invalid: {'; '.join(errors)}")

    stage_name = output.get("stage_name")
    expected_name = STAGES[stage_number][1]
    _expect(stage_name == expected_name, f"stage_name must be '{expected_name}'", errors)

    if stage_number == 0:
        _expect(isinstance(output.get("ok"), bool), "ok must be boolean", errors)
        _expect(isinstance(output.get("asin_a"), dict), "asin_a must be object", errors)
        _expect(isinstance(output.get("asin_b"), dict), "asin_b must be object", errors)
    elif stage_number == 1:
        if output.get("status") != "skipped":
            _expect(isinstance(output.get("asin_a"), dict), "asin_a must be object", errors)
            _expect(isinstance(output.get("asin_b"), dict), "asin_b must be object", errors)
            if isinstance(output.get("asin_a"), dict):
                _expect(_score_in_range(output["asin_a"].get("score")), "asin_a.score must be 0..1", errors)
            if isinstance(output.get("asin_b"), dict):
                _expect(_score_in_range(output["asin_b"].get("score")), "asin_b.score must be 0..1", errors)
            _expect(output.get("ctr_winner") in {"A", "B", "TIE"}, "ctr_winner must be A/B/TIE", errors)
    elif stage_number == 2:
        _expect(isinstance(output.get("asin_a"), dict), "asin_a must be object", errors)
        _expect(isinstance(output.get("asin_b"), dict), "asin_b must be object", errors)
        if isinstance(output.get("asin_a"), dict):
            _expect(_score_in_range(output["asin_a"].get("score")), "asin_a.score must be 0..1", errors)
        if isinstance(output.get("asin_b"), dict):
            _expect(_score_in_range(output["asin_b"].get("score")), "asin_b.score must be 0..1", errors)
        _expect(output.get("cvr_winner") in {"A", "B", "TIE"}, "cvr_winner must be A/B/TIE", errors)
    elif stage_number == 3:
        _expect(isinstance(output.get("asin_a"), dict), "asin_a must be object", errors)
        _expect(isinstance(output.get("asin_b"), dict), "asin_b must be object", errors)
        if isinstance(output.get("asin_a"), dict):
            metrics_a = output["asin_a"].get("metrics")
            _expect(isinstance(metrics_a, dict), "asin_a.metrics must be object", errors)
            if isinstance(metrics_a, dict):
                _expect(_score_in_range(metrics_a.get("score")), "asin_a.metrics.score must be 0..1", errors)
        if isinstance(output.get("asin_b"), dict):
            metrics_b = output["asin_b"].get("metrics")
            _expect(isinstance(metrics_b, dict), "asin_b.metrics must be object", errors)
            if isinstance(metrics_b, dict):
                _expect(_score_in_range(metrics_b.get("score")), "asin_b.metrics.score must be 0..1", errors)
        _expect(output.get("text_winner") in {"A", "B", "TIE"}, "text_winner must be A/B/TIE", errors)
    elif stage_number == 4:
        avatars = output.get("avatars")
        _expect(isinstance(avatars, list), "avatars must be array", errors)
        if isinstance(avatars, list):
            _expect(len(avatars) == 3, "avatars must contain exactly 3 entries", errors)
            for i, avatar in enumerate(avatars):
                _expect(isinstance(avatar, dict), f"avatars[{i}] must be object", errors)
                if isinstance(avatar, dict):
                    _expect(isinstance(avatar.get("name"), str) and bool(avatar.get("name")), f"avatars[{i}].name is required", errors)
                    _expect(avatar.get("leans_to") in {"A", "B", "TIE"}, f"avatars[{i}].leans_to must be A/B/TIE", errors)
    elif stage_number == 5:
        _expect(output.get("winner") in {"A", "B", "TIE"}, "winner must be A/B/TIE", errors)
        scores = output.get("scores")
        _expect(isinstance(scores, dict), "scores must be object", errors)
        if isinstance(scores, dict):
            asin_a = scores.get("asin_a")
            asin_b = scores.get("asin_b")
            _expect(isinstance(asin_a, dict), "scores.asin_a must be object", errors)
            _expect(isinstance(asin_b, dict), "scores.asin_b must be object", errors)
            if isinstance(asin_a, dict):
                _expect(_score_in_range(asin_a.get("total")), "scores.asin_a.total must be 0..1", errors)
            if isinstance(asin_b, dict):
                _expect(_score_in_range(asin_b.get("total")), "scores.asin_b.total must be 0..1", errors)
        _expect(isinstance(output.get("prioritized_fixes"), list), "prioritized_fixes must be array", errors)
        _expect(_score_in_range(output.get("confidence")), "confidence must be 0..1", errors)

    if errors:
        raise ValueError(f"Stage {stage_number} output schema invalid: {'; '.join(errors)}")


def extract_json_from_text(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        # Strip optional fenced block.
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        candidate = text[start : end + 1]
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            return parsed

    raise ValueError("Model response did not contain a valid JSON object.")


def safe_float(value: Any, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return default
    return default


def pick_with_margin(score_a: float, score_b: float, margin: float = 0.05) -> str:
    if score_a > score_b + margin:
        return "A"
    if score_b > score_a + margin:
        return "B"
    return "TIE"


async def openai_chat_json(
    *,
    system_prompt: str,
    user_content: list[dict[str, Any]],
    model: str,
    timeout_seconds: float = 60.0,
) -> dict[str, Any]:
    api_key = get_optional_env("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    payload: dict[str, Any] = {
        "model": model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload,
        )

    if resp.status_code >= 400:
        snippet = (resp.text or "")[:300]
        raise RuntimeError(f"OpenAI HTTP {resp.status_code}: {snippet}")

    data = resp.json()
    content = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    if not isinstance(content, str):
        raise RuntimeError("OpenAI response missing text content.")

    return extract_json_from_text(content)


def looks_like_captcha(page_html: str) -> bool:
    lowered = page_html.lower()
    needles = [
        "enter the characters you see below",
        "type the characters you see in this image",
        "/captcha/",
        "captcha",
        "robot check",
    ]
    return any(n in lowered for n in needles)


def parse_amazon_listing_html(asin: str, page_html: str, url: str) -> dict[str, Any]:
    # Title
    title = None
    m = re.search(
        r'<span[^>]*id="productTitle"[^>]*>(.*?)</span>',
        page_html,
        re.IGNORECASE | re.DOTALL,
    )
    if m:
        title = normalize_ws(strip_tags(html.unescape(m.group(1))))

    # Bullets
    bullets: list[str] = []
    fb = re.search(
        r'<div[^>]*id="feature-bullets"[^>]*>(.*?)</div>',
        page_html,
        re.IGNORECASE | re.DOTALL,
    )
    if fb:
        block = fb.group(1)
        for li in re.findall(r"<li[^>]*>(.*?)</li>", block, re.IGNORECASE | re.DOTALL):
            text = normalize_ws(strip_tags(html.unescape(li)))
            if not text:
                continue
            # Skip obvious boilerplate.
            if text.lower().startswith("make sure this fits"):
                continue
            bullets.append(text)

    # Images (dynamic image mapping preferred)
    image_urls: list[str] = []
    main_image_url: str | None = None
    dim_map: dict[str, list[int]] = {}

    dyn = re.search(
        r'data-a-dynamic-image="([^"]+)"',
        page_html,
        re.IGNORECASE | re.DOTALL,
    )
    if dyn:
        raw = html.unescape(dyn.group(1))
        try:
            dim_map = json.loads(raw)
        except json.JSONDecodeError:
            dim_map = {}

    if dim_map:
        # Choose the largest rendition as "main".
        items = []
        for u, dims in dim_map.items():
            if not isinstance(u, str) or not isinstance(dims, list) or len(dims) != 2:
                continue
            w, h = dims
            if not isinstance(w, int) or not isinstance(h, int):
                continue
            items.append((w * h, u))
        items.sort(reverse=True)
        if items:
            main_image_url = items[0][1]
        image_urls = [u for _, u in items][:15]

    if not main_image_url:
        m = re.search(
            r'<img[^>]*id="landingImage"[^>]*src="([^"]+)"',
            page_html,
            re.IGNORECASE | re.DOTALL,
        )
        if m:
            main_image_url = html.unescape(m.group(1))

    if not image_urls and main_image_url:
        image_urls = [main_image_url]

    # Attempt to find more gallery images.
    if len(image_urls) < 2:
        for m in re.finditer(
            r'data-old-hires="([^"]+)"',
            page_html,
            re.IGNORECASE | re.DOTALL,
        ):
            u = html.unescape(m.group(1)).strip()
            if u and u not in image_urls:
                image_urls.append(u)
            if len(image_urls) >= 15:
                break

    if not main_image_url and image_urls:
        main_image_url = image_urls[0]

    return {
        "asin": asin,
        "url": url,
        "title": title,
        "bullets": bullets[:10],
        "main_image_url": main_image_url,
        "image_urls": image_urls[:15],
    }


def _normalize_apify_image_urls(raw_item: dict[str, Any]) -> list[str]:
    out: list[str] = []
    candidates = [
        raw_item.get("image_urls"),
        raw_item.get("images"),
        raw_item.get("gallery"),
        raw_item.get("galleryImages"),
    ]
    for value in candidates:
        if isinstance(value, list):
            for v in value:
                if isinstance(v, str) and v and v not in out:
                    out.append(v)
                elif isinstance(v, dict):
                    for key in ("url", "src", "hiRes", "large"):
                        u = v.get(key)
                        if isinstance(u, str) and u and u not in out:
                            out.append(u)
                            break

    # Try common single-image fields too.
    for key in ("main_image_url", "mainImage", "image", "imageUrl"):
        u = raw_item.get(key)
        if isinstance(u, str) and u and u not in out:
            out.insert(0, u)
            break

    return out[:15]


async def fetch_amazon_listing_via_apify(
    asin: str,
    apify_api_key: str,
    actor_id: str,
) -> dict[str, Any]:
    url = f"https://www.amazon.com/dp/{asin}"
    runs_endpoint = f"https://api.apify.com/v2/acts/{actor_id}/runs"

    # Official Apify actor format; we use a minimal input that extracts only
    # what our pipeline needs and keeps payload small.
    page_function = """
async function pageFunction(context) {
  const { request } = context;
  const clean = (v) => (v || '').replace(/\\s+/g, ' ').trim();
  const titleNode = document.querySelector('#productTitle');
  const title = clean(titleNode ? titleNode.textContent : '');

  const bullets = Array.from(
    document.querySelectorAll('#feature-bullets li span.a-list-item')
  ).map((el) => clean(el.textContent || '')).filter(Boolean).slice(0, 10);

  const landingImage = document.querySelector('#landingImage');
  const mainImage = landingImage ? landingImage.getAttribute('src') : null;

  const imageUrls = [];
  for (const el of Array.from(document.querySelectorAll('[data-old-hires]'))) {
    const v = clean(el.getAttribute('data-old-hires') || '');
    if (v && !imageUrls.includes(v)) imageUrls.push(v);
    if (imageUrls.length >= 15) break;
  }
  if (mainImage && !imageUrls.includes(mainImage)) imageUrls.unshift(mainImage);

  return {
    url: request.url,
    asin: (request.url.match(/\\/dp\\/([A-Z0-9]{10})/i) || [null, null])[1],
    title,
    bullets,
    main_image_url: mainImage,
    image_urls: imageUrls.slice(0, 15),
  };
}
""".strip()

    payload: dict[str, Any] = {
        "startUrls": [{"url": url}],
        "maxPagesPerCrawl": 1,
        "maxRequestsPerCrawl": 1,
        "proxyConfiguration": {"useApifyProxy": True},
        "pageFunction": page_function,
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            start_resp = await client.post(
                runs_endpoint,
                params={"token": apify_api_key},
                json=payload,
            )
    except Exception as e:
        return {
            "asin": asin,
            "url": url,
            "ok": False,
            "provider": "apify_actor",
            "error": f"Apify start run failed: {e}",
        }

    if start_resp.status_code not in {200, 201}:
        return {
            "asin": asin,
            "url": url,
            "ok": False,
            "http_status": start_resp.status_code,
            "provider": "apify_actor",
            "error": f"Apify actor start failed with HTTP {start_resp.status_code}.",
        }

    start_data = start_resp.json() if start_resp.content else {}
    run_data = start_data.get("data") if isinstance(start_data, dict) else None
    run_id = run_data.get("id") if isinstance(run_data, dict) else None
    if not isinstance(run_id, str) or not run_id:
        return {
            "asin": asin,
            "url": url,
            "ok": False,
            "provider": "apify_actor",
            "error": "Apify start response missing run id.",
        }

    status = "RUNNING"
    default_dataset_id: str | None = None
    status_message: str | None = None
    run_timeout_seconds = float(read_int_env("APIFY_RUN_TIMEOUT_SECONDS", 180, minimum=30, maximum=900))
    poll_interval_seconds = float(read_int_env("APIFY_POLL_INTERVAL_SECONDS", 2, minimum=1, maximum=30))
    deadline = datetime.now(timezone.utc).timestamp() + run_timeout_seconds

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            while datetime.now(timezone.utc).timestamp() < deadline:
                run_resp = await client.get(
                    f"https://api.apify.com/v2/actor-runs/{run_id}",
                    params={"token": apify_api_key},
                )
                if run_resp.status_code >= 400:
                    return {
                        "asin": asin,
                        "url": url,
                        "ok": False,
                        "provider": "apify_actor",
                        "apify_run_id": run_id,
                        "http_status": run_resp.status_code,
                        "error": f"Apify run polling returned HTTP {run_resp.status_code}.",
                    }
                run_payload = run_resp.json() if run_resp.content else {}
                run_obj = run_payload.get("data") if isinstance(run_payload, dict) else None
                if isinstance(run_obj, dict):
                    status = str(run_obj.get("status") or status)
                    status_message = (
                        str(run_obj.get("statusMessage"))
                        if run_obj.get("statusMessage") is not None
                        else None
                    )
                    d_id = run_obj.get("defaultDatasetId")
                    if isinstance(d_id, str) and d_id:
                        default_dataset_id = d_id

                if status in {"SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"}:
                    break
                await asyncio.sleep(poll_interval_seconds)
    except Exception as e:
        return {
            "asin": asin,
            "url": url,
            "ok": False,
            "provider": "apify_actor",
            "error": f"Apify run polling failed: {e}",
        }

    if status != "SUCCEEDED":
        return {
            "asin": asin,
            "url": url,
            "ok": False,
            "provider": "apify_actor",
            "apify_run_id": run_id,
            "apify_status": status,
            "error": (
                f"Apify run did not succeed (status={status})."
                + (f" {status_message}" if status_message else "")
            ),
        }

    if not default_dataset_id:
        return {
            "asin": asin,
            "url": url,
            "ok": False,
            "provider": "apify_actor",
            "apify_run_id": run_id,
            "error": "Apify run succeeded but default dataset id is missing.",
        }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            items_resp = await client.get(
                f"https://api.apify.com/v2/datasets/{default_dataset_id}/items",
                params={
                    "token": apify_api_key,
                    "clean": "true",
                    "format": "json",
                },
            )
    except Exception as e:
        return {
            "asin": asin,
            "url": url,
            "ok": False,
            "provider": "apify_actor",
            "apify_run_id": run_id,
            "error": f"Apify dataset fetch failed: {e}",
        }

    if items_resp.status_code != 200:
        return {
            "asin": asin,
            "url": url,
            "ok": False,
            "provider": "apify_actor",
            "apify_run_id": run_id,
            "http_status": items_resp.status_code,
            "error": f"Apify dataset items failed with HTTP {items_resp.status_code}.",
        }

    try:
        body = items_resp.json()
    except json.JSONDecodeError:
        body = []

    if not isinstance(body, list) or not body:
        return {
            "asin": asin,
            "url": url,
            "ok": False,
            "provider": "apify_actor",
            "error": "Apify actor returned no dataset items.",
        }

    item = body[0]
    if not isinstance(item, dict):
        return {
            "asin": asin,
            "url": url,
            "ok": False,
            "provider": "apify_actor",
            "error": "Apify actor output was not an object.",
        }

    title = item.get("title")
    bullets = item.get("bullets")
    image_urls = _normalize_apify_image_urls(item)
    main_image_url = item.get("main_image_url") if isinstance(item.get("main_image_url"), str) else None
    if not main_image_url and image_urls:
        main_image_url = image_urls[0]

    ok = bool(title) and bool(main_image_url)
    out: dict[str, Any] = {
        "asin": asin,
        "url": str(item.get("url") or url),
        "ok": ok,
        "provider": "apify_actor",
        "apify_run_id": run_id,
        "title": str(title) if title else None,
        "bullets": [str(x) for x in bullets[:10]] if isinstance(bullets, list) else [],
        "main_image_url": main_image_url,
        "image_urls": image_urls,
    }
    if not ok:
        out["error"] = "Apify actor returned incomplete listing payload."
    return out


async def fetch_amazon_listing_via_apify_reliable(
    asin: str,
    apify_api_key: str,
    actor_id: str,
) -> dict[str, Any]:
    max_attempts = read_int_env("APIFY_MAX_ATTEMPTS", 2, minimum=1, maximum=5)
    retry_base_ms = read_int_env("APIFY_RETRY_BASE_MS", 1200, minimum=200, maximum=5000)

    attempts: list[dict[str, Any]] = []
    last_result: dict[str, Any] | None = None

    for attempt in range(1, max_attempts + 1):
        result = await fetch_amazon_listing_via_apify(asin, apify_api_key, actor_id)
        attempts.append(
            {
                "attempt": attempt,
                "ok": bool(result.get("ok")),
                "http_status": result.get("http_status"),
                "apify_status": result.get("apify_status"),
                "error": result.get("error"),
            }
        )
        if result.get("ok"):
            result["apify_attempt_count"] = attempt
            result["apify_attempts"] = attempts
            return result

        last_result = result
        if attempt >= max_attempts or not should_retry_apify_result(result):
            break

        backoff_seconds = (retry_base_ms / 1000.0) * (2 ** (attempt - 1))
        await asyncio.sleep(min(backoff_seconds, 10.0))

    fallback: dict[str, Any] = {
        "asin": asin,
        "ok": False,
        "provider": "apify_actor",
        "error": "Apify retries exhausted.",
        "apify_attempt_count": len(attempts),
        "apify_attempts": attempts,
    }
    if last_result:
        fallback.update(last_result)
        fallback["apify_attempt_count"] = len(attempts)
        fallback["apify_attempts"] = attempts
    return fallback


async def fetch_amazon_listing(asin: str) -> dict[str, Any]:
    url = f"https://www.amazon.com/dp/{asin}"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    async with httpx.AsyncClient(
        timeout=25.0,
        follow_redirects=True,
        headers=headers,
    ) as client:
        resp = await client.get(url)

    page_html = resp.text or ""
    blocked = looks_like_captcha(page_html)
    ok = resp.status_code == 200 and not blocked

    result: dict[str, Any] = {
        "asin": asin,
        "url": str(resp.url),
        "http_status": resp.status_code,
        "ok": ok,
        "blocked": blocked,
    }

    if ok:
        result.update(parse_amazon_listing_html(asin, page_html, str(resp.url)))
    else:
        # Include a short hint (no full HTML).
        if blocked:
            result["error"] = "Amazon blocked the request (captcha/robot check)."
        else:
            result["error"] = f"HTTP {resp.status_code} fetching Amazon product page."

    return result


async def fetch_amazon_listing_direct_reliable(asin: str) -> dict[str, Any]:
    max_attempts = read_int_env("DIRECT_FETCH_MAX_ATTEMPTS", 2, minimum=1, maximum=4)
    retry_base_ms = read_int_env("DIRECT_FETCH_RETRY_BASE_MS", 800, minimum=200, maximum=4000)
    attempts: list[dict[str, Any]] = []
    last_result: dict[str, Any] | None = None

    for attempt in range(1, max_attempts + 1):
        result = await fetch_amazon_listing(asin)
        attempts.append(
            {
                "attempt": attempt,
                "ok": bool(result.get("ok")),
                "http_status": result.get("http_status"),
                "blocked": result.get("blocked"),
                "error": result.get("error"),
            }
        )
        if result.get("ok"):
            result["direct_attempt_count"] = attempt
            result["direct_attempts"] = attempts
            return result

        last_result = result
        http_status = result.get("http_status")
        blocked = bool(result.get("blocked"))
        retryable = isinstance(http_status, int) and http_status in RETRYABLE_HTTP_STATUSES
        if blocked:
            retryable = False
        if attempt >= max_attempts or not retryable:
            break

        backoff_seconds = (retry_base_ms / 1000.0) * (2 ** (attempt - 1))
        await asyncio.sleep(min(backoff_seconds, 8.0))

    fallback: dict[str, Any] = {
        "asin": asin,
        "ok": False,
        "provider": "direct_html",
        "error": "Direct listing fetch retries exhausted.",
        "direct_attempt_count": len(attempts),
        "direct_attempts": attempts,
    }
    if last_result:
        fallback.update(last_result)
        fallback["direct_attempt_count"] = len(attempts)
        fallback["direct_attempts"] = attempts
    return fallback


def guess_image_dimensions(data: bytes) -> tuple[int, int] | None:
    if len(data) < 24:
        return None

    # PNG: 8-byte signature, then IHDR chunk.
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width = int.from_bytes(data[16:20], "big", signed=False)
        height = int.from_bytes(data[20:24], "big", signed=False)
        if width > 0 and height > 0:
            return width, height
        return None

    # JPEG: scan for SOF marker with width/height.
    if data.startswith(b"\xFF\xD8"):
        i = 2
        while i + 4 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            while i < len(data) and data[i] == 0xFF:
                i += 1
            if i >= len(data):
                break
            marker = data[i]
            i += 1
            if marker in (0xD9, 0xDA):  # EOI, SOS
                break
            if i + 2 > len(data):
                break
            seg_len = int.from_bytes(data[i : i + 2], "big", signed=False)
            i += 2
            if seg_len < 2:
                break
            sof_markers = {
                0xC0,
                0xC1,
                0xC2,
                0xC3,
                0xC5,
                0xC6,
                0xC7,
                0xC9,
                0xCA,
                0xCB,
                0xCD,
                0xCE,
                0xCF,
            }
            if marker in sof_markers and i + 5 <= len(data):
                # precision = data[i]
                height = int.from_bytes(data[i + 1 : i + 3], "big", signed=False)
                width = int.from_bytes(data[i + 3 : i + 5], "big", signed=False)
                if width > 0 and height > 0:
                    return width, height
                return None
            i += seg_len - 2

    return None


async def download_bytes_limited(url: str, max_bytes: int = 2_000_000) -> dict[str, Any]:
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "*/*"}
    out: dict[str, Any] = {"url": url}
    async with httpx.AsyncClient(timeout=25.0, follow_redirects=True, headers=headers) as client:
        async with client.stream("GET", url) as resp:
            out["http_status"] = resp.status_code
            if resp.status_code != 200:
                out["ok"] = False
                out["error"] = f"HTTP {resp.status_code} downloading image."
                return out

            content_type = resp.headers.get("content-type")
            content_length = resp.headers.get("content-length")
            out["content_type"] = content_type
            out["content_length"] = int(content_length) if content_length and content_length.isdigit() else None

            chunks: list[bytes] = []
            total = 0
            truncated = False
            async for chunk in resp.aiter_bytes():
                if not chunk:
                    continue
                if total + len(chunk) > max_bytes:
                    chunks.append(chunk[: max_bytes - total])
                    total = max_bytes
                    truncated = True
                    break
                chunks.append(chunk)
                total += len(chunk)
            data = b"".join(chunks)

    out["ok"] = True
    out["bytes_downloaded"] = len(data)
    out["truncated"] = truncated
    dims = guess_image_dimensions(data)
    if dims:
        out["width"], out["height"] = dims
    else:
        out["width"], out["height"] = None, None
    return out


def image_score(meta: dict[str, Any]) -> float:
    w = meta.get("width") or 0
    h = meta.get("height") or 0
    if not w or not h:
        return 0.0
    min_dim = min(w, h)
    max_dim = max(w, h)
    min_dim_score = clamp01(min_dim / 1000.0)
    aspect_score = clamp01(min_dim / float(max_dim))
    zoom_bonus = 0.1 if min_dim >= 1000 else 0.0
    return clamp01(0.7 * min_dim_score + 0.3 * aspect_score + zoom_bonus)


def gallery_score(images: list[dict[str, Any]]) -> float:
    if not images:
        return 0.0
    ok_imgs = [img for img in images if img.get("ok") and img.get("width") and img.get("height")]
    count_score = clamp01(len(images) / 7.0)
    if not ok_imgs:
        return 0.5 * count_score
    avg_min = sum(min(int(i["width"]), int(i["height"])) for i in ok_imgs) / float(len(ok_imgs))
    dim_score = clamp01(avg_min / 1000.0)
    return clamp01(0.5 * count_score + 0.5 * dim_score)


def text_score(title: str | None, bullets: list[str]) -> dict[str, Any]:
    title = title or ""
    title_len = len(title)
    title_words = len(safe_words(title))
    bullet_count = len(bullets)
    bullet_words = [len(safe_words(b)) for b in bullets]
    avg_bullet_words = sum(bullet_words) / float(len(bullet_words)) if bullet_words else 0.0

    # Title: avoid extremely short/long.
    title_len_score = 1.0
    if title_len < 60:
        title_len_score = clamp01(title_len / 60.0)
    elif title_len > 180:
        title_len_score = clamp01(1.0 - (title_len - 180) / 120.0)

    bullet_count_score = clamp01(bullet_count / 5.0)

    # Bullets: prefer ~10-25 words each for scannability.
    bullet_quality_score = 0.0
    if bullet_count:
        ideal = 18.0
        deltas = [abs(w - ideal) for w in bullet_words]
        avg_delta = sum(deltas) / float(len(deltas)) if deltas else ideal
        bullet_quality_score = clamp01(1.0 - avg_delta / 30.0)

    score = clamp01(0.35 * title_len_score + 0.35 * bullet_count_score + 0.30 * bullet_quality_score)
    return {
        "score": score,
        "title_len": title_len,
        "title_words": title_words,
        "bullet_count": bullet_count,
        "avg_bullet_words": round(avg_bullet_words, 2),
        "title_len_score": round(title_len_score, 3),
        "bullet_count_score": round(bullet_count_score, 3),
        "bullet_quality_score": round(bullet_quality_score, 3),
    }


async def ensure_stage_rows(job_id: str) -> None:
    rows = await select_many(
        "job_stages",
        {"select": "id,stage_number", "job_id": f"eq.{job_id}"},
    )
    existing = {int(r["stage_number"]) for r in rows if "stage_number" in r}
    missing = [(n, name) for n, name in STAGES if n not in existing]
    if not missing:
        return
    await insert_many(
        "job_stages",
        [
            {
                "job_id": job_id,
                "stage_number": n,
                "status": "pending",
                "output": {"stage_name": name},
            }
            for n, name in missing
        ],
    )


async def set_job_status(job_id: str, status: str) -> None:
    await update_many(
        "jobs",
        {"id": f"eq.{job_id}"},
        {"status": status, "updated_at": utc_now_iso()},
    )


async def mark_stage(job_id: str, stage_number: int, patch: dict[str, Any]) -> None:
    await update_many(
        "job_stages",
        {
            "job_id": f"eq.{job_id}",
            "stage_number": f"eq.{stage_number}",
        },
        patch,
    )


async def stage0_listing_fetch(job: dict[str, Any]) -> dict[str, Any]:
    asin_a = str(job["asin_a"])
    asin_b = str(job["asin_b"])
    apify_api_key = get_optional_env("APIFY_API_KEY")
    actor_id = get_optional_env("APIFY_ACTOR_ID", "apify~web-scraper") or "apify~web-scraper"

    async def fetch_with_provider(asin: str) -> dict[str, Any]:
        if apify_api_key:
            via_apify = await fetch_amazon_listing_via_apify_reliable(
                asin, apify_api_key, actor_id
            )
            if via_apify.get("ok"):
                return via_apify
            direct = await fetch_amazon_listing_direct_reliable(asin)
            direct["provider"] = "direct_html_fallback"
            direct["apify_error"] = via_apify.get("error")
            direct["apify_http_status"] = via_apify.get("http_status")
            direct["apify_attempt_count"] = via_apify.get("apify_attempt_count")
            direct["apify_attempts"] = via_apify.get("apify_attempts")
            return direct

        direct = await fetch_amazon_listing_direct_reliable(asin)
        direct["provider"] = "direct_html"
        return direct

    a, b = await asyncio.gather(fetch_with_provider(asin_a), fetch_with_provider(asin_b))
    ok = bool(a.get("ok")) and bool(b.get("ok"))

    providers = sorted(
        {
            str(a.get("provider") or "unknown"),
            str(b.get("provider") or "unknown"),
        }
    )
    return {
        "stage_name": "listing_fetch",
        "ok": ok,
        "provider": "+".join(providers),
        "apify_actor_id": actor_id if apify_api_key else None,
        "reliability": {
            "apify_max_attempts": read_int_env("APIFY_MAX_ATTEMPTS", 2, minimum=1, maximum=5),
            "direct_max_attempts": read_int_env("DIRECT_FETCH_MAX_ATTEMPTS", 2, minimum=1, maximum=4),
        },
        "asin_a": a,
        "asin_b": b,
        "note": (
            "Stage 0 uses Apify with retry/backoff when APIFY_API_KEY is configured, "
            "then falls back to direct Amazon HTML fetch with retry/backoff."
        ),
    }


async def stage1_main_image_ctr(
    stage0: dict[str, Any],
    job: dict[str, Any] | None = None,
) -> dict[str, Any]:
    a = stage0["asin_a"]
    b = stage0["asin_b"]
    url_a = a.get("main_image_url")
    url_b = b.get("main_image_url")
    if not url_a or not url_b:
        return {
            "stage_name": "main_image_ctr",
            "provider": "heuristics",
            "status": "skipped",
            "reason": "Missing main_image_url from stage 0.",
        }

    meta_a, meta_b = await asyncio.gather(
        download_bytes_limited(str(url_a)),
        download_bytes_limited(str(url_b)),
    )
    heur_score_a = image_score(meta_a)
    heur_score_b = image_score(meta_b)

    openai_key = get_optional_env("OPENAI_API_KEY")
    if openai_key:
        try:
            prompt, prompt_integrity = load_prompt_with_integrity(job, "vision-ctr/v1.0.md")
            model = get_optional_env("OPENAI_VISION_MODEL", "gpt-4o-mini") or "gpt-4o-mini"
            llm = await openai_chat_json(
                system_prompt=prompt,
                model=model,
                user_content=[
                    {
                        "type": "text",
                        "text": (
                            "Compare ASIN A and ASIN B main images for CTR.\n"
                            f"ASIN A: {a.get('asin') or a.get('asin_a') or 'A'}\n"
                            f"ASIN B: {b.get('asin') or b.get('asin_b') or 'B'}\n"
                            "Return JSON only."
                        ),
                    },
                    {"type": "text", "text": "ASIN A main image"},
                    {"type": "image_url", "image_url": {"url": str(url_a)}},
                    {"type": "text", "text": "ASIN B main image"},
                    {"type": "image_url", "image_url": {"url": str(url_b)}},
                ],
            )

            ctr_score_a_raw = safe_float(llm.get("ctr_score_a"), 0.0)
            ctr_score_b_raw = safe_float(llm.get("ctr_score_b"), 0.0)
            score_a = clamp01(ctr_score_a_raw / 10.0)
            score_b = clamp01(ctr_score_b_raw / 10.0)
            winner = str(llm.get("ctr_winner") or pick_with_margin(score_a, score_b)).upper()
            if winner not in {"A", "B", "TIE"}:
                winner = pick_with_margin(score_a, score_b)

            return {
                "stage_name": "main_image_ctr",
                "provider": "openai",
                "model": model,
                "asin_a": {
                    "image": meta_a,
                    "score": round(score_a, 3),
                    "raw_score_1_to_10": round(ctr_score_a_raw, 2),
                },
                "asin_b": {
                    "image": meta_b,
                    "score": round(score_b, 3),
                    "raw_score_1_to_10": round(ctr_score_b_raw, 2),
                },
                "ctr_winner": winner,
                "confidence": round(clamp01(safe_float(llm.get("confidence"), abs(score_a - score_b))), 3),
                "evidence": llm.get("evidence") if isinstance(llm.get("evidence"), list) else [],
                "prompt_integrity": prompt_integrity,
                "notes": [
                    "Vision-scored by OpenAI using prompts/vision-ctr/v1.0.md.",
                    "Heuristic image metadata retained for debugging and fallback context.",
                ],
            }
        except PromptIntegrityError:
            raise
        except Exception as e:
            # Fallback to heuristics so the pipeline remains resilient.
            return {
                "stage_name": "main_image_ctr",
                "provider": "heuristics_fallback",
                "fallback_reason": str(e),
                "asin_a": {"image": meta_a, "score": round(heur_score_a, 3)},
                "asin_b": {"image": meta_b, "score": round(heur_score_b, 3)},
                "ctr_winner": pick_with_margin(heur_score_a, heur_score_b),
                "confidence": round(abs(heur_score_a - heur_score_b), 3),
                "notes": [
                    "OpenAI vision scoring failed; used heuristic proxy (resolution + aspect ratio).",
                ],
            }

    return {
        "stage_name": "main_image_ctr",
        "provider": "heuristics",
        "asin_a": {"image": meta_a, "score": round(heur_score_a, 3)},
        "asin_b": {"image": meta_b, "score": round(heur_score_b, 3)},
        "ctr_winner": pick_with_margin(heur_score_a, heur_score_b),
        "confidence": round(abs(heur_score_a - heur_score_b), 3),
        "notes": [
            "Heuristic proxy for CTR based on image resolution + aspect ratio.",
            "Set OPENAI_API_KEY to use vision model scoring.",
        ],
    }


async def stage2_gallery_cvr(
    stage0: dict[str, Any],
    job: dict[str, Any] | None = None,
) -> dict[str, Any]:
    a = stage0["asin_a"]
    b = stage0["asin_b"]
    urls_a = [u for u in (a.get("image_urls") or []) if isinstance(u, str)]
    urls_b = [u for u in (b.get("image_urls") or []) if isinstance(u, str)]

    # Limit downloads; many Amazon "image_urls" are alternate sizes.
    async def analyze_first(urls: list[str]) -> list[dict[str, Any]]:
        seen: set[str] = set()
        picked: list[str] = []
        for u in urls:
            base = u.split("?", 1)[0]
            if base in seen:
                continue
            seen.add(base)
            picked.append(u)
            if len(picked) >= 4:
                break
        if not picked:
            return []
        return await asyncio.gather(*(download_bytes_limited(u, max_bytes=200_000) for u in picked))

    imgs_a, imgs_b = await asyncio.gather(analyze_first(urls_a), analyze_first(urls_b))
    score_a_heur = gallery_score(imgs_a)
    score_b_heur = gallery_score(imgs_b)

    # Use the same de-duplicated sampled URLs for vision evaluation.
    sampled_urls_a = [str(i.get("url")) for i in imgs_a if isinstance(i.get("url"), str)]
    sampled_urls_b = [str(i.get("url")) for i in imgs_b if isinstance(i.get("url"), str)]

    openai_key = get_optional_env("OPENAI_API_KEY")
    if openai_key and sampled_urls_a and sampled_urls_b:
        try:
            prompt, prompt_integrity = load_prompt_with_integrity(job, "vision-pdp/v1.0.md")
            model = get_optional_env("OPENAI_VISION_MODEL", "gpt-4o-mini") or "gpt-4o-mini"

            content: list[dict[str, Any]] = [
                {
                    "type": "text",
                    "text": (
                        "Compare gallery images for conversion potential.\n"
                        f"ASIN A has {len(sampled_urls_a)} sampled images.\n"
                        f"ASIN B has {len(sampled_urls_b)} sampled images.\n"
                        "Return JSON only."
                    ),
                }
            ]
            for idx, u in enumerate(sampled_urls_a, start=1):
                content.append({"type": "text", "text": f"ASIN A image {idx}"})
                content.append({"type": "image_url", "image_url": {"url": u}})
            for idx, u in enumerate(sampled_urls_b, start=1):
                content.append({"type": "text", "text": f"ASIN B image {idx}"})
                content.append({"type": "image_url", "image_url": {"url": u}})

            llm = await openai_chat_json(
                system_prompt=prompt,
                model=model,
                user_content=content,
                timeout_seconds=90.0,
            )

            cvr_score_a_raw = safe_float(llm.get("cvr_vision_score_a"), 0.0)
            cvr_score_b_raw = safe_float(llm.get("cvr_vision_score_b"), 0.0)
            score_a = clamp01(cvr_score_a_raw / 10.0)
            score_b = clamp01(cvr_score_b_raw / 10.0)
            winner = str(llm.get("cvr_vision_winner") or pick_with_margin(score_a, score_b)).upper()
            if winner not in {"A", "B", "TIE"}:
                winner = pick_with_margin(score_a, score_b)

            return {
                "stage_name": "gallery_cvr",
                "provider": "openai",
                "model": model,
                "asin_a": {
                    "gallery_urls_found": len(urls_a),
                    "sampled_images": imgs_a,
                    "score": round(score_a, 3),
                    "raw_score_1_to_10": round(cvr_score_a_raw, 2),
                },
                "asin_b": {
                    "gallery_urls_found": len(urls_b),
                    "sampled_images": imgs_b,
                    "score": round(score_b, 3),
                    "raw_score_1_to_10": round(cvr_score_b_raw, 2),
                },
                "cvr_winner": winner,
                "confidence": round(clamp01(safe_float(llm.get("confidence"), abs(score_a - score_b))), 3),
                "evidence": llm.get("evidence") if isinstance(llm.get("evidence"), list) else [],
                "prompt_integrity": prompt_integrity,
                "notes": [
                    "Vision-scored by OpenAI using prompts/vision-pdp/v1.0.md.",
                ],
            }
        except PromptIntegrityError:
            raise
        except Exception as e:
            return {
                "stage_name": "gallery_cvr",
                "provider": "heuristics_fallback",
                "fallback_reason": str(e),
                "asin_a": {
                    "gallery_urls_found": len(urls_a),
                    "sampled_images": imgs_a,
                    "score": round(score_a_heur, 3),
                },
                "asin_b": {
                    "gallery_urls_found": len(urls_b),
                    "sampled_images": imgs_b,
                    "score": round(score_b_heur, 3),
                },
                "cvr_winner": pick_with_margin(score_a_heur, score_b_heur),
                "confidence": round(abs(score_a_heur - score_b_heur), 3),
                "notes": [
                    "OpenAI vision scoring failed; used heuristic proxy (gallery count + sampled resolution).",
                ],
            }

    return {
        "stage_name": "gallery_cvr",
        "provider": "heuristics",
        "asin_a": {
            "gallery_urls_found": len(urls_a),
            "sampled_images": imgs_a,
            "score": round(score_a_heur, 3),
        },
        "asin_b": {
            "gallery_urls_found": len(urls_b),
            "sampled_images": imgs_b,
            "score": round(score_b_heur, 3),
        },
        "cvr_winner": pick_with_margin(score_a_heur, score_b_heur),
        "confidence": round(abs(score_a_heur - score_b_heur), 3),
        "notes": [
            "Heuristic proxy for CVR based on gallery count + sampled resolution.",
            "Set OPENAI_API_KEY to use vision model scoring.",
        ],
    }


async def stage3_text_alignment(
    stage0: dict[str, Any],
    job: dict[str, Any] | None = None,
) -> dict[str, Any]:
    a = stage0["asin_a"]
    b = stage0["asin_b"]
    title_a = a.get("title")
    title_b = b.get("title")
    bullets_a = a.get("bullets") or []
    bullets_b = b.get("bullets") or []

    if not isinstance(bullets_a, list):
        bullets_a = []
    if not isinstance(bullets_b, list):
        bullets_b = []

    metrics_a = text_score(str(title_a) if title_a else None, [str(x) for x in bullets_a][:10])
    metrics_b = text_score(str(title_b) if title_b else None, [str(x) for x in bullets_b][:10])
    score_a_heur = float(metrics_a["score"])
    score_b_heur = float(metrics_b["score"])
    winner_heur = pick_with_margin(score_a_heur, score_b_heur)

    # Keyword overlap hint
    kw_a = set(safe_words((title_a or "") + " " + " ".join([str(x) for x in bullets_a])))
    kw_b = set(safe_words((title_b or "") + " " + " ".join([str(x) for x in bullets_b])))
    overlap = sorted(list(kw_a.intersection(kw_b)))[:20]

    openai_key = get_optional_env("OPENAI_API_KEY")
    if openai_key:
        try:
            prompt, prompt_integrity = load_prompt_with_integrity(job, "text-alignment/v1.0.md")
            model = get_optional_env("OPENAI_TEXT_MODEL", "gpt-4o-mini") or "gpt-4o-mini"
            llm = await openai_chat_json(
                system_prompt=prompt,
                model=model,
                user_content=[
                    {
                        "type": "text",
                        "text": json.dumps(
                            {
                                "asin_a": {
                                    "title": title_a,
                                    "bullets": [str(x) for x in bullets_a][:10],
                                },
                                "asin_b": {
                                    "title": title_b,
                                    "bullets": [str(x) for x in bullets_b][:10],
                                },
                            },
                            ensure_ascii=False,
                        ),
                    }
                ],
            )

            text_score_a_raw = safe_float(llm.get("text_score_a"), 0.0)
            text_score_b_raw = safe_float(llm.get("text_score_b"), 0.0)
            score_a = clamp01(text_score_a_raw / 10.0)
            score_b = clamp01(text_score_b_raw / 10.0)
            winner = str(llm.get("text_winner") or pick_with_margin(score_a, score_b)).upper()
            if winner not in {"A", "B", "TIE"}:
                winner = pick_with_margin(score_a, score_b)

            metrics_a_llm = {**metrics_a, "score": round(score_a, 3), "raw_score_1_to_10": round(text_score_a_raw, 2)}
            metrics_b_llm = {**metrics_b, "score": round(score_b, 3), "raw_score_1_to_10": round(text_score_b_raw, 2)}

            return {
                "stage_name": "text_alignment",
                "provider": "openai",
                "model": model,
                "asin_a": {"metrics": metrics_a_llm, "title": title_a, "bullets": bullets_a[:5]},
                "asin_b": {"metrics": metrics_b_llm, "title": title_b, "bullets": bullets_b[:5]},
                "text_winner": winner,
                "confidence": round(abs(score_a - score_b), 3),
                "analysis": llm.get("analysis"),
                "keyword_overlap": overlap,
                "prompt_integrity": prompt_integrity,
                "notes": [
                    "LLM text evaluation via prompts/text-alignment/v1.0.md.",
                    "Heuristic text metrics retained for deterministic fallback and debugging.",
                ],
            }
        except PromptIntegrityError:
            raise
        except Exception as e:
            return {
                "stage_name": "text_alignment",
                "provider": "heuristics_fallback",
                "fallback_reason": str(e),
                "asin_a": {"metrics": metrics_a, "title": title_a, "bullets": bullets_a[:5]},
                "asin_b": {"metrics": metrics_b, "title": title_b, "bullets": bullets_b[:5]},
                "text_winner": winner_heur,
                "confidence": round(abs(score_a_heur - score_b_heur), 3),
                "keyword_overlap": overlap,
                "notes": [
                    "OpenAI text scoring failed; used heuristic scoring (length + bullet structure).",
                ],
            }

    return {
        "stage_name": "text_alignment",
        "provider": "heuristics",
        "asin_a": {"metrics": metrics_a, "title": title_a, "bullets": bullets_a[:5]},
        "asin_b": {"metrics": metrics_b, "title": title_b, "bullets": bullets_b[:5]},
        "text_winner": winner_heur,
        "confidence": round(abs(score_a_heur - score_b_heur), 3),
        "keyword_overlap": overlap,
        "notes": [
            "Heuristic scoring based on title length + bullet count + bullet scannability.",
            "Set OPENAI_API_KEY to use LLM text scoring.",
        ],
    }


def pick_winner(score_a: float, score_b: float) -> str:
    return pick_with_margin(score_a, score_b)


async def stage4_avatars(
    stage1: dict[str, Any],
    stage2: dict[str, Any],
    stage3: dict[str, Any],
    job: dict[str, Any] | None = None,
) -> dict[str, Any]:
    # Lightweight baseline derived from stage scores.
    s1a = float(stage1.get("asin_a", {}).get("score", 0.0)) if isinstance(stage1.get("asin_a"), dict) else 0.0
    s1b = float(stage1.get("asin_b", {}).get("score", 0.0)) if isinstance(stage1.get("asin_b"), dict) else 0.0
    s2a = float(stage2.get("asin_a", {}).get("score", 0.0)) if isinstance(stage2.get("asin_a"), dict) else 0.0
    s2b = float(stage2.get("asin_b", {}).get("score", 0.0)) if isinstance(stage2.get("asin_b"), dict) else 0.0
    s3a = float(stage3.get("asin_a", {}).get("metrics", {}).get("score", 0.0)) if isinstance(stage3.get("asin_a"), dict) else 0.0
    s3b = float(stage3.get("asin_b", {}).get("metrics", {}).get("score", 0.0)) if isinstance(stage3.get("asin_b"), dict) else 0.0

    avatars = [
        {
            "name": "Skimmer Shopper",
            "cares_about": ["clear main image", "fast comprehension", "trust signals"],
            "leans_to": pick_winner(0.7 * s1a + 0.3 * s3a, 0.7 * s1b + 0.3 * s3b),
            "why": "Weights main image heavily, with some text clarity.",
        },
        {
            "name": "Detail Reviewer",
            "cares_about": ["gallery completeness", "bullet scannability", "spec clarity"],
            "leans_to": pick_winner(0.5 * s2a + 0.5 * s3a, 0.5 * s2b + 0.5 * s3b),
            "why": "Weights gallery and text equally.",
        },
        {
            "name": "Skeptical Comparator",
            "cares_about": ["consistent claims", "less hype", "structured bullets"],
            "leans_to": pick_winner(s3a, s3b),
            "why": "Primarily text-driven until a stronger evidence model is wired.",
        },
    ]

    openai_key = get_optional_env("OPENAI_API_KEY")
    if openai_key:
        try:
            prompt, prompt_integrity = load_prompt_with_integrity(job, "avatar-explanation/v1.0.md")
            model = get_optional_env("OPENAI_TEXT_MODEL", "gpt-4o-mini") or "gpt-4o-mini"
            llm = await openai_chat_json(
                system_prompt=prompt,
                model=model,
                user_content=[
                    {
                        "type": "text",
                        "text": json.dumps(
                            {
                                "stage1": stage1,
                                "stage2": stage2,
                                "stage3": stage3,
                                "reviewInsights": {
                                    "note": "MVP placeholder review insights until review mining is wired.",
                                    "top_concerns": [
                                        "effectiveness",
                                        "skin irritation risk",
                                        "adhesion quality",
                                        "value for quantity",
                                    ],
                                },
                            },
                            ensure_ascii=False,
                        ),
                    }
                ],
            )

            raw_avatars = llm.get("avatars")
            if not isinstance(raw_avatars, list) or not raw_avatars:
                raise RuntimeError("Avatar model output missing avatars[]")

            normalized: list[dict[str, Any]] = []
            for idx, item in enumerate(raw_avatars[:3], start=1):
                if not isinstance(item, dict):
                    continue
                preferred = str(item.get("preferred_asin") or "TIE").upper()
                if preferred not in {"A", "B", "TIE"}:
                    preferred = "TIE"
                key_factors = item.get("key_factors")
                if not isinstance(key_factors, list):
                    key_factors = []
                normalized.append(
                    {
                        "name": str(item.get("persona_name") or f"Persona {idx}"),
                        "cares_about": [str(x) for x in key_factors[:3]],
                        "leans_to": preferred,
                        "why": str(item.get("persona_profile") or item.get("derived_from") or ""),
                        "derived_from": item.get("derived_from"),
                        "ctr_reaction": item.get("ctr_reaction"),
                        "cvr_reaction": item.get("cvr_reaction"),
                        "primary_objection": item.get("primary_objection"),
                        "fix_suggestion": item.get("fix_suggestion"),
                        "confidence": clamp01(safe_float(item.get("confidence"), 0.0)),
                        "key_factors": [str(x) for x in key_factors],
                    }
                )

            if len(normalized) == 3:
                return {
                    "stage_name": "avatars",
                    "provider": "openai",
                    "model": model,
                    "avatars": normalized,
                    "prompt_integrity": prompt_integrity,
                    "notes": [
                        "LLM-generated personas using prompts/avatar-explanation/v1.0.md.",
                        "Personas are explanatory and do not alter deterministic scoring.",
                    ],
                }
        except PromptIntegrityError:
            raise
        except Exception as e:
            return {
                "stage_name": "avatars",
                "provider": "heuristics_fallback",
                "avatars": avatars,
                "fallback_reason": str(e),
                "notes": [
                    "OpenAI avatar generation failed; used heuristic personas.",
                ],
            }

    return {
        "stage_name": "avatars",
        "provider": "heuristics",
        "avatars": avatars,
        "notes": [
            "These are heuristic avatars (no review mining yet).",
            "To make them 'real', wire reviewInsights + LLM persona extraction.",
        ],
    }


async def stage5_verdict(
    job: dict[str, Any],
    stage1: dict[str, Any],
    stage2: dict[str, Any],
    stage3: dict[str, Any],
    stage4: dict[str, Any],
) -> dict[str, Any]:
    def get_score(stage: dict[str, Any], key: str) -> float:
        if not isinstance(stage, dict):
            return 0.0
        v = stage.get(key, {}).get("score") if isinstance(stage.get(key), dict) else None
        if isinstance(v, (int, float)):
            return float(v)
        return 0.0

    img_a = get_score(stage1, "asin_a")
    img_b = get_score(stage1, "asin_b")
    gal_a = get_score(stage2, "asin_a")
    gal_b = get_score(stage2, "asin_b")
    txt_a = float(stage3.get("asin_a", {}).get("metrics", {}).get("score", 0.0)) if isinstance(stage3.get("asin_a"), dict) else 0.0
    txt_b = float(stage3.get("asin_b", {}).get("metrics", {}).get("score", 0.0)) if isinstance(stage3.get("asin_b"), dict) else 0.0

    total_a = clamp01(0.4 * img_a + 0.3 * gal_a + 0.3 * txt_a)
    total_b = clamp01(0.4 * img_b + 0.3 * gal_b + 0.3 * txt_b)
    winner = pick_winner(total_a, total_b)

    fixes: list[dict[str, Any]] = []
    if winner == "A":
        loser = "B"
    elif winner == "B":
        loser = "A"
    else:
        loser = None

    def add_fix(priority: int, title: str, reason: str) -> None:
        fixes.append({"priority": priority, "title": title, "reason": reason})

    if loser:
        if (img_a if loser == "B" else img_b) < 0.7:
            add_fix(1, "Upgrade main image resolution", "Heuristic CTR proxy is low; target >= 1000px square.")
        if (gal_a if loser == "B" else gal_b) < 0.6:
            add_fix(2, "Add/upgrade gallery images", "Gallery proxy is low; add more high-res, varied angle/usage shots.")
        if (txt_a if loser == "B" else txt_b) < 0.6:
            add_fix(3, "Rewrite bullets for scannability", "Text proxy is low; aim for 5 bullets with ~10-25 words each.")

    provider_summary = {
        "stage1": stage1.get("provider"),
        "stage2": stage2.get("provider"),
        "stage3": stage3.get("provider"),
        "stage4": stage4.get("provider"),
    }

    return {
        "stage_name": "verdict",
        "provider": "heuristics",
        "job_id": str(job.get("id")),
        "asin_a": str(job.get("asin_a")),
        "asin_b": str(job.get("asin_b")),
        "scores": {
            "asin_a": {"image": round(img_a, 3), "gallery": round(gal_a, 3), "text": round(txt_a, 3), "total": round(total_a, 3)},
            "asin_b": {"image": round(img_b, 3), "gallery": round(gal_b, 3), "text": round(txt_b, 3), "total": round(total_b, 3)},
        },
        "winner": winner,
        "confidence": round(abs(total_a - total_b), 3),
        "provider_summary": provider_summary,
        "avatars_summary": [a.get("name") for a in (stage4.get("avatars") or [])][:3],
        "prioritized_fixes": sorted(fixes, key=lambda x: x["priority"])[:5],
        "notes": [
            "Final score is deterministic: 40% main image, 30% gallery, 30% text.",
            "When model providers are unavailable, stages auto-fallback to heuristic scoring.",
        ],
    }


async def run_pipeline_for_job(job_id: str) -> dict[str, Any]:
    job = await select_one("jobs", {"select": "*", "id": f"eq.{job_id}"})
    if not job:
        return {"job_id": job_id, "status": "not_found"}

    user_id = str(job.get("user_id") or "")

    async def emit_stage_event(
        *,
        stage_number: int,
        status: str,
        output: dict[str, Any],
        started_at: str | None,
        completed_at: str | None,
    ) -> None:
        if not user_id:
            return
        stage_name = STAGES[stage_number][1] if stage_number < len(STAGES) else f"stage_{stage_number}"
        provider = str(output.get("provider") or output.get("provider_used") or "unknown")
        props: dict[str, Any] = {
            "stage_name": stage_name,
            "status": status,
            "provider": provider,
        }
        took_ms = duration_ms(started_at, completed_at)
        if took_ms is not None:
            props["duration_ms"] = took_ms
        if status == "failed":
            props["error"] = str(output.get("error") or "unknown")
        await record_analytics_event(
            user_id=user_id,
            job_id=job_id,
            event_name=f"stage_{status}",
            stage_number=stage_number,
            properties=props,
        )

    if user_id:
        await record_analytics_event(
            user_id=user_id,
            job_id=job_id,
            event_name="pipeline_started",
            properties={
                "asin_a": str(job.get("asin_a") or ""),
                "asin_b": str(job.get("asin_b") or ""),
            },
        )

    await ensure_stage_rows(job_id)
    await set_job_status(job_id, "processing")

    stage_outputs: dict[int, dict[str, Any]] = {}

    # Stage 0
    stage0_started_at = utc_now_iso()
    await mark_stage(job_id, 0, {"status": "in_progress", "started_at": stage0_started_at})
    try:
        s0 = await stage0_listing_fetch(job)
        validate_stage_output(0, s0)
        stage_outputs[0] = s0
        if not s0.get("ok"):
            stage0_completed_at = utc_now_iso()
            await mark_stage(
                job_id,
                0,
                {"status": "failed", "completed_at": stage0_completed_at, "output": s0},
            )
            await emit_stage_event(
                stage_number=0,
                status="failed",
                output=s0,
                started_at=stage0_started_at,
                completed_at=stage0_completed_at,
            )
            await set_job_status(job_id, "failed")
            if user_id:
                await record_analytics_event(
                    user_id=user_id,
                    job_id=job_id,
                    event_name="pipeline_failed",
                    properties={"failed_stage": 0},
                )
            return {"job_id": job_id, "status": "failed"}
        stage0_completed_at = utc_now_iso()
        await mark_stage(
            job_id,
            0,
            {
                "status": "completed",
                "completed_at": stage0_completed_at,
                "output": s0,
                "provider_used": str(s0.get("provider") or "unknown"),
            },
        )
        await emit_stage_event(
            stage_number=0,
            status="completed",
            output=s0,
            started_at=stage0_started_at,
            completed_at=stage0_completed_at,
        )
    except Exception as e:
        out = {"stage_name": "listing_fetch", "ok": False, "error": str(e)}
        stage0_completed_at = utc_now_iso()
        await mark_stage(
            job_id,
            0,
            {"status": "failed", "completed_at": stage0_completed_at, "output": out},
        )
        await emit_stage_event(
            stage_number=0,
            status="failed",
            output=out,
            started_at=stage0_started_at,
            completed_at=stage0_completed_at,
        )
        await set_job_status(job_id, "failed")
        if user_id:
            await record_analytics_event(
                user_id=user_id,
                job_id=job_id,
                event_name="pipeline_failed",
                properties={"failed_stage": 0, "error": str(e)},
            )
        return {"job_id": job_id, "status": "failed"}

    # Stages 1-3 in parallel (best-effort)
    async def run_stage(n: int, coro) -> None:
        started_at = utc_now_iso()
        await mark_stage(job_id, n, {"status": "in_progress", "started_at": started_at})
        try:
            out = await coro
            validate_stage_output(n, out)
            stage_outputs[n] = out
            # If a stage returns its own "status", respect it; else mark completed.
            status = out.get("status") if isinstance(out, dict) else None
            final_status = status if status in {"skipped"} else "completed"
            completed_at = utc_now_iso()
            await mark_stage(
                job_id,
                n,
                {
                    "status": final_status,
                    "completed_at": completed_at,
                    "output": out,
                    "provider_used": str(out.get("provider") or "heuristics"),
                },
            )
            await emit_stage_event(
                stage_number=n,
                status=final_status,
                output=out,
                started_at=started_at,
                completed_at=completed_at,
            )
        except Exception as e:
            out = {"stage_name": STAGES[n][1] if n < len(STAGES) else f"stage_{n}", "error": str(e)}
            stage_outputs[n] = out
            completed_at = utc_now_iso()
            await mark_stage(
                job_id,
                n,
                {"status": "failed", "completed_at": completed_at, "output": out},
            )
            await emit_stage_event(
                stage_number=n,
                status="failed",
                output=out,
                started_at=started_at,
                completed_at=completed_at,
            )

    await asyncio.gather(
        run_stage(1, stage1_main_image_ctr(stage_outputs[0], job)),
        run_stage(2, stage2_gallery_cvr(stage_outputs[0], job)),
        run_stage(3, stage3_text_alignment(stage_outputs[0], job)),
    )

    # Stage 4
    stage4_started_at = utc_now_iso()
    await mark_stage(job_id, 4, {"status": "in_progress", "started_at": stage4_started_at})
    try:
        s4 = await stage4_avatars(
            stage_outputs.get(1, {}),
            stage_outputs.get(2, {}),
            stage_outputs.get(3, {}),
            job,
        )
        validate_stage_output(4, s4)
        stage_outputs[4] = s4
        stage4_completed_at = utc_now_iso()
        await mark_stage(
            job_id,
            4,
            {
                "status": "completed",
                "completed_at": stage4_completed_at,
                "output": s4,
                "provider_used": str(s4.get("provider") or "heuristics"),
            },
        )
        await emit_stage_event(
            stage_number=4,
            status="completed",
            output=s4,
            started_at=stage4_started_at,
            completed_at=stage4_completed_at,
        )
    except Exception as e:
        out = {"stage_name": "avatars", "error": str(e)}
        stage_outputs[4] = out
        stage4_completed_at = utc_now_iso()
        await mark_stage(
            job_id,
            4,
            {"status": "failed", "completed_at": stage4_completed_at, "output": out},
        )
        await emit_stage_event(
            stage_number=4,
            status="failed",
            output=out,
            started_at=stage4_started_at,
            completed_at=stage4_completed_at,
        )

    # Stage 5
    stage5_started_at = utc_now_iso()
    await mark_stage(job_id, 5, {"status": "in_progress", "started_at": stage5_started_at})
    try:
        s5 = await stage5_verdict(
            job,
            stage_outputs.get(1, {}),
            stage_outputs.get(2, {}),
            stage_outputs.get(3, {}),
            stage_outputs.get(4, {}),
        )
        validate_stage_output(5, s5)
        stage_outputs[5] = s5
        stage5_completed_at = utc_now_iso()
        await mark_stage(
            job_id,
            5,
            {
                "status": "completed",
                "completed_at": stage5_completed_at,
                "output": s5,
                "provider_used": str(s5.get("provider") or "heuristics"),
            },
        )
        await emit_stage_event(
            stage_number=5,
            status="completed",
            output=s5,
            started_at=stage5_started_at,
            completed_at=stage5_completed_at,
        )
        await set_job_status(job_id, "completed")
        if user_id:
            await record_analytics_event(
                user_id=user_id,
                job_id=job_id,
                event_name="pipeline_completed",
                properties={
                    "winner": str(s5.get("winner") or ""),
                    "confidence": safe_float(s5.get("confidence"), 0.0),
                },
            )
    except Exception as e:
        out = {"stage_name": "verdict", "error": str(e)}
        stage5_completed_at = utc_now_iso()
        await mark_stage(
            job_id,
            5,
            {"status": "failed", "completed_at": stage5_completed_at, "output": out},
        )
        await emit_stage_event(
            stage_number=5,
            status="failed",
            output=out,
            started_at=stage5_started_at,
            completed_at=stage5_completed_at,
        )
        await set_job_status(job_id, "failed")
        if user_id:
            await record_analytics_event(
                user_id=user_id,
                job_id=job_id,
                event_name="pipeline_failed",
                properties={"failed_stage": 5, "error": str(e)},
            )
        return {"job_id": job_id, "status": "failed"}

    return {"job_id": job_id, "status": "completed"}
