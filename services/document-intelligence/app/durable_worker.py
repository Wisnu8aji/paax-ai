"""Small deterministic worker loop; deployment invokes this from any process.

Handlers are injected so this module never constructs a live AI provider.  A
worker reads only artifact object keys, making restart and cross-instance
delivery safe.
"""
from __future__ import annotations

from collections.abc import Callable
import time
from typing import Any, Protocol

from app.artifact_storage import ArtifactStore, ArtifactUnavailable
from app.durable_jobs import DurableJob, InMemoryDurableJobStore, JobLifecycleError


class TelemetryLogger(Protocol):
    def emit(self, event: dict[str, Any]) -> None: ...


_DEM_METRIC_KEYS = (
    "pages_processed", "pages_failed", "retries", "evidence_count",
    "dangling_reference_count", "coordinate_space_count", "completion_consistent",
)


class DurableWorker:
    def __init__(self, queue: InMemoryDurableJobStore, artifacts: ArtifactStore, worker_id: str, handlers: dict[str, Callable[[DurableJob], None]], *, lease_seconds: int = 60, telemetry: TelemetryLogger | None = None):
        self.queue, self.artifacts, self.worker_id, self.handlers = queue, artifacts, worker_id, handlers
        self.lease_seconds = lease_seconds
        self.telemetry = telemetry

    def _emit_lifecycle(self, job: DurableJob, *, started: float) -> None:
        if self.telemetry is None:
            return
        metadata = {key: job.payload[key] for key in _DEM_METRIC_KEYS if isinstance(job.payload.get(key), (bool, int, float))}
        metadata.setdefault("retries", job.attempt_count)
        operation = "dem.extraction" if job.job_type == "dem.extract" else job.job_type
        event = {
            "service": "document-intelligence", "operation": f"{operation}.{job.status}",
            "event_type": "pipeline_metric", "status": job.status, "success": job.status == "completed",
            "latency_ms": max(0, int((time.monotonic() - started) * 1000)), "metric_count": 1,
            "correlation_id": job.payload.get("correlation_id"), "project_id": job.payload.get("project_id"),
            "run_id": job.payload.get("run_id"), "metadata": metadata,
        }
        try:
            self.telemetry.emit(event)
        except Exception:
            # Observability must never alter durable delivery outcome.
            pass

    def run_once(self) -> bool:
        job = self.queue.lease(self.worker_id, lease_seconds=self.lease_seconds)
        if job is None:
            return False
        started = time.monotonic()
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
        finally:
            self._emit_lifecycle(job, started=started)
        return True
