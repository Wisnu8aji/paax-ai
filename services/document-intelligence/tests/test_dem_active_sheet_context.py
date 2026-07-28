from unittest.mock import AsyncMock, patch

import os
os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")

import pytest
from httpx import ASGITransport, AsyncClient

from app.api import dem_routes
from app.artifact_storage import LocalArtifactStore
from app.drawing_intelligence.models import (
    BBox, DrawingPackageAnalysis, PageIntelligence, PageProfile, PhysicalInstance,
    ReviewTask, WorkItemCandidate,
)
from app.main import app

HEADERS = {"X-Internal-Key": "test-internal-key", "X-User-Id": "user-1"}


def package() -> DrawingPackageAnalysis:
    pages = [
        PageIntelligence(profile=PageProfile(page_index=i, width_pt=100, height_pt=100, rotation=0, modality="vector", vector_text_spans=1, vector_paths=1, raster_images=0, confidence=1))
        for i in range(2)
    ]
    return DrawingPackageAnalysis(
        package_id="PKG", document_name="x.pdf", document_sha256="abc", page_count=2, pages=pages,
        work_items=[
            WorkItemCandidate(work_item_id="WI-0", category="column", label="K1", page_indices=[0], maturity="review_ready"),
            WorkItemCandidate(work_item_id="WI-1", category="beam", label="B1", page_indices=[1], maturity="review_ready"),
        ],
        physical_instances=[
            PhysicalInstance(instance_id="I-0", work_item_id="WI-0", category="column", code="K1", page_index=0, bbox=BBox(x0=0,y0=0,x1=.1,y1=.1), source_channel="dem"),
            PhysicalInstance(instance_id="I-1", work_item_id="WI-1", category="beam", code="B1", page_index=1, bbox=BBox(x0=.2,y0=.2,x1=.4,y1=.4), source_channel="dem"),
        ],
        review_queue=[ReviewTask(task_id="R-1", page_index=1, task_type="classification", title="Review", reason="unknown")],
    )


@pytest.mark.asyncio
async def test_active_sheet_context_returns_only_selected_page_and_is_project_authorized(tmp_path):
    store = LocalArtifactStore(tmp_path)
    store.put("drawing-intelligence", package().model_dump_json().encode(), content_type="application/json", object_key="runs/R/package-analysis.json")
    with patch.object(dem_routes, "ARTIFACT_STORE", store), \
         patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value={"id":"R","project_id":"P"})), \
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock()) as authorize:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/drawings/dem/R/intelligence/pages/1/context", headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["page_index"] == 1
    assert [row["work_item_id"] for row in body["work_items"]] == ["WI-1"]
    assert [row["instance_id"] for row in body["physical_instances"]] == ["I-1"]
    assert [row["task_id"] for row in body["review_queue"]] == ["R-1"]
    authorize.assert_awaited_once()


@pytest.mark.asyncio
async def test_active_sheet_context_missing_page_is_honest_404(tmp_path):
    store = LocalArtifactStore(tmp_path)
    store.put("drawing-intelligence", package().model_dump_json().encode(), content_type="application/json", object_key="runs/R/package-analysis.json")
    with patch.object(dem_routes, "ARTIFACT_STORE", store), \
         patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value={"id":"R","project_id":"P"})), \
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/drawings/dem/R/intelligence/pages/9/context", headers=HEADERS)
    assert response.status_code == 404
