import pytest
from httpx import ASGITransport, AsyncClient

from paax_db.main import app

HEADERS = {"X-Internal-Key": "test-internal-key", "X-User-Id": "worker"}


@pytest.mark.asyncio
async def test_durable_job_enqueue_is_idempotent_and_lease_is_exclusive():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {"job_type": "dem.extract", "payload": {"artifact_key": "original-pdf/runs/R1/source.pdf"}, "idempotency_key": "dem:R1"}
        first = await client.post("/durable-jobs/enqueue", json=payload, headers=HEADERS)
        duplicate = await client.post("/durable-jobs/enqueue", json=payload, headers=HEADERS)
        assert first.status_code == duplicate.status_code == 200
        assert first.json()["id"] == duplicate.json()["id"]
        leased = await client.post("/durable-jobs/lease", json={"worker_id": "worker-a", "lease_seconds": 30}, headers=HEADERS)
        second = await client.post("/durable-jobs/lease", json={"worker_id": "worker-b", "lease_seconds": 30}, headers=HEADERS)
        assert leased.json()["id"] == first.json()["id"]
        assert second.json() is None
