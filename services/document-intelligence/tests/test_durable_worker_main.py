"""Target 1 requirement: production must fail startup if durable queue,
object storage, or required internal-service credentials are unavailable --
before the worker ever leases a job."""
from __future__ import annotations

import pytest

from app.durable_jobs import DbDurableJobStore
from app.durable_worker_main import WorkerStartupError, build_worker


def test_fails_startup_without_internal_service_key(monkeypatch):
    monkeypatch.setenv("JOB_QUEUE_BACKEND", "durable-db")
    monkeypatch.setenv("ARTIFACT_STORE_BACKEND", "local")
    monkeypatch.delenv("INTERNAL_SERVICE_KEY", raising=False)
    with pytest.raises(WorkerStartupError, match="INTERNAL_SERVICE_KEY"):
        build_worker()


def test_fails_startup_with_in_memory_queue_backend(monkeypatch):
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "test-key")
    monkeypatch.setenv("JOB_QUEUE_BACKEND", "memory")
    with pytest.raises(WorkerStartupError, match="JOB_QUEUE_BACKEND"):
        build_worker()


def test_fails_startup_with_misconfigured_s3_backend(monkeypatch):
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "test-key")
    monkeypatch.setenv("JOB_QUEUE_BACKEND", "durable-db")
    monkeypatch.setenv("ARTIFACT_STORE_BACKEND", "s3")
    monkeypatch.delenv("ARTIFACT_STORE_S3_BUCKET", raising=False)
    with pytest.raises(WorkerStartupError, match="S3"):
        build_worker()


def test_builds_a_real_worker_when_fully_configured(monkeypatch):
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "test-key")
    monkeypatch.setenv("JOB_QUEUE_BACKEND", "durable-db")
    monkeypatch.setenv("ARTIFACT_STORE_BACKEND", "s3")
    monkeypatch.setenv("ARTIFACT_STORE_S3_BUCKET", "test-bucket")
    worker = build_worker(worker_id="worker-test")
    assert worker.worker_id == "worker-test"
    assert isinstance(worker.queue, DbDurableJobStore)
    assert set(worker.handlers) == {"dem.extract", "dem.synthesize"}
