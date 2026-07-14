from __future__ import annotations

import hashlib
import json

import httpx
import pytest

from app.transcription.db_client import DemDbClient
from app.transcription.document_loop import process_document
from app.transcription.failure_classification import DemProviderError
from app.transcription.providers.mock import MockDemAdapter


def _sheet() -> dict:
    return {"schema_version":"paax.dem.sheet.v1","run_id":"R-1","document_id":"DOC-1","project_id":"PRJ-001","source":{"document_hash":"sha256:x","file_name":"t.pdf","page_index":0,"page_number":1,"render_uri":"u","width_px":1,"height_px":1},"generation":{"provider":"qwen","model_alias":"qwen-3.7-plus","prompt_version":"dem-extraction-v1.0.0","started_at":"2026-07-14T10:00:00Z"},"sheet_identity":{"sheet_number":{"value":"A-01","confidence":0.9},"title":{"value":"Denah","confidence":0.9},"discipline":{"value":"architecture","confidence":0.9,"status":"ai_interpreted"}},"completion":{"sections_expected":13,"sections_completed":13,"is_complete":True}}


def _pdf():
    import fitz
    d=fitz.open(); d.new_page(width=200,height=100); d.new_page(width=200,height=100); return d.tobytes()


class _Transport(httpx.AsyncBaseTransport):
    def __init__(self, seeded_page0_input_hash: str):
        self.pages={"page-0":{"id":"page-0","page_index":0,"status":"complete","attempt_count":0,"input_hash":seeded_page0_input_hash}}
        self.run={"id":"run-1","status":"partially_failed"}
        self.n=0
    async def handle_async_request(self, request):
        p=request.url.path
        if p=="/dem/runs/run-1/status": return httpx.Response(200,json={**self.run,"pages":list(self.pages.values())})
        if p=="/dem/pages" and request.method=="POST":
            i=f"page-{request.url.params['page_index']}-new"; self.pages[i]={"id":i,"page_index":int(request.url.params['page_index']),"status":"queued","attempt_count":0}; return httpx.Response(200,json=self.pages[i])
        if p.startswith("/dem/pages/") and request.method=="PUT":
            i=p.rsplit("/",1)[-1]; self.pages[i].update(json.loads(request.content)); return httpx.Response(200,json=self.pages[i])
        if p=="/dem/runs/run-1" and request.method=="PUT": self.run.update(json.loads(request.content)); return httpx.Response(200,json=self.run)
        return httpx.Response(404)


class _CountingAdapter:
    """Wraps MockDemAdapter but records every extract_page call -- proves the
    provider was (or wasn't) actually invoked for the seeded "complete" page,
    not just that the final status happens to read "complete" (which a
    reprocessed-and-succeeded page would also show)."""

    def __init__(self, response: dict) -> None:
        self._inner = MockDemAdapter(response=response)
        self.calls: list[int] = []

    def extract_page(self, image_bytes, page_context, prompt_version):
        self.calls.append(page_context.page_index)
        return self._inner.extract_page(image_bytes, page_context, prompt_version)


@pytest.mark.asyncio
async def test_resume_does_not_recreate_or_reprocess_completed_page():
    # Seed page-0's input_hash with the REAL sha256 of the fixture PDF bytes
    # -- process_page's idempotency check (page_loop.py) compares against
    # hashlib.sha256(pdf_bytes).hexdigest() of the whole document, so a
    # fabricated hash (e.g. "sha256:done") can never match and the skip
    # branch would silently never trigger, letting a reprocessed-and-
    # succeeded page masquerade as "correctly skipped".
    pdf_bytes = _pdf()
    real_input_hash = hashlib.sha256(pdf_bytes).hexdigest()
    t=_Transport(seeded_page0_input_hash=real_input_hash)
    c=DemDbClient(base_url="http://test",internal_key="x",transport=t)
    adapter = _CountingAdapter(response=_sheet())

    await process_document(pdf_bytes,"run-1","DOC-1","sha256:x",2,adapter,c,"dem-extraction-v1.0.0",resume=True)

    page0=[p for p in t.pages.values() if p["page_index"]==0]
    page1=[p for p in t.pages.values() if p["page_index"]==1]
    assert len(page0)==1 and page0[0]["id"]=="page-0"
    assert len(page1)==1 and page1[0]["status"]=="complete"
    # The real assertion: the provider must never have been called for the
    # already-complete page 0 -- only for the new page 1.
    assert adapter.calls == [1], f"expected provider called only for page 1, got calls for pages {adapter.calls}"


@pytest.mark.asyncio
async def test_process_document_redrives_retry_wait_pages_until_terminal():
    # A page that fails transiently on its first attempt must be re-driven
    # by process_document (not left stuck in retry_wait forever) and the run
    # must NOT be reported dem_complete while any page remains non-terminal.
    t=_Transport(seeded_page0_input_hash="irrelevant-page0-not-used-single-page-run")
    t.pages = {}  # single fresh page, no resume seeding needed for this test
    c=DemDbClient(base_url="http://test",internal_key="x",transport=t)

    class _FlakyThenSucceedsAdapter:
        def __init__(self, response: dict) -> None:
            self._response = response
            self.calls = 0

        def extract_page(self, image_bytes, page_context, prompt_version):
            self.calls += 1
            if self.calls == 1:
                raise DemProviderError("rate limited", kind="transient")
            return self._response

    adapter = _FlakyThenSucceedsAdapter(response=_sheet())
    await process_document(_pdf(),"run-1","DOC-1","sha256:x",1,adapter,c,"dem-extraction-v1.0.0")

    assert adapter.calls == 2, "expected one failing attempt then one redrive attempt"
    final_page = next(iter(t.pages.values()))
    assert final_page["status"] == "complete"
    assert t.run["status"] == "dem_complete"
