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
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock()), \
         patch("app.api.dem_routes.DemDbClient.create_run", new=AsyncMock(return_value={"id": "R1"})) as create_run:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/drawings/dem/start", headers=HEADERS,
                data={"project_id": "PROJECT-A"},
                files={"file": ("../../plan.pdf", pdf, "application/pdf")},
            )
    assert response.status_code == 200
    assert queue.jobs and next(iter(queue.jobs.values())).payload["artifact_key"].startswith("original-pdf/")
    assert "pdf_path" not in create_run.await_args.kwargs
    assert create_run.await_args.kwargs["artifact_key"].startswith("original-pdf/")
    assert create_run.await_args.kwargs["requested_by"] == "service-account"


@pytest.mark.asyncio
async def test_start_authorizes_the_real_authenticated_actor_not_a_client_supplied_field(tmp_path):
    """The actor used for project-membership authorization must come from the
    request's own auth (get_current_user's resolved identity), never from a
    caller-controllable request field -- start_dem_run has no 'acting_as' or
    similar body field at all, so this proves the only identity in play is
    the one resolved from X-User-Id/the bearer token itself."""
    doc = fitz.open(); doc.new_page(); pdf = doc.tobytes(); doc.close()
    queue = InMemoryDurableJobStore()
    with patch.object(dem_routes, "ARTIFACT_STORE", LocalArtifactStore(tmp_path)), \
         patch.object(dem_routes, "JOB_QUEUE", queue), \
         patch.object(dem_routes, "MALWARE_SCANNER", _SafeScanner()), \
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock()) as authorize, \
         patch("app.api.dem_routes.DemDbClient.create_run", new=AsyncMock(return_value={"id": "R1"})):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post(
                "/drawings/dem/start",
                headers={"X-Internal-Key": "test-internal-key", "X-User-Id": "REAL-ACTOR"},
                data={"project_id": "PROJECT-A"},
                files={"file": ("plan.pdf", pdf, "application/pdf")},
            )
    # authorize_actor_for_project's first positional arg is the actor id --
    # it must be REAL-ACTOR (from the auth header), never anything the
    # request body could have supplied (start_dem_run takes no such field).
    assert authorize.await_args.args[0] == "REAL-ACTOR"
    assert authorize.await_args.args[1] == "PROJECT-A"


@pytest.mark.asyncio
async def test_synthesis_mode_is_validated_and_persisted_in_durable_job():
    queue = InMemoryDurableJobStore()
    run_status = {
        "id": "R1", "project_id": "PROJECT-A", "status": "dem_complete",
        "pages": [{"status": "complete"}],
    }
    with patch.object(dem_routes, "JOB_QUEUE", queue), \
         patch("app.api.dem_routes.DemDbClient.get_run_status", new=AsyncMock(return_value=run_status)), \
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock()), \
         patch("app.api.dem_routes.DemDbClient.update_run_status", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            invalid = await client.post("/drawings/dem/R1/synthesize?analysis_mode=extreme", headers=HEADERS)
            started = await client.post("/drawings/dem/R1/synthesize?analysis_mode=deep", headers=HEADERS)
    assert invalid.status_code == 422
    assert started.status_code == 200
    job = next(iter(queue.jobs.values()))
    assert job.job_type == "dem.synthesize"
    assert job.payload["analysis_mode"] == "deep"
