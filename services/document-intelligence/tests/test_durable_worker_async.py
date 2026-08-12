"""AsyncDurableWorker + DbDurableJobStore against a stub services/db HTTP
transport -- these are the acceptance tests target 1 (production durable
worker) explicitly requires: real lease/heartbeat/complete/retry state
transitions driven through the DB-backed queue interface, not the in-memory
store."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.artifact_storage import ArtifactUnavailable
from app.durable_jobs import DbDurableJobStore
from app.durable_worker_async import AsyncDurableWorker, PoisonedJobError


class _FakeArtifactStore:
    def __init__(self, objects: dict[str, bytes] | None = None, *, missing_keys: set[str] | None = None):
        self.objects = objects or {}
        self.missing_keys = missing_keys or set()

    def get(self, key: str) -> bytes:
        if key in self.missing_keys or key not in self.objects:
            raise ArtifactUnavailable(key)
        return self.objects[key]


class _FakeDbTransport(httpx.AsyncBaseTransport):
    """In-memory model of services/db's durable-jobs endpoints, exercised
    only through DbDurableJobStore's real HTTP client calls -- this proves
    the worker's queue-interaction code path end to end, not just its own
    in-process state."""

    def __init__(self):
        self.jobs: dict[str, dict] = {}
        self._counter = 0
        self.heartbeat_failures = 0
        self.lease_failures = 0
        self.transition_failures = 0

    def _new_id(self) -> str:
        self._counter += 1
        return f"job-{self._counter}"

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        import json as _json
        payload = _json.loads(request.content) if request.content else {}

        if path == "/durable-jobs/enqueue" and request.method == "POST":
            for job in self.jobs.values():
                if job["idempotency_key"] == payload["idempotency_key"]:
                    return httpx.Response(200, json={"id": job["id"], "status": job["status"], "duplicate": True})
            job_id = self._new_id()
            self.jobs[job_id] = {
                "id": job_id, "job_type": payload["job_type"], "payload": payload["payload"],
                "idempotency_key": payload["idempotency_key"], "status": "queued",
                "lease_owner": None, "attempt_count": 0, "last_error": None, "poisoned_at": None,
            }
            return httpx.Response(200, json={"id": job_id, "status": "queued", "duplicate": False})

        if path == "/durable-jobs/lease" and request.method == "POST":
            if self.lease_failures:
                self.lease_failures -= 1
                raise httpx.ConnectTimeout("temporary lease connection failure")
            # Mirrors the real endpoint's WHERE clause: due "queued"/"retry_wait"
            # jobs, plus "leased"/"running" jobs whose lease has expired (the
            # expired one is re-claimed and its attempt counter bumps).
            now = datetime.now(timezone.utc)
            lease_seconds = max(1, int(payload.get("lease_seconds", 60)))
            for job in self.jobs.values():
                expired = job["status"] in ("leased", "running") and job.get("lease_expires_at") and job["lease_expires_at"] <= now
                if expired:
                    job["attempt_count"] += 1
                if job["status"] in ("queued", "retry_wait") or expired:
                    job["status"], job["lease_owner"] = "leased", payload["worker_id"]
                    job["lease_expires_at"] = now + timedelta(seconds=lease_seconds)
                    return httpx.Response(200, json={"id": job["id"], "job_type": job["job_type"], "payload": job["payload"], "attempt_count": job["attempt_count"]})
            return httpx.Response(200, content="null", headers={"content-type": "application/json"})

        if path.endswith("/transition") and request.method == "POST":
            if self.transition_failures:
                self.transition_failures -= 1
                raise httpx.ConnectTimeout("temporary transition connection failure")
            job_id = path.split("/")[2]
            job = self.jobs[job_id]
            if job["lease_owner"] != payload["worker_id"]:
                return httpx.Response(409, json={"detail": "wrong owner"})
            job["status"] = "running"
            return httpx.Response(200, json={"id": job_id, "status": "running"})

        if path.endswith("/heartbeat") and request.method == "POST":
            job_id = path.split("/")[2]
            job = self.jobs[job_id]
            if job["lease_owner"] != payload["worker_id"]:
                return httpx.Response(409, json={"detail": "wrong owner"})
            if self.heartbeat_failures:
                self.heartbeat_failures -= 1
                raise httpx.ConnectTimeout("temporary heartbeat connection failure")
            return httpx.Response(200, json={"id": job_id, "lease_expires_at": None})

        if path.endswith("/complete") and request.method == "POST":
            job_id = path.split("/")[2]
            job = self.jobs[job_id]
            if job["lease_owner"] != payload["worker_id"]:
                return httpx.Response(409, json={"detail": "wrong owner"})
            job["status"], job["lease_owner"], job["lease_expires_at"] = "completed", None, None
            return httpx.Response(200, json={"id": job_id, "status": "completed"})

        if path.endswith("/retry") and request.method == "POST":
            job_id = path.split("/")[2]
            job = self.jobs[job_id]
            job["attempt_count"] += 1
            job["last_error"] = payload.get("error")
            max_attempts = payload.get("max_attempts", 3)
            if job["attempt_count"] >= max_attempts:
                job["status"], job["poisoned_at"], job["lease_expires_at"] = "failed", "2026-01-01T00:00:00Z", None
            else:
                job["status"], job["lease_owner"], job["lease_expires_at"] = "retry_wait", None, None
            return httpx.Response(200, json={"id": job_id, "status": job["status"], "attempt_count": job["attempt_count"]})

        if request.method == "GET" and path.startswith("/durable-jobs/"):
            job_id = path.split("/")[2]
            job = self.jobs.get(job_id)
            if job is None:
                return httpx.Response(404, json={"detail": "not found"})
            return httpx.Response(200, json=job)

        return httpx.Response(404)


def _queue(transport: _FakeDbTransport) -> DbDurableJobStore:
    return DbDurableJobStore(base_url="http://test-db", internal_key="test-key", transport=transport)


@pytest.mark.asyncio
async def test_enqueue_lease_running_completed_full_cycle():
    """Acceptance test 1: enqueue -> lease -> running -> completed."""
    transport = _FakeDbTransport()
    queue = _queue(transport)
    await queue.enqueue("dem.extract", {"artifact_key": "pdf/R1"}, idempotency_key="dem:R1")

    completed_payloads = []

    async def handler(payload):
        completed_payloads.append(payload)

    worker = AsyncDurableWorker(
        queue=queue, artifacts=_FakeArtifactStore({"pdf/R1": b"%PDF"}), worker_id="worker-a",
        handlers={"dem.extract": handler},
    )
    processed = await worker.run_once()
    assert processed is True
    assert completed_payloads == [{"artifact_key": "pdf/R1"}]
    job = next(iter(transport.jobs.values()))
    assert job["status"] == "completed"


@pytest.mark.asyncio
async def test_transient_heartbeat_failure_does_not_crash_the_worker():
    """A temporary DB heartbeat failure must not kill an in-flight job."""
    transport = _FakeDbTransport()
    transport.heartbeat_failures = 1
    queue = _queue(transport)
    await queue.enqueue("dem.extract", {"artifact_key": "pdf/R1"}, idempotency_key="dem:R1")

    async def slow_enough_handler(payload):
        await asyncio.sleep(0.02)

    worker = AsyncDurableWorker(
        queue=queue,
        artifacts=_FakeArtifactStore({"pdf/R1": b"%PDF"}),
        worker_id="worker-a",
        handlers={"dem.extract": slow_enough_handler},
        heartbeat_interval_seconds=0.001,
    )

    assert await worker.run_once() is True
    job = next(iter(transport.jobs.values()))
    assert job["status"] == "completed"


@pytest.mark.asyncio
async def test_transient_lease_failure_does_not_crash_the_worker():
    """A temporary transport failure on the initial lease must not kill the
    worker: run_once reports 'nothing to do' and the next poll recovers."""
    transport = _FakeDbTransport()
    transport.lease_failures = 1
    queue = _queue(transport)
    await queue.enqueue("dem.extract", {"artifact_key": "pdf/R1"}, idempotency_key="dem:R1")

    completed_payloads = []

    async def handler(payload):
        completed_payloads.append(payload)

    worker = AsyncDurableWorker(
        queue=queue, artifacts=_FakeArtifactStore({"pdf/R1": b"%PDF"}), worker_id="worker-a",
        handlers={"dem.extract": handler},
    )

    assert await worker.run_once() is False
    job = next(iter(transport.jobs.values()))
    assert job["status"] == "queued"  # nothing was claimed, nothing faked

    assert await worker.run_once() is True
    assert completed_payloads == [{"artifact_key": "pdf/R1"}]
    assert job["status"] == "completed"


@pytest.mark.asyncio
async def test_transient_transition_failure_abandons_lease_without_faking_success():
    """A temporary transport failure on transition_running must not kill the
    worker nor fabricate an outcome: the job stays leased server-side (neither
    complete nor retry is legal from 'leased'), and lease expiry re-exposes it."""
    transport = _FakeDbTransport()
    transport.transition_failures = 1
    queue = _queue(transport)
    await queue.enqueue("dem.extract", {"artifact_key": "pdf/R1"}, idempotency_key="dem:R1")

    handler_called = False

    async def handler(payload):
        nonlocal handler_called
        handler_called = True

    worker = AsyncDurableWorker(
        queue=queue, artifacts=_FakeArtifactStore({"pdf/R1": b"%PDF"}), worker_id="worker-a",
        handlers={"dem.extract": handler},
    )

    assert await worker.run_once() is False
    job = next(iter(transport.jobs.values()))
    assert job["status"] == "leased"  # lease taken, but neither completed nor retried
    assert handler_called is False

    # A second poll must not double-process a lease that is still held.
    assert await worker.run_once() is False

    # Server-side lease expiry (the DB endpoint re-claims expired leases) is
    # what makes the job processable again; the fake keeps this scenario
    # simple by flipping status back to queued directly, as in
    # test_worker_restart_can_continue_an_expired_lease.
    job["status"], job["lease_owner"] = "queued", None

    assert await worker.run_once() is True
    assert handler_called is True
    assert job["status"] == "completed"


@pytest.mark.asyncio
async def test_run_forever_recovers_from_transient_lease_and_transition_failures():
    """run_forever must keep polling through transient lease/transition
    transport failures: the abandoned lease is re-claimed after expiry and
    the job is eventually processed to completion -- no crash, no faked
    success."""
    transport = _FakeDbTransport()
    transport.lease_failures = 1
    transport.transition_failures = 1
    queue = _queue(transport)
    await queue.enqueue("dem.extract", {"artifact_key": "pdf/R1"}, idempotency_key="dem:R1")

    completed_payloads = []
    completed = asyncio.Event()

    async def handler(payload):
        completed_payloads.append(payload)
        completed.set()

    stop = asyncio.Event()
    worker = AsyncDurableWorker(
        queue=queue,
        artifacts=_FakeArtifactStore({"pdf/R1": b"%PDF"}),
        worker_id="worker-a",
        handlers={"dem.extract": handler},
        lease_seconds=1,  # short lease so expiry-driven recovery is fast
        heartbeat_interval_seconds=0.001,
    )
    loop_task = asyncio.ensure_future(worker.run_forever(stop_event=stop, poll_interval_seconds=0.01))

    await asyncio.wait_for(completed.wait(), timeout=5)
    assert not loop_task.done(), "worker crashed before completing the job"
    stop.set()
    await asyncio.wait_for(loop_task, timeout=5)

    job = next(iter(transport.jobs.values()))
    assert job["status"] == "completed"
    assert completed_payloads == [{"artifact_key": "pdf/R1"}]


@pytest.mark.asyncio
async def test_duplicate_idempotency_key_does_not_duplicate_the_job():
    """Acceptance test 3: duplicate idempotency key does not duplicate work."""
    transport = _FakeDbTransport()
    queue = _queue(transport)
    first = await queue.enqueue("dem.extract", {"artifact_key": "pdf/R1"}, idempotency_key="dem:R1")
    second = await queue.enqueue("dem.extract", {"artifact_key": "pdf/R1"}, idempotency_key="dem:R1")
    assert first["id"] == second["id"]
    assert len(transport.jobs) == 1


@pytest.mark.asyncio
async def test_transient_failure_is_rescheduled_via_retry():
    """Acceptance test 4: transient failure is rescheduled (retry_wait), not
    treated as permanent."""
    transport = _FakeDbTransport()
    queue = _queue(transport)
    await queue.enqueue("dem.extract", {"artifact_key": "pdf/R1"}, idempotency_key="dem:R1")

    async def flaky_handler(payload):
        raise RuntimeError("transient network blip")

    worker = AsyncDurableWorker(
        queue=queue, artifacts=_FakeArtifactStore({"pdf/R1": b"%PDF"}), worker_id="worker-a",
        handlers={"dem.extract": flaky_handler}, max_attempts=3,
    )
    await worker.run_once()
    job = next(iter(transport.jobs.values()))
    assert job["status"] == "retry_wait"
    assert job["attempt_count"] == 1


@pytest.mark.asyncio
async def test_permanent_failure_via_poisoned_job_error_skips_retry_and_fails_immediately():
    """Acceptance test 5: permanent failure becomes failed/poisoned, not
    endlessly retried."""
    transport = _FakeDbTransport()
    queue = _queue(transport)
    await queue.enqueue("dem.extract", {"artifact_key": "pdf/R1"}, idempotency_key="dem:R1")

    async def permanently_broken_handler(payload):
        raise PoisonedJobError("bad credentials, will never succeed")

    worker = AsyncDurableWorker(
        queue=queue, artifacts=_FakeArtifactStore({"pdf/R1": b"%PDF"}), worker_id="worker-a",
        handlers={"dem.extract": permanently_broken_handler}, max_attempts=3,
    )
    await worker.run_once()
    job = next(iter(transport.jobs.values()))
    assert job["status"] == "failed"
    assert job["attempt_count"] == 1  # max_attempts=1 for PoisonedJobError -- no bounded retry loop


@pytest.mark.asyncio
async def test_missing_artifact_is_not_treated_as_success():
    """Acceptance test 6: a job whose artifact never becomes available must
    not be reported completed."""
    transport = _FakeDbTransport()
    queue = _queue(transport)
    await queue.enqueue("dem.extract", {"artifact_key": "pdf/MISSING"}, idempotency_key="dem:R1")

    handler_called = False

    async def handler(payload):
        nonlocal handler_called
        handler_called = True

    worker = AsyncDurableWorker(
        queue=queue, artifacts=_FakeArtifactStore(missing_keys={"pdf/MISSING"}), worker_id="worker-a",
        handlers={"dem.extract": handler},
    )
    await worker.run_once()
    assert handler_called is False
    job = next(iter(transport.jobs.values()))
    assert job["status"] == "retry_wait"


@pytest.mark.asyncio
async def test_two_workers_cannot_process_the_same_lease():
    """Acceptance test 7: two workers cannot both process the same lease."""
    transport = _FakeDbTransport()
    queue_a = _queue(transport)
    queue_b = _queue(transport)
    await queue_a.enqueue("dem.extract", {"artifact_key": "pdf/R1"}, idempotency_key="dem:R1")

    leased_a = await queue_a.lease("worker-a", lease_seconds=30)
    leased_b = await queue_b.lease("worker-b", lease_seconds=30)
    assert leased_a is not None
    assert leased_b is None  # already leased by worker-a; nothing else queued

    with pytest.raises(httpx.HTTPStatusError):
        await queue_b.transition_running(leased_a["id"], "worker-b")


@pytest.mark.asyncio
async def test_worker_restart_can_continue_an_expired_lease():
    """Acceptance test 2: worker restart can pick up an expired lease (proven
    at the queue level -- the DB endpoint's lease query is what recovers
    expired leases; this test drives it through the same client code the
    worker uses)."""
    transport = _FakeDbTransport()
    queue = _queue(transport)
    await queue.enqueue("dem.extract", {"artifact_key": "pdf/R1"}, idempotency_key="dem:R1")
    first_lease = await queue.lease("worker-dead", lease_seconds=30)
    assert first_lease is not None

    # Simulate the dead worker's lease being force-expired server-side (the
    # real endpoint's WHERE clause checks lease_expires_at <= now; the fake
    # transport keeps this scenario simple by flipping status back to
    # queued directly, which is the state a real expired lease converges to).
    job = transport.jobs[first_lease["id"]]
    job["status"], job["lease_owner"] = "queued", None

    second_lease = await queue.lease("worker-restarted", lease_seconds=30)
    assert second_lease is not None
    assert second_lease["id"] == first_lease["id"]
