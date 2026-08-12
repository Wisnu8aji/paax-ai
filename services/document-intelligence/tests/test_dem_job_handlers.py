"""Acceptance tests 8-9 for Target 1 (production durable worker): the
dem.extract and dem.synthesize handlers actually drive the existing
deterministic pipeline functions (process_document /
synthesize_and_post_snapshot_task) end to end, producing real page/snapshot
state -- not just marking a job "completed" without doing anything."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.dem_job_handlers import DemJobHandlers
from app.transcription.db_client import DemDbClient
from app.transcription.providers.mock import MockDemAdapter


def _sheet() -> dict:
    return {
        "schema_version": "paax.dem.sheet.v1", "run_id": "run-1", "document_id": "DOC-1", "project_id": "PRJ-001",
        "source": {"document_hash": "sha256:x", "file_name": "t.pdf", "page_index": 0, "page_number": 1, "render_uri": "u", "width_px": 1, "height_px": 1},
        "generation": {"provider": "qwen", "model_alias": "qwen-3.7-plus", "prompt_version": "dem-extraction-v1.0.0", "started_at": "2026-07-14T10:00:00Z"},
        "sheet_identity": {"sheet_number": {"value": "A-01", "confidence": 0.9}, "title": {"value": "Denah", "confidence": 0.9}, "discipline": {"value": "architecture", "confidence": 0.9, "status": "ai_interpreted"}},
        "completion": {"sections_expected": 13, "sections_completed": 13, "is_complete": True},
    }


class _ExtractTransport(httpx.AsyncBaseTransport):
    def __init__(self):
        self.pages: dict[str, dict] = {}
        self.run = {"id": "run-1", "status": "created"}
        self._n = 0

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/dem/pages" and request.method == "POST":
            self._n += 1
            page_id = f"page-{self._n}"
            self.pages[page_id] = {"id": page_id, "status": "queued", "attempt_count": 0}
            return httpx.Response(200, json=self.pages[page_id])
        if path.startswith("/dem/pages/") and request.method == "PUT":
            page_id = path.rsplit("/", 1)[-1]
            self.pages[page_id].update(json.loads(request.content))
            return httpx.Response(200, json=self.pages[page_id])
        if path == "/dem/runs/run-1" and request.method == "PUT":
            self.run.update(json.loads(request.content))
            return httpx.Response(200, json=self.run)
        if path == "/dem/runs/run-1/status":
            return httpx.Response(200, json={**self.run, "pages": list(self.pages.values())})
        return httpx.Response(404)


class _FakeArtifactStore:
    def __init__(self, objects: dict[str, bytes]):
        self.objects = objects

    def get(self, key: str) -> bytes:
        return self.objects[key]


class _FakeRuntimePublisher:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def emit(self, event_type: str, **kwargs) -> dict:
        event = {"type": event_type, **kwargs}
        self.events.append(event)
        return event


def _pdf_bytes(n: int) -> bytes:
    import fitz
    doc = fitz.open()
    for _ in range(n):
        doc.new_page(width=200, height=100)
    return doc.tobytes()


@pytest.mark.asyncio
async def test_dem_extract_handler_produces_real_page_completion_state():
    """Acceptance test 8: dem.extract genuinely produces page state (not a
    no-op that just reports success)."""
    transport = _ExtractTransport()
    db_client = DemDbClient(base_url="http://test-db", internal_key="test-key", transport=transport)
    artifact_store = _FakeArtifactStore({"runs/DOC-1/source.pdf": _pdf_bytes(2)})

    handlers = DemJobHandlers(
        artifact_store=artifact_store,
        db_client=db_client,
        vision_provider=MockDemAdapter(response=_sheet()),
    )
    await handlers.handle_dem_extract({
        "run_id": "run-1", "document_id": "DOC-1", "document_hash": "sha256:x",
        "total_pages": 2, "artifact_key": "runs/DOC-1/source.pdf",
        "project_id": "PRJ-001", "file_name": "t.pdf", "prompt_version": "dem-extraction-v1.0.0",
    })

    assert transport.run["status"] == "dem_complete"
    assert len(transport.pages) == 2
    assert all(page["status"] == "complete" for page in transport.pages.values())
    assert all(page["result"]["sheet_identity"]["title"]["value"] == "Denah" for page in transport.pages.values())


@pytest.mark.asyncio
async def test_dem_extract_publishes_real_model_lifecycle_events():
    transport = _ExtractTransport()
    db_client = DemDbClient(base_url="http://test-db", internal_key="test-key", transport=transport)
    publisher = _FakeRuntimePublisher()
    artifact_store = _FakeArtifactStore({"runs/DOC-1/source.pdf": _pdf_bytes(1)})

    handlers = DemJobHandlers(
        artifact_store=artifact_store,
        db_client=db_client,
        vision_provider=MockDemAdapter(response=_sheet()),
        event_publisher_factory=lambda run_id: publisher,
    )
    await handlers.handle_dem_extract({
        "run_id": "run-1", "document_id": "DOC-1", "document_hash": "sha256:x",
        "total_pages": 1, "artifact_key": "runs/DOC-1/source.pdf",
        "project_id": "PRJ-001", "file_name": "t.pdf", "prompt_version": "dem-extraction-v1.0.0",
    })

    event_types = [event["type"] for event in publisher.events]
    assert event_types[0] == "run.started"
    assert "agent.started" in event_types
    assert "subagent.started" in event_types
    assert "task.completed" in event_types
    assert event_types[-1] == "agent.completed"


@pytest.mark.asyncio
async def test_dem_synthesize_handler_produces_real_snapshot_post():
    """Acceptance test 9: dem.synthesize genuinely produces snapshot state
    (posts a real snapshot build request), not a no-op."""
    mock_db_client = MagicMock(spec=DemDbClient)
    mock_db_client.get_run_status = AsyncMock(return_value={
        "project_id": "PRJ-001",
        "pages": [{"page_index": 0, "status": "complete", "id": "PAGE-ID-0", "result": _sheet()}],
    })
    mock_db_client.update_run_status = AsyncMock()

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"status": "success"}
    mock_client_in_context = AsyncMock()
    mock_client_in_context.post = AsyncMock(return_value=mock_response)
    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client_in_context)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    async def async_client_context():
        return mock_client
    mock_db_client._client = async_client_context
    mock_db_client._headers.return_value = {"Authorization": "Bearer token"}

    handlers = DemJobHandlers(artifact_store=_FakeArtifactStore({}), db_client=mock_db_client)
    await handlers.handle_dem_synthesize({"run_id": "run-1", "project_id": "PRJ-001"})

    mock_client_in_context.post.assert_called_once()
    posted_url = mock_client_in_context.post.call_args[0][0]
    assert posted_url == "/projects/PRJ-001/project-graph/snapshots"
    mock_db_client.update_run_status.assert_called_once_with("run-1", "synthesis_complete")
