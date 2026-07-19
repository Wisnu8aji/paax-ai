from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

import fitz
import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")

from app.api import dem_routes
from app.artifact_storage import LocalArtifactStore
from app.durable_jobs import InMemoryDurableJobStore
from app.main import app

HEADERS = {"X-Internal-Key": "test-internal-key"}


class _SafeScanner:
    def scan(self, data: bytes, *, filename: str) -> bool:
        return True


@pytest.mark.asyncio
async def test_start_persists_only_object_key_and_enqueues_idempotent_durable_extraction(tmp_path):
    doc = fitz.open(); doc.new_page(); pdf = doc.tobytes(); doc.close()
    queue = InMemoryDurableJobStore()
    with patch.object(dem_routes, "ARTIFACT_STORE", LocalArtifactStore(tmp_path)), \
         patch.object(dem_routes, "JOB_QUEUE", queue), \
         patch.object(dem_routes, "MALWARE_SCANNER", _SafeScanner()), \
         patch("app.api.dem_routes.DemDbClient.create_run", new=AsyncMock(return_value={"id": "R1"})) as create_run:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/drawings/dem/start", headers=HEADERS, files={"file": ("../../plan.pdf", pdf, "application/pdf")})
    assert response.status_code == 200
    assert queue.jobs and next(iter(queue.jobs.values())).payload["artifact_key"].startswith("original-pdf/")
    assert "pdf_path" not in create_run.await_args.kwargs
    assert create_run.await_args.kwargs["artifact_key"].startswith("original-pdf/")
