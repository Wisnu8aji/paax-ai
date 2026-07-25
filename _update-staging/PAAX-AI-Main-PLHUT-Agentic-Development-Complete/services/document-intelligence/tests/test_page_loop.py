from __future__ import annotations

import hashlib
import json

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
