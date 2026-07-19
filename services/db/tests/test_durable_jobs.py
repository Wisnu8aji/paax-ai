import asyncio

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


@pytest.mark.asyncio
async def test_durable_job_full_lifecycle_transition_heartbeat_complete():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        enqueue = await client.post(
            "/durable-jobs/enqueue",
            json={"job_type": "dem.extract", "payload": {"run_id": "R-LIFECYCLE"}, "idempotency_key": "dem:R-LIFECYCLE"},
            headers=HEADERS,
        )
        job_id = enqueue.json()["id"]

        leased = await client.post("/durable-jobs/lease", json={"worker_id": "worker-a", "lease_seconds": 30}, headers=HEADERS)
        assert leased.json()["id"] == job_id

        running = await client.post(f"/durable-jobs/{job_id}/transition", json={"worker_id": "worker-a"}, headers=HEADERS)
        assert running.status_code == 200 and running.json()["status"] == "running"

        # Another worker cannot act on a lease it doesn't own.
        stolen = await client.post(f"/durable-jobs/{job_id}/heartbeat", json={"worker_id": "worker-b"}, headers=HEADERS)
        assert stolen.status_code == 409

        heartbeat = await client.post(f"/durable-jobs/{job_id}/heartbeat", json={"worker_id": "worker-a", "lease_seconds": 45}, headers=HEADERS)
        assert heartbeat.status_code == 200

        completed = await client.post(f"/durable-jobs/{job_id}/complete", json={"worker_id": "worker-a"}, headers=HEADERS)
        assert completed.status_code == 200 and completed.json()["status"] == "completed"

        state = await client.get(f"/durable-jobs/{job_id}", headers=HEADERS)
        assert state.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_durable_job_retry_reschedules_transient_and_poisons_after_max_attempts():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        enqueue = await client.post(
            "/durable-jobs/enqueue",
            json={"job_type": "dem.extract", "payload": {"run_id": "R-RETRY"}, "idempotency_key": "dem:R-RETRY"},
            headers=HEADERS,
        )
        job_id = enqueue.json()["id"]
        await client.post("/durable-jobs/lease", json={"worker_id": "worker-a", "lease_seconds": 30}, headers=HEADERS)
        await client.post(f"/durable-jobs/{job_id}/transition", json={"worker_id": "worker-a"}, headers=HEADERS)

        first_retry = await client.post(
            f"/durable-jobs/{job_id}/retry",
            json={"worker_id": "worker-a", "error": "transient timeout", "max_attempts": 2},
            headers=HEADERS,
        )
        assert first_retry.json()["status"] == "retry_wait"
        assert first_retry.json()["attempt_count"] == 1

        state = await client.get(f"/durable-jobs/{job_id}", headers=HEADERS)
        assert state.json()["status"] == "retry_wait"

        # retry_wait's next_attempt_at is 2**(1-1) = 1 second out; wait for
        # it to actually elapse so this re-lease exercises the real
        # worker-retry path (server-side backoff), not a state bypass.
        await asyncio.sleep(1.1)
        relaunched = await client.post("/durable-jobs/lease", json={"worker_id": "worker-a", "lease_seconds": 30}, headers=HEADERS)
        assert relaunched.json()["id"] == job_id
        await client.post(f"/durable-jobs/{job_id}/transition", json={"worker_id": "worker-a"}, headers=HEADERS)
        poisoned = await client.post(
            f"/durable-jobs/{job_id}/retry",
            json={"worker_id": "worker-a", "error": "permanent failure", "max_attempts": 2},
            headers=HEADERS,
        )
        assert poisoned.json()["status"] == "failed"
        assert poisoned.json()["attempt_count"] == 2

        state = await client.get(f"/durable-jobs/{job_id}", headers=HEADERS)
        assert state.json()["poisoned_at"] is not None


@pytest.mark.asyncio
async def test_durable_job_endpoints_reject_unknown_job_and_wrong_lease_owner():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        missing = await client.get("/durable-jobs/does-not-exist", headers=HEADERS)
        assert missing.status_code == 404

        enqueue = await client.post(
            "/durable-jobs/enqueue",
            json={"job_type": "dem.extract", "payload": {"run_id": "R-OWNER"}, "idempotency_key": "dem:R-OWNER"},
            headers=HEADERS,
        )
        job_id = enqueue.json()["id"]
        await client.post("/durable-jobs/lease", json={"worker_id": "worker-a", "lease_seconds": 30}, headers=HEADERS)

        wrong_owner = await client.post(f"/durable-jobs/{job_id}/complete", json={"worker_id": "worker-b"}, headers=HEADERS)
        assert wrong_owner.status_code in (404, 409)
