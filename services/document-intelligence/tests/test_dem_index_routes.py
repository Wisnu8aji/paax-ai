"""Index route error mapping — no generic 500 for known upstream failures.

ORION-F1: preserve upstream status (404/401/403/503) for get_run,
authorization, and the canonical package index hop; never leak internal
details into the response body.
"""
from __future__ import annotations

import os

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")
os.environ.setdefault("TESTING", "1")

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, patch

from app.main import app

HEADERS = {"X-Internal-Key": "test-internal-key", "X-User-Id": "local-desktop-user"}

RUN_DICT = {
    "id": "run-123",
    "project_id": "PROJECT-A",
    "file_name": "test.pdf",
    "document_hash": "sha256:abc",
    "total_pages": 2,
    "status": "synthesis_complete",
}

CANONICAL_PAYLOAD = {
    "project_id": "PROJECT-A",
    "run_id": "run-123",
    "total_pages": 2,
    "confident_count": 1,
    "needs_review_count": 1,
    "pages": [
        {
            "page_index": 0,
            "page_number": 1,
            "sheet_code": "A-01",
            "title": "DENAH LANTAI 1",
            "discipline": "Architectural",
            "classification": "plan",
            "classification_status": "confident",
            "level": "Lantai 1",
            "non_level_category": "",
        },
        {
            "page_index": 1,
            "page_number": 2,
            "sheet_code": "S-01",
            "title": "DETAIL STRUKTUR",
            "discipline": "Structural",
            "classification": "detail",
            "classification_status": "needs_review",
            "level": "UNASSIGNED",
            "non_level_category": "Detail",
        },
    ],
}


def _http_status(status_code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", "http://db-test")
    return httpx.HTTPStatusError(
        f"upstream {status_code}", request=request, response=httpx.Response(status_code, request=request)
    )


@pytest.mark.asyncio
async def test_index_run_not_found_maps_to_404_not_500():
    """Regression: nonexistent run previously produced a generic 500."""
    with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(side_effect=_http_status(404))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/drawings/dem/no-such-run/index", headers=HEADERS)
    assert response.status_code == 404
    assert response.json()["detail"] == "DEM run not found"


@pytest.mark.asyncio
async def test_index_get_run_upstream_5xx_maps_to_503():
    with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(side_effect=_http_status(500))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/drawings/dem/run-123/index", headers=HEADERS)
    assert response.status_code == 503
    assert response.json()["detail"] == "run service is unavailable"


@pytest.mark.asyncio
async def test_index_get_run_connect_error_maps_to_503():
    with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(side_effect=httpx.ConnectError("connection refused"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/drawings/dem/run-123/index", headers=HEADERS)
    assert response.status_code == 503
    assert "unavailable" in response.json()["detail"]


@pytest.mark.asyncio
async def test_index_authorization_denied_maps_to_403():
    with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=RUN_DICT)), \
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock(side_effect=_http_status(403))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/drawings/dem/run-123/index", headers=HEADERS)
    assert response.status_code == 403
    assert response.json()["detail"] == "not a member of this project"


@pytest.mark.asyncio
async def test_index_authorization_service_down_maps_to_503():
    with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=RUN_DICT)), \
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock(side_effect=httpx.ConnectError("refused"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/drawings/dem/run-123/index", headers=HEADERS)
    assert response.status_code == 503
    assert "authorization" in response.json()["detail"]


@pytest.mark.asyncio
async def test_index_canonical_not_available_maps_to_404():
    with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=RUN_DICT)), \
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock(return_value=None)), \
         patch("app.api.dem_routes.DemDbClient.get_canonical_package_index", new=AsyncMock(side_effect=_http_status(404))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/drawings/dem/run-123/index", headers=HEADERS)
    assert response.status_code == 404
    assert response.json()["detail"] == "package index is not available for this run"


@pytest.mark.asyncio
async def test_index_canonical_upstream_5xx_maps_to_503():
    with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=RUN_DICT)), \
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock(return_value=None)), \
         patch("app.api.dem_routes.DemDbClient.get_canonical_package_index", new=AsyncMock(side_effect=_http_status(500))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/drawings/dem/run-123/index", headers=HEADERS)
    assert response.status_code == 503
    assert response.json()["detail"] == "package index service is unavailable"


@pytest.mark.asyncio
async def test_index_canonical_connect_error_maps_to_503():
    with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=RUN_DICT)), \
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock(return_value=None)), \
         patch("app.api.dem_routes.DemDbClient.get_canonical_package_index", new=AsyncMock(side_effect=httpx.ConnectError("refused"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/drawings/dem/run-123/index", headers=HEADERS)
    assert response.status_code == 503
    assert "unavailable" in response.json()["detail"]


@pytest.mark.asyncio
async def test_index_run_with_data_returns_200_with_schema_shape():
    with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=RUN_DICT)), \
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock(return_value=None)), \
         patch("app.api.dem_routes.DemDbClient.get_canonical_package_index", new=AsyncMock(return_value=CANONICAL_PAYLOAD)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/drawings/dem/run-123/index", headers=HEADERS)
    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"] == "run-123"
    assert payload["package_id"] == "run-run-123"
    assert payload["document_name"] == "test.pdf"
    assert payload["total_pages"] == 2
    assert len(payload["entries"]) == 2
    assert payload["entries"][0]["page_number"] == 1
    assert payload["entries"][1]["needs_review"] is True
    # Response shape is validated by the frontend's DrawingPackageIndexSchema
    # in index-state.test.ts (validateAndMergeIndex).
