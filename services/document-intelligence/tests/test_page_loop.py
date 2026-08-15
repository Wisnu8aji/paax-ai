from __future__ import annotations

import asyncio
import hashlib
import json
import time

import httpx
import pytest

from app.transcription.db_client import DemDbClient
from app.transcription.failure_classification import DemProviderError
from app.transcription.page_loop import process_page
from app.transcription.providers.mock import MockDemAdapter


def _valid_sheet_dict(document_id: str = "DOC-1") -> dict:
    return {
        "schema_version": "paax.dem.sheet.v1", "run_id": "DEMRUN-20260714-001", "document_id": document_id, "project_id": "PRJ-001",
        "source": {"document_hash": "sha256:x", "file_name": "test.pdf", "page_index": 0, "page_number": 1, "render_uri": "object://renders/doc-1/page-001.png", "width_px": 100, "height_px": 100},
        "generation": {"provider": "qwen", "model_alias": "qwen-3.7-plus", "prompt_version": "dem-extraction-v1.0.0", "started_at": "2026-07-14T10:00:00Z"},
        "sheet_identity": {"sheet_number": {"value": "A-01", "confidence": 0.9}, "title": {"value": "Denah", "confidence": 0.9}, "discipline": {"value": "architecture", "confidence": 0.9, "status": "ai_interpreted"}},
        "completion": {"sections_expected": 13, "sections_completed": 13, "is_complete": True},
    }


class _RecordingTransport(httpx.AsyncBaseTransport):
    def __init__(self):
        self.pages: dict[str, dict] = {}
        self._next_id = 1

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/dem/pages" and request.method == "POST":
            page_id = f"page-{self._next_id}"
            self._next_id += 1
            self.pages[page_id] = {"id": page_id, "status": "queued", "attempt_count": 0}
            return httpx.Response(200, json=self.pages[page_id])
        if request.url.path.startswith("/dem/pages/") and request.method == "PUT":
            page_id = request.url.path.rsplit("/", 1)[-1]
            self.pages[page_id].update(json.loads(request.content))
            return httpx.Response(200, json=self.pages[page_id])
        return httpx.Response(404)


def _minimal_pdf_bytes() -> bytes:
    import fitz
    doc = fitz.open()
    doc.new_page(width=200, height=100)
    return doc.tobytes()


@pytest.mark.asyncio
async def test_process_page_success_persists_result():
    transport = _RecordingTransport()
    db_client = DemDbClient(base_url="http://test-db", internal_key="test-key", transport=transport)
    page_row = await db_client.create_page("run-1", 0)
    await process_page(_minimal_pdf_bytes(), 0, page_row["id"], {"id": "run-1", "document_id": "DOC-1", "document_hash": "sha256:x"}, MockDemAdapter(response=_valid_sheet_dict()), db_client, "dem-extraction-v1.0.0")
    assert transport.pages[page_row["id"]]["status"] == "complete"
    assert transport.pages[page_row["id"]]["result"]["sheet_identity"]["title"]["value"] == "Denah"


@pytest.mark.asyncio
async def test_process_page_persists_the_configured_vision_model_alias():
    """Persisted evidence must identify the model that actually read the page."""
    transport = _RecordingTransport()
    db_client = DemDbClient(base_url="http://test-db", internal_key="test-key", transport=transport)
    page_row = await db_client.create_page("run-1", 0)
    provider = MockDemAdapter(response=_valid_sheet_dict())
    provider.model = "mimo-v2.5"

    await process_page(
        _minimal_pdf_bytes(), 0, page_row["id"],
        {"id": "run-1", "document_id": "DOC-1", "document_hash": "sha256:x"},
        provider, db_client, "dem-extraction-v1.0.0",
    )

    assert transport.pages[page_row["id"]]["result"]["generation"]["model_alias"] == "mimo-v2.5"


@pytest.mark.asyncio
async def test_process_page_permanent_failure_does_not_retry():
    transport = _RecordingTransport()
    db_client = DemDbClient(base_url="http://test-db", internal_key="test-key", transport=transport)
    page_row = await db_client.create_page("run-1", 0)
    await process_page(_minimal_pdf_bytes(), 0, page_row["id"], {"id": "run-1", "document_id": "DOC-1", "document_hash": "sha256:x"}, MockDemAdapter(error=DemProviderError("bad auth", kind="permanent")), db_client, "dem-extraction-v1.0.0")
    assert transport.pages[page_row["id"]]["status"] == "failed"
    assert transport.pages[page_row["id"]]["failure_kind"] == "permanent"
    assert transport.pages[page_row["id"]]["attempt_count"] == 0


@pytest.mark.asyncio
async def test_process_page_skips_when_already_complete_with_matching_hash():
    transport = _RecordingTransport()
    db_client = DemDbClient(base_url="http://test-db", internal_key="test-key", transport=transport)
    page_row = await db_client.create_page("run-1", 0)
    page_bytes = _minimal_pdf_bytes()
    transport.pages[page_row["id"]].update({"status": "complete", "input_hash": hashlib.sha256(page_bytes).hexdigest()})
    await process_page(page_bytes, 0, page_row["id"], {"id": "run-1", "document_id": "DOC-1", "document_hash": "sha256:x"}, MockDemAdapter(error=DemProviderError("should not be called", kind="permanent")), db_client, "dem-extraction-v1.0.0", existing_page=transport.pages[page_row["id"]])
    assert transport.pages[page_row["id"]]["status"] == "complete"


@pytest.mark.asyncio
async def test_process_page_keeps_event_loop_available_during_blocking_provider_call():
    """A slow synchronous provider must not starve the durable-worker heartbeat."""
    transport = _RecordingTransport()
    db_client = DemDbClient(base_url="http://test-db", internal_key="test-key", transport=transport)
    page_row = await db_client.create_page("run-1", 0)
    heartbeat_tick = asyncio.Event()

    class BlockingProvider(MockDemAdapter):
        def __init__(self):
            super().__init__(response=_valid_sheet_dict())
            self.heartbeat_observed = False

        def extract_page(self, image_bytes, context, prompt_version):
            time.sleep(0.08)
            self.heartbeat_observed = heartbeat_tick.is_set()
            return super().extract_page(image_bytes, context, prompt_version)

    async def tick_heartbeat():
        await asyncio.sleep(0.01)
        heartbeat_tick.set()

    provider = BlockingProvider()
    heartbeat = asyncio.create_task(tick_heartbeat())
    await process_page(
        _minimal_pdf_bytes(), 0, page_row["id"],
        {"id": "run-1", "document_id": "DOC-1", "document_hash": "sha256:x"},
        provider, db_client, "dem-extraction-v1.0.0",
    )
    await heartbeat

    assert provider.heartbeat_observed is True


@pytest.mark.asyncio
async def test_process_page_honors_a_separate_render_semaphore(monkeypatch):
    """Rendering stays bounded while the vision fan-out can remain at 20."""
    from app.transcription import page_loop

    transport = _RecordingTransport()
    db_client = DemDbClient(base_url="http://test-db", internal_key="test-key", transport=transport)
    page_rows = [await db_client.create_page("run-1", index) for index in range(2)]
    original_render = page_loop.render_page
    active = 0
    peak = 0

    def tracked_render(*args, **kwargs):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        try:
            time.sleep(0.03)
            return original_render(*args, **kwargs)
        finally:
            active -= 1

    monkeypatch.setattr(page_loop, "render_page", tracked_render)
    render_semaphore = asyncio.Semaphore(1)
    import fitz
    document = fitz.open()
    document.new_page(width=200, height=100)
    document.new_page(width=200, height=100)
    pdf_bytes = document.tobytes()
    document.close()
    run = {"id": "run-1", "document_id": "DOC-1", "document_hash": "sha256:x"}
    await asyncio.gather(*(
        process_page(
            pdf_bytes, index, page_rows[index]["id"], run,
            MockDemAdapter(response=_valid_sheet_dict()), db_client,
            "dem-extraction-v1.0.0", render_semaphore=render_semaphore,
        )
        for index in range(2)
    ))

    assert peak == 1
