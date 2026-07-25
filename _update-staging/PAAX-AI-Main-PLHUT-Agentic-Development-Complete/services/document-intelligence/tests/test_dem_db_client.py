from __future__ import annotations

import httpx
import pytest

from app.transcription.db_client import DemDbClient


class _StubTransport(httpx.AsyncBaseTransport):
    def __init__(self):
        self.requests: list[httpx.Request] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.url.path == "/dem/runs" and request.method == "POST":
            return httpx.Response(
                200,
                json={
                    "id": "11111111-1111-1111-1111-111111111111",
                    "status": "created",
                    "total_pages": 3,
                    "project_id": None,
                    "document_id": "DOC-1",
                    "document_hash": "sha256:x",
                    "file_name": "test.pdf",
                    "provider": "qwen",
                    "prompt_version": "dem-extraction-v1.0.0",
                    "created_at": "2026-07-14T10:00:00Z",
                    "updated_at": "2026-07-14T10:00:00Z",
                    "completed_at": None,
                },
            )
        return httpx.Response(404)


@pytest.mark.asyncio
async def test_create_run_posts_to_dem_runs_and_returns_id():
    transport = _StubTransport()
    client = DemDbClient(base_url="http://test-db", internal_key="test-key", transport=transport)

    run = await client.create_run(
        document_id="DOC-1",
        document_hash="sha256:x",
        file_name="test.pdf",
        total_pages=3,
        provider="qwen",
        prompt_version="dem-extraction-v1.0.0",
    )

    assert run["id"] == "11111111-1111-1111-1111-111111111111"
    assert transport.requests[0].headers["x-internal-key"] == "test-key"
