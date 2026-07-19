"""Queue abstraction with a deterministic local durable-worker compatible store."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol
import uuid

import httpx


STATUSES = {"queued", "leased", "running", "retry_wait", "partially_failed", "completed", "failed", "cancelled"}
_TRANSITIONS = {
    "queued": {"leased", "cancelled"}, "leased": {"running", "queued", "cancelled"},
    "running": {"retry_wait", "partially_failed", "completed", "failed", "cancelled"},
    "retry_wait": {"queued", "failed", "cancelled"}, "partially_failed": {"queued", "failed", "cancelled"},
    "completed": set(), "failed": set(), "cancelled": set(),
}


class JobLifecycleError(ValueError):
    pass


@dataclass
class DurableJob:
    id: str
    job_type: str
    payload: dict[str, Any]
    idempotency_key: str
    status: str = "queued"
    lease_owner: str | None = None
    attempt_count: int = 0
    last_error: str | None = None
    lease_expires_at: datetime | None = None
    next_attempt_at: datetime | None = None
    cancel_requested_at: datetime | None = None
    poisoned_at: datetime | None = None
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class DurableJobQueue(Protocol):
    def enqueue(self, job_type: str, payload: dict[str, Any], *, idempotency_key: str) -> DurableJob: ...
    def lease(self, worker_id: str) -> DurableJob | None: ...


class InMemoryDurableJobStore:
    """Deterministic local adapter; production backends implement DurableJobQueue."""
    def __init__(self, *, now: callable | None = None, max_attempts: int = 3):
        self.jobs: dict[str, DurableJob] = {}
        self.by_key: dict[str, str] = {}
        self._now = now or (lambda: datetime.now(timezone.utc))
        self.max_attempts = max_attempts

    def enqueue(self, job_type: str, payload: dict[str, Any], *, idempotency_key: str) -> DurableJob:
        if idempotency_key in self.by_key:
            return self.jobs[self.by_key[idempotency_key]]
        job = DurableJob(id=str(uuid.uuid4()), job_type=job_type, payload=dict(payload), idempotency_key=idempotency_key)
        self.jobs[job.id] = job
        self.by_key[idempotency_key] = job.id
        return job

    def lease(self, worker_id: str, *, lease_seconds: int = 60) -> DurableJob | None:
        now = self._now()
        for job in self.jobs.values():
            if job.status in {"leased", "running"} and job.lease_expires_at and job.lease_expires_at <= now:
                job.status, job.lease_owner, job.lease_expires_at = "queued", None, None
                job.attempt_count += 1
            if job.status == "retry_wait" and job.next_attempt_at and job.next_attempt_at <= now:
                job.status, job.lease_owner = "queued", None
            if job.status == "queued" and (job.next_attempt_at is None or job.next_attempt_at <= now):
                self.transition(job.id, "leased", worker_id=worker_id, lease_seconds=lease_seconds)
                return job
        return None

    def transition(self, job_id: str, target: str, *, worker_id: str | None = None, error: str | None = None, lease_seconds: int = 60) -> DurableJob:
        job = self.jobs[job_id]
        if target not in STATUSES or target not in _TRANSITIONS[job.status]:
            raise JobLifecycleError(f"invalid job transition: {job.status} -> {target}")
        if job.lease_owner and worker_id != job.lease_owner:
            raise JobLifecycleError("job lease belongs to another worker")
        if target == "leased":
            job.lease_owner = worker_id
            job.lease_expires_at = self._now() + timedelta(seconds=lease_seconds)
        elif target == "queued":
            job.lease_owner = None
            job.lease_expires_at = None
        elif target in {"completed", "failed", "cancelled", "retry_wait", "partially_failed"}:
            job.lease_expires_at = None
        job.status, job.last_error, job.updated_at = target, error, self._now()
        return job

    def redrive(self, job_id: str) -> DurableJob:
        job = self.jobs[job_id]
        if job.status not in {"retry_wait", "partially_failed"}:
            raise JobLifecycleError("only retry_wait or partially_failed jobs can be redriven")
        job.attempt_count += 1
        return self.transition(job_id, "queued", worker_id=job.lease_owner)

    def heartbeat(self, job_id: str, worker_id: str, *, lease_seconds: int = 60) -> DurableJob:
        job = self.jobs[job_id]
        if job.status not in {"leased", "running"} or job.lease_owner != worker_id:
            raise JobLifecycleError("cannot heartbeat a job not leased by this worker")
        job.lease_expires_at = self._now() + timedelta(seconds=lease_seconds)
        job.updated_at = self._now()
        return job

    def cancel(self, job_id: str, worker_id: str | None = None) -> DurableJob:
        job = self.jobs[job_id]
        if job.status in {"completed", "failed", "cancelled"}:
            raise JobLifecycleError("terminal jobs cannot be cancelled")
        if job.lease_owner and worker_id and job.lease_owner != worker_id:
            raise JobLifecycleError("job lease belongs to another worker")
        job.cancel_requested_at = self._now()
        return self.transition(job_id, "cancelled", worker_id=worker_id)

    def retry(self, job_id: str, worker_id: str, *, error: str) -> DurableJob:
        job = self.jobs[job_id]
        if job.status != "running" or job.lease_owner != worker_id:
            raise JobLifecycleError("only the lease owner can retry a running job")
        job.attempt_count += 1
        if job.attempt_count >= self.max_attempts:
            job.poisoned_at = self._now()
            return self.transition(job_id, "failed", worker_id=worker_id, error=error)
        job.next_attempt_at = self._now() + timedelta(seconds=2 ** (job.attempt_count - 1))
        return self.transition(job_id, "retry_wait", worker_id=worker_id, error=error)


class DbDurableJobStore:
    """Durable adapter backed by services/db's durable_jobs table (migration
    0026), reached over the HTTP boundary like DemDbClient -- this service
    never opens a direct DB connection (Aturan Emas / architecture boundary).

    Only enqueue/lease are implemented because those are the only two
    operations services/db currently exposes as HTTP endpoints
    (POST /durable-jobs/enqueue, POST /durable-jobs/lease); no worker in this
    codebase currently leases from the queue at all (dem.extract/dem.synthesize
    run in-process via FastAPI BackgroundTasks), so transition/heartbeat/
    cancel/retry have no caller yet and are intentionally not implemented
    here -- add them alongside the worker that will actually use them.
    """

    def __init__(
        self,
        *,
        base_url: str | None = None,
        internal_key: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = (base_url or os.getenv("DB_API_URL", "http://localhost:8084")).rstrip("/")
        self.internal_key = internal_key or os.getenv("INTERNAL_SERVICE_KEY", "")
        self._transport = transport

    def _headers(self) -> dict[str, str]:
        return {"X-Internal-Key": self.internal_key, "X-User-Id": "dem-job-orchestrator"}

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self.base_url, transport=self._transport, headers=self._headers())

    async def enqueue(self, job_type: str, payload: dict[str, Any], *, idempotency_key: str) -> dict:
        async with self._client() as client:
            response = await client.post(
                "/durable-jobs/enqueue",
                json={"job_type": job_type, "payload": payload, "idempotency_key": idempotency_key},
            )
            response.raise_for_status()
            return response.json()

    async def lease(self, worker_id: str, *, lease_seconds: int = 60) -> dict | None:
        async with self._client() as client:
            response = await client.post(
                "/durable-jobs/lease",
                json={"worker_id": worker_id, "lease_seconds": lease_seconds},
            )
            response.raise_for_status()
            return response.json()
