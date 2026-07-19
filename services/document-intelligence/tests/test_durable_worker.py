from __future__ import annotations

from pathlib import Path

from app.artifact_storage import LocalArtifactStore
from app.durable_jobs import InMemoryDurableJobStore
from app.durable_worker import DurableWorker


def test_worker_marks_missing_object_retryable_without_calling_handler(tmp_path):
    queue = InMemoryDurableJobStore(max_attempts=3)
    queue.enqueue("dem.extract", {"artifact_key": "original-pdf/runs/R1/missing.pdf"}, idempotency_key="R1")
    calls: list[dict] = []
    worker = DurableWorker(queue, LocalArtifactStore(Path(tmp_path)), "worker", {"dem.extract": lambda job: calls.append(job.payload)})
    assert worker.run_once() is True
    job = next(iter(queue.jobs.values()))
    assert job.status == "retry_wait" and calls == []


def test_worker_synthesis_handler_can_resume_after_delivery_restart(tmp_path):
    queue = InMemoryDurableJobStore()
    queue.enqueue("dem.synthesize", {"run_id": "R1"}, idempotency_key="synth:R1")
    calls: list[str] = []
    worker = DurableWorker(queue, LocalArtifactStore(Path(tmp_path)), "worker", {"dem.synthesize": lambda job: calls.append(job.payload["run_id"])})
    assert worker.run_once() is True
    assert calls == ["R1"]
    assert next(iter(queue.jobs.values())).status == "completed"


def test_worker_emits_bounded_dem_lifecycle_metrics_without_affecting_delivery(tmp_path):
    class FakeLogger:
        def __init__(self): self.events = []
        def emit(self, event): self.events.append(event); raise RuntimeError("telemetry offline")

    store = LocalArtifactStore(Path(tmp_path))
    key = store.put("original-pdf", b"pdf", content_type="application/pdf", object_key="runs/R1/source.pdf")
    queue = InMemoryDurableJobStore()
    queue.enqueue("dem.extract", {
        "artifact_key": key, "run_id": "R1", "project_id": "P1", "correlation_id": "trace-1",
        "pages_processed": 4, "pages_failed": 1, "retries": 2, "evidence_count": 7,
        "dangling_reference_count": 3, "coordinate_space_count": 2, "completion_consistent": True,
    }, idempotency_key="R1")
    logger = FakeLogger()
    worker = DurableWorker(queue, store, "worker", {"dem.extract": lambda job: None}, telemetry=logger)

    assert worker.run_once() is True
    assert next(iter(queue.jobs.values())).status == "completed"
    assert logger.events[0]["operation"] == "dem.extraction.completed"
    assert logger.events[0]["project_id"] == "P1"
    assert logger.events[0]["run_id"] == "R1" and logger.events[0]["correlation_id"] == "trace-1"
    assert logger.events[0]["metadata"] == {
        "pages_processed": 4, "pages_failed": 1, "retries": 2, "evidence_count": 7,
        "dangling_reference_count": 3, "coordinate_space_count": 2, "completion_consistent": True,
    }
