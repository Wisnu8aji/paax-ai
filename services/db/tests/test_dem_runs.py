"""Test dem_runs/dem_pages tables -- DEM Phase 2 job orchestrator persistence."""
import os

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")

from paax_db.main import app


HEADERS = {"X-Internal-Key": "test-internal-key", "X-User-Id": "user-abc"}


@pytest.mark.asyncio
async def test_dem_run_create_and_get():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/dem/runs",
            json={
                "project_id": "proj-1",
                "document_id": "DOC-PLHUT-001",
                "document_hash": "sha256:abc123",
                "file_name": "GAMBAR KERJA PLHUT SURAKARTA (1).pdf",
                "total_pages": 3,
                "provider": "qwen",
                "prompt_version": "dem-extraction-v1.0.0",
            },
            headers=HEADERS,
        )
        assert response.status_code == 200
        run = response.json()
        assert run["status"] == "created"
        assert run["total_pages"] == 3

        response = await ac.get(f"/dem/runs/{run['id']}", headers=HEADERS)
        assert response.status_code == 200
        assert response.json()["id"] == run["id"]
