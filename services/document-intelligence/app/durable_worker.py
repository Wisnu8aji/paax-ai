"""Small deterministic worker loop; deployment invokes this from any process.

Handlers are injected so this module never constructs a live AI provider.  A
worker reads only artifact object keys, making restart and cross-instance
delivery safe.
"""
from __future__ import annotations

from collections.abc import Callable

from app.artifact_storage import ArtifactStore, ArtifactUnavailable
from app.durable_jobs import DurableJob, InMemoryDurableJobStore, JobLifecycleError


class DurableWorker:
    def __init__(self, queue: InMemoryDurableJobStore, artifacts: ArtifactStore, worker_id: str, handlers: dict[str, Callable[[DurableJob], None]], *, lease_seconds: int = 60):
        self.queue, self.artifacts, self.worker_id, self.handlers = queue, artifacts, worker_id, handlers
        self.lease_seconds = lease_seconds

    def run_once(self) -> bool:
        job = self.queue.lease(self.worker_id, lease_seconds=self.lease_seconds)
        if job is None:
            return False
        try:
            self.queue.transition(job.id, "running", worker_id=self.worker_id)
            self.queue.heartbeat(job.id, self.worker_id, lease_seconds=self.lease_seconds)
            artifact_key = job.payload.get("artifact_key")
            if artifact_key:
                # Verify availability before entering an expensive/resumable handler.
                self.artifacts.get(artifact_key)
            handler = self.handlers.get(job.job_type)
            if handler is None:
                raise RuntimeError(f"unsupported durable job type: {job.job_type}")
            handler(job)
            self.queue.transition(job.id, "completed", worker_id=self.worker_id)
        except ArtifactUnavailable as exc:
            self.queue.retry(job.id, self.worker_id, error=f"artifact unavailable: {exc}")
        except (Exception, JobLifecycleError) as exc:
            # Failure state is durable; bounded retry turns persistent poison into failed.
            self.queue.retry(job.id, self.worker_id, error=str(exc))
        return True
