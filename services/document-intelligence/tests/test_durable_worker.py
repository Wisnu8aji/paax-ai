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
