"""Queue abstraction with a deterministic local durable-worker compatible store."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol
import uuid


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
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class DurableJobQueue(Protocol):
    def enqueue(self, job_type: str, payload: dict[str, Any], *, idempotency_key: str) -> DurableJob: ...
    def lease(self, worker_id: str) -> DurableJob | None: ...


class InMemoryDurableJobStore:
    """Deterministic local adapter; production backends implement DurableJobQueue."""
    def __init__(self):
        self.jobs: dict[str, DurableJob] = {}
        self.by_key: dict[str, str] = {}

    def enqueue(self, job_type: str, payload: dict[str, Any], *, idempotency_key: str) -> DurableJob:
        if idempotency_key in self.by_key:
            return self.jobs[self.by_key[idempotency_key]]
        job = DurableJob(id=str(uuid.uuid4()), job_type=job_type, payload=dict(payload), idempotency_key=idempotency_key)
        self.jobs[job.id] = job
        self.by_key[idempotency_key] = job.id
        return job

    def lease(self, worker_id: str) -> DurableJob | None:
        for job in self.jobs.values():
            if job.status == "queued":
                self.transition(job.id, "leased", worker_id=worker_id)
                return job
        return None

    def transition(self, job_id: str, target: str, *, worker_id: str | None = None, error: str | None = None) -> DurableJob:
        job = self.jobs[job_id]
        if target not in STATUSES or target not in _TRANSITIONS[job.status]:
            raise JobLifecycleError(f"invalid job transition: {job.status} -> {target}")
        if job.lease_owner and worker_id != job.lease_owner:
            raise JobLifecycleError("job lease belongs to another worker")
        if target == "leased":
            job.lease_owner = worker_id
        elif target == "queued":
            job.lease_owner = None
        job.status, job.last_error, job.updated_at = target, error, datetime.now(timezone.utc)
        return job

    def redrive(self, job_id: str) -> DurableJob:
        job = self.jobs[job_id]
        if job.status not in {"retry_wait", "partially_failed"}:
            raise JobLifecycleError("only retry_wait or partially_failed jobs can be redriven")
        job.attempt_count += 1
        return self.transition(job_id, "queued", worker_id=job.lease_owner)
