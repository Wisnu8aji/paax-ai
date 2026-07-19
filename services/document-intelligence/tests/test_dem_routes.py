from __future__ import annotations

import os

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")

import pytest
from httpx import ASGITransport, AsyncClient

from app.api import dem_routes
from app.artifact_storage import LocalArtifactStore
from app.main import app

HEADERS = {"X-Internal-Key": "test-internal-key"}


def test_dem_routes_are_registered():
    included = [getattr(route, "original_router", None) for route in app.routes]
    assert dem_routes.router in included


from unittest.mock import patch, MagicMock
import tempfile

@pytest.mark.asyncio
async def test_get_page_image_not_found():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.api.dem_routes.DemDbClient.get_run") as mock_get_run:
            import httpx
            mock_response = httpx.Response(404, request=httpx.Request("GET", "http://test"))
            mock_get_run.side_effect = httpx.HTTPStatusError("not found", request=mock_response.request, response=mock_response)
            
            response = await ac.get("/drawings/dem/invalid-run/pages/0/image", headers=HEADERS)
            assert response.status_code == 404
            assert response.json()["detail"] == "DEM run not found"


@pytest.mark.asyncio
async def test_get_page_image_valid_and_cached():
    with tempfile.TemporaryDirectory() as tmp_dir:
        import fitz
        doc = fitz.open()
        doc.new_page(width=100, height=100)
        pdf_bytes = doc.tobytes()
        doc.close()

        store = LocalArtifactStore(__import__("pathlib").Path(tmp_dir))
        artifact_key = store.put("original-pdf", pdf_bytes, content_type="application/pdf", object_key="runs/run-123/source.pdf")
        with patch("app.api.dem_routes.DemDbClient.get_run") as mock_get_run, \
             patch("app.api.dem_routes.DemDbClient.authorize_artifact") as authorize, \
             patch.object(dem_routes, "ARTIFACT_STORE", store):
            
            mock_get_run.return_value = {
                "id": "run-123",
                    "artifact_key": artifact_key,
                    "project_id": "PROJECT-A",
                "total_pages": 1,
            }

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.get("/drawings/dem/run-123/pages/0/image", headers=HEADERS)
                assert response.status_code == 200
                assert response.headers["content-type"] == "image/png"
                png_bytes = response.content
                assert len(png_bytes) > 0



@pytest.mark.asyncio
async def test_get_page_image_out_of_bounds():
    with tempfile.TemporaryDirectory() as tmp_dir:
        import fitz
        doc = fitz.open()
        doc.new_page(width=100, height=100)
        pdf_bytes = doc.tobytes()
        doc.close()

        store = LocalArtifactStore(__import__("pathlib").Path(tmp_dir))
        artifact_key = store.put("original-pdf", pdf_bytes, content_type="application/pdf", object_key="runs/run-123/source.pdf")
        with patch("app.api.dem_routes.DemDbClient.get_run") as mock_get_run, \
             patch.object(dem_routes, "ARTIFACT_STORE", store):
            
            mock_get_run.return_value = {
                "id": "run-123",
                "artifact_key": artifact_key,
                "total_pages": 1,
            }

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.get("/drawings/dem/run-123/pages/5/image", headers=HEADERS)
                assert response.status_code == 404
                assert response.json()["detail"] == "Page index out of bounds"
