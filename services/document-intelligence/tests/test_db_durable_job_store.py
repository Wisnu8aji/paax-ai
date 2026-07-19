"""A prior audit found ARTIFACT_STORE/JOB_QUEUE always default to
LocalArtifactStore/InMemoryDurableJobStore with no production override,
meaning the queue is lost on every process restart. DbDurableJobStore closes
that gap for enqueue/lease by reaching services/db's real durable_jobs table
over the HTTP boundary, the same way DemDbClient does."""
from __future__ import annotations

import httpx
import pytest

from app.durable_jobs import DbDurableJobStore


class _StubTransport(httpx.AsyncBaseTransport):
    def __init__(self):
        self.requests: list[httpx.Request] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.url.path == "/durable-jobs/enqueue" and request.method == "POST":
            return httpx.Response(200, json={"id": "JOB-1", "status": "queued", "duplicate": False})
        if request.url.path == "/durable-jobs/lease" and request.method == "POST":
            return httpx.Response(
                200,
                json={"id": "JOB-1", "job_type": "dem.extract", "payload": {"run_id": "RUN-1"}, "attempt_count": 1},
            )
        return httpx.Response(404)


@pytest.mark.asyncio
async def test_enqueue_posts_job_type_payload_and_idempotency_key():
    transport = _StubTransport()
    store = DbDurableJobStore(base_url="http://test-db", internal_key="test-key", transport=transport)

    result = await store.enqueue("dem.extract", {"run_id": "RUN-1"}, idempotency_key="dem.extract:RUN-1")

    assert result == {"id": "JOB-1", "status": "queued", "duplicate": False}
    assert len(transport.requests) == 1
    body = transport.requests[0].content
    assert b"dem.extract:RUN-1" in body
    assert transport.requests[0].headers["X-Internal-Key"] == "test-key"


@pytest.mark.asyncio
async def test_lease_posts_worker_id_and_returns_leased_job():
    transport = _StubTransport()
    store = DbDurableJobStore(base_url="http://test-db", internal_key="test-key", transport=transport)

    leased = await store.lease("worker-A", lease_seconds=30)

    assert leased["job_type"] == "dem.extract"
    assert leased["payload"] == {"run_id": "RUN-1"}
    assert b"worker-A" in transport.requests[0].content
