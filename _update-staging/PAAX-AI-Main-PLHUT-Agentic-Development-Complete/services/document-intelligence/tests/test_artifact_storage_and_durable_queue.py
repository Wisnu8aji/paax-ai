import pytest

from app.artifact_storage import ArtifactUnavailable, LocalArtifactStore, sign_artifact_key, verify_artifact_signature
from app.durable_jobs import InMemoryDurableJobStore, JobLifecycleError


def test_local_artifact_store_uses_relative_object_keys_and_fails_closed_when_unavailable(tmp_path):
    store = LocalArtifactStore(tmp_path)
    key = store.put("original-pdf", b"%PDF-fixture", content_type="application/pdf", object_key="runs/R1/original.pdf")
    assert key == "original-pdf/runs/R1/original.pdf"
    assert store.get(key) == b"%PDF-fixture"
    with pytest.raises(ValueError, match="relative"):
        store.put("original-pdf", b"x", content_type="application/pdf", object_key="C:/absolute.pdf")
    with pytest.raises(ArtifactUnavailable):
        store.get("rendered-pages/runs/R1/missing.png")


def test_durable_job_lifecycle_survives_store_reuse_and_resumes_retry_wait():
    store = InMemoryDurableJobStore()
    job = store.enqueue("dem.extract", {"artifact_key": "original-pdf/runs/R1/original.pdf"}, idempotency_key="R1")
    assert job.status == "queued"
    leased = store.lease("worker-A")
    assert leased.id == job.id and leased.status == "leased"
    store.transition(job.id, "running", worker_id="worker-A")
    store.transition(job.id, "retry_wait", worker_id="worker-A", error="temporary")
    resumed = store.redrive(job.id)
    assert resumed.status == "queued" and resumed.attempt_count == 1
    assert store.lease("worker-B").id == job.id
    with pytest.raises(JobLifecycleError):
        store.transition(job.id, "completed", worker_id="worker-A")


def test_signed_artifact_token_is_key_bound_and_expires():
    token = sign_artifact_key("original-pdf/runs/R1/source.pdf", secret=b"test", expires_at=101)
    assert verify_artifact_signature("original-pdf/runs/R1/source.pdf", token, secret=b"test", now=100)
    assert not verify_artifact_signature("original-pdf/runs/R2/source.pdf", token, secret=b"test", now=100)
    assert not verify_artifact_signature("original-pdf/runs/R1/source.pdf", token, secret=b"test", now=102)
