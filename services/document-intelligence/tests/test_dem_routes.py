from __future__ import annotations

import os

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")

import pytest
from httpx import ASGITransport, AsyncClient

from app.api import dem_routes
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
        pdf_path = os.path.join(tmp_dir, "test.pdf")
        doc.save(pdf_path)
        doc.close()

        with patch("app.api.dem_routes.DemDbClient.get_run") as mock_get_run, \
             patch("app.api.dem_routes.UPLOAD_DIR", tmp_dir):
            
            mock_get_run.return_value = {
                "id": "run-123",
                "pdf_path": pdf_path,
                "total_pages": 1,
            }

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.get("/drawings/dem/run-123/pages/0/image", headers=HEADERS)
                assert response.status_code == 200
                assert response.headers["content-type"] == "image/png"
                png_bytes = response.content
                assert len(png_bytes) > 0

                cache_file = os.path.join(tmp_dir, "cache_run-123_0.png")
                assert os.path.exists(cache_file)

                mock_get_run.side_effect = Exception("Should not be called")
                response = await ac.get("/drawings/dem/run-123/pages/0/image", headers=HEADERS)
                assert response.status_code == 200
                assert response.content == png_bytes


@pytest.mark.asyncio
async def test_get_page_image_out_of_bounds():
    with tempfile.TemporaryDirectory() as tmp_dir:
        import fitz
        doc = fitz.open()
        doc.new_page(width=100, height=100)
        pdf_path = os.path.join(tmp_dir, "test.pdf")
        doc.save(pdf_path)
        doc.close()

        with patch("app.api.dem_routes.DemDbClient.get_run") as mock_get_run, \
             patch("app.api.dem_routes.UPLOAD_DIR", tmp_dir):
            
            mock_get_run.return_value = {
                "id": "run-123",
                "pdf_path": pdf_path,
                "total_pages": 1,
            }

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.get("/drawings/dem/run-123/pages/5/image", headers=HEADERS)
                assert response.status_code == 404
                assert response.json()["detail"] == "Page index out of bounds"
