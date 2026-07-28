from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

import fitz
import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")

from app.api import dem_routes
from app.artifact_storage import LocalArtifactStore
from app.main import app

HEADERS = {"X-Internal-Key": "test-internal-key", "X-User-Id": "user-1"}


def make_pdf() -> bytes:
    document = fitz.open()
    page = document.new_page(width=600, height=800)
    page.insert_text((72, 72), "DENAH LANTAI 1")
    data = document.tobytes()
    document.close()
    return data


@pytest.fixture
def thumbnail_fixture(tmp_path):
    store = LocalArtifactStore(tmp_path)
    pdf = make_pdf()
    key = store.put("original-pdf", pdf, content_type="application/pdf", object_key="runs/run-thumb/source.pdf")
    run = {"id": "run-thumb", "project_id": "PROJECT-A", "artifact_key": key, "total_pages": 1}
    return store, run, pdf


async def request_thumbnail(query="width=160", headers=None):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.get(
            f"/drawings/dem/run-thumb/pages/0/thumbnail?{query}",
            headers={**HEADERS, **(headers or {})},
        )


@pytest.mark.asyncio
async def test_thumbnail_is_authorised_png_cached_and_not_original_bytes(thumbnail_fixture):
    store, run, pdf = thumbnail_fixture
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)
    ), patch(
        "app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock(return_value=None)
    ), patch(
        "app.api.dem_routes.DemDbClient.authorize_artifact", new=AsyncMock(return_value=None)
    ):
        response = await request_thumbnail()
        second = await request_thumbnail()
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/png")
    assert response.content.startswith(b"\x89PNG")
    assert response.content != pdf
    assert response.headers["etag"] == second.headers["etag"]


@pytest.mark.asyncio
async def test_thumbnail_supports_etag_not_modified(thumbnail_fixture):
    store, run, _ = thumbnail_fixture
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)
    ), patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock(return_value=None)), patch(
        "app.api.dem_routes.DemDbClient.authorize_artifact", new=AsyncMock(return_value=None)
    ):
        first = await request_thumbnail()
        cached = await request_thumbnail(headers={"If-None-Match": first.headers["etag"]})
    assert cached.status_code == 304
    assert cached.content == b""


@pytest.mark.asyncio
async def test_thumbnail_rejects_width_above_contract(thumbnail_fixture):
    store, run, _ = thumbnail_fixture
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)
    ):
        response = await request_thumbnail("width=321")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_thumbnail_denies_unauthorised_project(thumbnail_fixture):
    store, run, _ = thumbnail_fixture
    denied = RuntimeError("denied")
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)
    ), patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock(side_effect=denied)):
        response = await request_thumbnail()
    assert response.status_code == 403
