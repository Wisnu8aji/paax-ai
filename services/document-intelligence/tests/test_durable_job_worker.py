from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.durable_jobs import InMemoryDurableJobStore, JobLifecycleError


def test_expired_lease_is_recovered_by_another_worker_and_duplicate_delivery_is_idempotent():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    store = InMemoryDurableJobStore(now=lambda: now)
    job = store.enqueue("dem.extract", {"artifact_key": "original-pdf/runs/R1/source.pdf"}, idempotency_key="dem:R1")
    assert store.enqueue("dem.extract", {"ignored": True}, idempotency_key="dem:R1").id == job.id
    assert store.lease("dead-worker", lease_seconds=10).id == job.id
    now += timedelta(seconds=11)
    recovered = store.lease("new-worker", lease_seconds=10)
    assert recovered is not None and recovered.id == job.id
    assert recovered.lease_owner == "new-worker"
    assert recovered.attempt_count == 1


def test_heartbeat_cancellation_retry_and_poison_lifecycle_are_fail_closed():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    store = InMemoryDurableJobStore(now=lambda: now, max_attempts=2)
    job = store.enqueue("dem.extract", {"artifact_key": "original-pdf/runs/R1/source.pdf"}, idempotency_key="dem:R1")
    store.lease("worker", lease_seconds=10)
    store.transition(job.id, "running", worker_id="worker")
    now += timedelta(seconds=5)
    store.heartbeat(job.id, "worker", lease_seconds=10)
    store.retry(job.id, "worker", error="temporary")
    assert job.status == "retry_wait" and job.next_attempt_at > now
    now = job.next_attempt_at
    assert store.lease("worker-2", lease_seconds=10).id == job.id
    store.transition(job.id, "running", worker_id="worker-2")
    store.retry(job.id, "worker-2", error="permanent")
    assert job.status == "failed" and job.poisoned_at is not None
    with pytest.raises(JobLifecycleError):
        store.cancel(job.id, "worker-2")
