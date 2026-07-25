from __future__ import annotations

import json

import httpx
import pytest

from app.transcription.db_client import DemDbClient
from app.transcription.document_loop import process_document
from app.transcription.providers.mock import MockDemAdapter


def _sheet() -> dict:
    return {"schema_version":"paax.dem.sheet.v1","run_id":"R-1","document_id":"DOC-1","project_id":"PRJ-001","source":{"document_hash":"sha256:x","file_name":"t.pdf","page_index":0,"page_number":1,"render_uri":"u","width_px":1,"height_px":1},"generation":{"provider":"qwen","model_alias":"qwen-3.7-plus","prompt_version":"dem-extraction-v1.0.0","started_at":"2026-07-14T10:00:00Z"},"sheet_identity":{"sheet_number":{"value":"A-01","confidence":0.9},"title":{"value":"Denah","confidence":0.9},"discipline":{"value":"architecture","confidence":0.9,"status":"ai_interpreted"}},"completion":{"sections_expected":13,"sections_completed":13,"is_complete":True}}


class _Transport(httpx.AsyncBaseTransport):
    def __init__(self): self.pages={}; self.run={"id":"run-1","status":"created"}; self.n=0
    async def handle_async_request(self, request):
        p=request.url.path
        if p=="/dem/pages" and request.method=="POST":
            self.n+=1; i=f"page-{self.n}"; self.pages[i]={"id":i,"status":"queued","attempt_count":0}; return httpx.Response(200,json=self.pages[i])
        if p.startswith("/dem/pages/") and request.method=="PUT":
            i=p.rsplit("/",1)[-1]; self.pages[i].update(json.loads(request.content)); return httpx.Response(200,json=self.pages[i])
        if p=="/dem/runs/run-1" and request.method=="PUT": self.run.update(json.loads(request.content)); return httpx.Response(200,json=self.run)
        if p=="/dem/runs/run-1/status": return httpx.Response(200,json={**self.run,"pages":list(self.pages.values())})
        return httpx.Response(404)


def _pdf(n):
    import fitz
    d=fitz.open()
    for _ in range(n): d.new_page(width=200,height=100)
    return d.tobytes()


@pytest.mark.asyncio
async def test_process_document_marks_dem_complete_when_all_pages_succeed():
    t=_Transport(); c=DemDbClient(base_url="http://test",internal_key="x",transport=t)
    await process_document(_pdf(2),"run-1","DOC-1","sha256:x",2,MockDemAdapter(response=_sheet()),c,"dem-extraction-v1.0.0")
    assert t.run["status"]=="dem_complete"
    assert all(p["status"]=="complete" for p in t.pages.values())


@pytest.mark.asyncio
async def test_process_document_marks_partially_failed_when_a_page_fails():
    from app.transcription.failure_classification import DemProviderError

    t = _Transport()
    c = DemDbClient(base_url="http://test", internal_key="x", transport=t)
    await process_document(
        _pdf(2), "run-1", "DOC-1", "sha256:x", 2,
        MockDemAdapter(error=DemProviderError("bad auth", kind="permanent")),
        c, "dem-extraction-v1.0.0",
    )
    assert t.run["status"] == "partially_failed"


@pytest.mark.asyncio
async def test_process_document_with_project_id_does_not_auto_trigger_synthesis():
    t = _Transport()
    c = DemDbClient(base_url="http://test", internal_key="x", transport=t)
    await process_document(
        _pdf(2), "run-1", "DOC-1", "sha256:x", 2,
        MockDemAdapter(response=_sheet()),
        c, "dem-extraction-v1.0.0",
        project_id="test-project-123"
    )
    assert t.run["status"] == "dem_complete"
    assert all(p["status"] == "complete" for p in t.pages.values())

