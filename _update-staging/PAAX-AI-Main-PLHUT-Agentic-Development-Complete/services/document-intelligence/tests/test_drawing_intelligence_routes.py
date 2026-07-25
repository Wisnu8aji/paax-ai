from __future__ import annotations

import io
import os

import fitz
import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("TESTING", "1")
os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")

from app.main import app

HEADERS = {"X-Internal-Key": "test-internal-key"}


def _pdf() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=900, height=600)
    page.draw_rect(fitz.Rect(80, 100, 280, 260), color=(0, 0, 0))
    page.insert_text((150, 180), "K1", fontsize=16)
    page.draw_rect(fitz.Rect(620, 80, 860, 250), color=(0, 0, 0))
    page.insert_text((640, 110), "KETERANGAN", fontsize=14)
    page.insert_text((640, 145), "K1 400 x 400 mm KOLOM BETON", fontsize=11)
    data = doc.tobytes()
    doc.close()
    return data


@pytest.mark.asyncio
async def test_analyze_summary_returns_truthful_delivery_contract():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/drawings/intelligence/analyze-summary",
            headers=HEADERS,
            data={"mode": "fast", "max_pages": "1"},
            files={"file": ("drawing.pdf", _pdf(), "application/pdf")},
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == "paax.drawing-intelligence.delivery.v1"
    assert payload["safety"]["physical_counts_auto_accepted"] is False
    assert payload["safety"]["final_quantities_calculated"] is False
    assert payload["page_count"] == 1


@pytest.mark.asyncio
async def test_direct_one_click_area_returns_candidate_not_final_quantity():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/drawings/intelligence/one-click-area",
            headers=HEADERS,
            data={
                "page_index": "0",
                "positive_points_json": "[[0.2,0.3]]",
                "negative_points_json": "[]",
            },
            files={"file": ("drawing.pdf", _pdf(), "application/pdf")},
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["kind"] == "area"
    assert payload["raw_value"] > 0
    assert payload["scaled_value"] is None


@pytest.mark.asyncio
async def test_invalid_analysis_mode_is_rejected():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/drawings/intelligence/analyze-summary",
            headers=HEADERS,
            data={"mode": "impossible"},
            files={"file": ("drawing.pdf", _pdf(), "application/pdf")},
        )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_analyze_human_returns_plain_language_work_items_and_review_batches():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/drawings/intelligence/analyze-human",
            headers=HEADERS,
            data={"mode": "deep", "max_pages": "1"},
            files={"file": ("drawing.pdf", _pdf(), "application/pdf")},
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == "paax.drawing-intelligence.human-delivery.v2"
    assert payload["summary"]["recognized_work_items"] >= 1
    item = next(row for row in payload["work_items"] if row["code"] == "K1")
    assert item["technical_name"] == "Kolom"
    assert item["count_is_final"] is False
    assert payload["review_batches"]
