"""Phase C Verification — Test thumbnail endpoints for pages 0, 6, 38, 56, 87 of PLHUT run."""
from __future__ import annotations

import os
from pathlib import Path

import fitz
import pytest
from httpx import ASGITransport, AsyncClient

os.environ["TESTING"] = "1"
os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")

from app.api import dem_routes
from app.artifact_storage import LocalArtifactStore
from app.main import app

REPO_ROOT = Path(__file__).resolve().parents[3]
PLHUT_RUN_ID = "514fb7f2-26fd-5816-9f22-a4a2412688bf"
HEADERS = {"X-Internal-Key": "test-internal-key", "X-User-Id": "paax-web"}


@pytest.fixture
def real_plhut_artifact_store():
    art_dir = REPO_ROOT / "services" / "document-intelligence" / ".artifacts"
    if not art_dir.is_dir():
        pytest.skip(".artifacts directory not found")
    store = LocalArtifactStore(art_dir)
    canonical_key = f"original-pdf/runs/{PLHUT_RUN_ID}"
    if not store.exists(canonical_key):
        # Seed from manifest if needed
        pdf_path = REPO_ROOT / "fixtures" / "plhut" / "GAMBAR KERJA PLHUT SURAKARTA (1).pdf"
        if not pdf_path.exists():
            pytest.skip("PLHUT fixture PDF not found")
        store.put("original-pdf", pdf_path.read_bytes(), content_type="application/pdf", object_key=f"runs/{PLHUT_RUN_ID}")
    return store


@pytest.mark.asyncio
@pytest.mark.parametrize("page_index", [0, 6, 38, 56, 87])
async def test_thumbnail_pages_valid_png_and_dimensions(real_plhut_artifact_store, page_index: int):
    store = real_plhut_artifact_store
    mock_run = {
        "id": PLHUT_RUN_ID,
        "project_id": "PLHUT-SURAKARTA",
        "artifact_key": f"original-pdf/runs/{PLHUT_RUN_ID}",
        "total_pages": 88,
    }

    from unittest.mock import AsyncMock, patch
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=mock_run)
    ), patch(
        "app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock(return_value=None)
    ), patch(
        "app.api.dem_routes.DemDbClient.authorize_artifact", new=AsyncMock(return_value=None)
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                f"/drawings/dem/{PLHUT_RUN_ID}/pages/{page_index}/thumbnail?width=320",
                headers=HEADERS,
            )

    assert resp.status_code == 200, f"Page {page_index} thumbnail returned status {resp.status_code}"
    assert resp.headers["content-type"].startswith("image/png")
    assert len(resp.content) > 0, f"Page {page_index} thumbnail content is empty"
    assert resp.content.startswith(b"\x89PNG"), f"Page {page_index} thumbnail is not a valid PNG"

    # Validate image dimensions using PyMuPDF
    doc = fitz.open(stream=resp.content, filetype="png")
    assert doc.page_count == 1
    page = doc[0]
    pix = page.get_pixmap()
    assert pix.width > 0, f"Page {page_index} image width must be > 0"
    assert pix.height > 0, f"Page {page_index} image height must be > 0"
    doc.close()


@pytest.mark.asyncio
async def test_thumbnail_cache_etag_304(real_plhut_artifact_store):
    store = real_plhut_artifact_store
    mock_run = {
        "id": PLHUT_RUN_ID,
        "project_id": "PLHUT-SURAKARTA",
        "artifact_key": f"original-pdf/runs/{PLHUT_RUN_ID}",
        "total_pages": 88,
    }

    from unittest.mock import AsyncMock, patch
    with patch.object(dem_routes, "ARTIFACT_STORE", store), patch(
        "app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=mock_run)
    ), patch(
        "app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock(return_value=None)
    ), patch(
        "app.api.dem_routes.DemDbClient.authorize_artifact", new=AsyncMock(return_value=None)
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res1 = await client.get(
                f"/drawings/dem/{PLHUT_RUN_ID}/pages/0/thumbnail?width=320",
                headers=HEADERS,
            )
            etag = res1.headers.get("etag")
            assert etag is not None

            res2 = await client.get(
                f"/drawings/dem/{PLHUT_RUN_ID}/pages/0/thumbnail?width=320",
                headers={**HEADERS, "If-None-Match": etag},
            )

    assert res2.status_code == 304
    assert res2.content == b""
