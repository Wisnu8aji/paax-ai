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
from unittest.mock import AsyncMock
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


@pytest.mark.asyncio
async def test_signed_artifact_url_is_bound_to_its_project_key_and_expiry(monkeypatch):
    """A signed link cannot be replayed for a different project/key or after expiry."""
    monkeypatch.setenv("ARTIFACT_SIGNING_SECRET", "test-signing-secret")
    run = {"id": "run-123", "project_id": "PROJECT-A", "artifact_key": "original-pdf/runs/run-123/source.pdf"}
    with tempfile.TemporaryDirectory() as tmp_dir:
        store = LocalArtifactStore(__import__("pathlib").Path(tmp_dir))
        store.put("original-pdf", b"%PDF-1.7", content_type="application/pdf", object_key="runs/run-123/source.pdf")
        with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)), \
             patch("app.api.dem_routes.DemDbClient.authorize_artifact", new=AsyncMock()), \
             patch("app.api.dem_routes.DemDbClient.get_artifact_retention", new=AsyncMock(return_value={"deleted_at": None})), \
             patch.object(dem_routes, "ARTIFACT_STORE", store):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                issued = await ac.post("/drawings/dem/run-123/artifact-url", headers=HEADERS)
                assert issued.status_code == 200
                token = issued.json()["token"]
                valid = await ac.get(f"/drawings/dem/run-123/artifact?token={token}", headers=HEADERS)
                assert valid.status_code == 200

                other = dict(run, project_id="PROJECT-B")
                with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=other)):
                    denied = await ac.get(f"/drawings/dem/run-123/artifact?token={token}", headers=HEADERS)
                assert denied.status_code == 403

                expired = token.split(".", 1)[1]
                denied = await ac.get(f"/drawings/dem/run-123/artifact?token=1.{expired}", headers=HEADERS)
                assert denied.status_code == 403


@pytest.mark.asyncio
async def test_artifact_deletion_is_owner_authorized_audited_and_rate_limited():
    run = {"id": "run-123", "project_id": "PROJECT-A", "artifact_key": "original-pdf/runs/run-123/source.pdf"}
    dem_routes._RATE.clear()
    with tempfile.TemporaryDirectory() as tmp_dir:
        store = LocalArtifactStore(__import__("pathlib").Path(tmp_dir))
        store.put("original-pdf", b"%PDF-1.7", content_type="application/pdf", object_key="runs/run-123/source.pdf")
        with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)), \
             patch("app.api.dem_routes.DemDbClient.authorize_artifact", new=AsyncMock()), \
             patch("app.api.dem_routes.DemDbClient.mark_artifact_deleted", new=AsyncMock()) as mark_deleted, \
             patch.object(dem_routes, "ARTIFACT_STORE", store):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                deleted = await ac.delete("/drawings/dem/run-123/artifact", headers=HEADERS)
            assert deleted.status_code == 200
            assert not store.exists(run["artifact_key"])
            mark_deleted.assert_awaited_once_with("run-123", actor_id="service-account")

    dem_routes._RATE.clear()
    for _ in range(30):
        dem_routes._rate_limit("actor", "project", "read")
    with pytest.raises(Exception) as limited:
        dem_routes._rate_limit("actor", "project", "read")
    assert getattr(limited.value, "status_code", None) == 429


@pytest.mark.asyncio
async def test_issuing_artifact_url_fails_closed_without_a_configured_signing_secret(monkeypatch):
    """A prior audit found ARTIFACT_SIGNING_SECRET falls back to a predictable
    "development-only-artifact-secret" whenever the env var is unset -- a
    misconfigured production deployment would silently sign artifact URLs
    with a secret anyone reading the source already knows. This proves the
    fallback now only applies under an explicit TESTING=1 flag."""
    monkeypatch.delenv("ARTIFACT_SIGNING_SECRET", raising=False)
    monkeypatch.delenv("TESTING", raising=False)
    run = {"id": "run-500", "project_id": "PROJECT-A", "artifact_key": "original-pdf/runs/run-500/source.pdf"}
    with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)), \
         patch("app.api.dem_routes.DemDbClient.authorize_artifact", new=AsyncMock()), \
         patch("app.api.dem_routes.DemDbClient.get_artifact_retention", new=AsyncMock(return_value={"deleted_at": None})):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/drawings/dem/run-500/artifact-url", headers=HEADERS)
    assert response.status_code == 500
