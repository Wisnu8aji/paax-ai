"""A prior audit found ARTIFACT_STORE/JOB_QUEUE default to LocalArtifactStore
/InMemoryDurableJobStore with no composition root ever overriding them at
startup -- production would run with non-durable adapters and lose the
queue/artifacts on restart or across instances. This proves the process
now refuses to start with those defaults when ENV=production.

Calls the composition-root function directly rather than reloading
app.api.dem_routes: reloading re-executes `router = APIRouter(...)` too,
producing a second router object with a different identity than the one
app.main already included -- that breaks other tests (e.g.
test_dem_routes_are_registered) that compare router identity, purely as an
artifact of using importlib.reload, not a real bug."""
import pytest

from app.api.dem_routes import _durable_adapters_or_fail_startup
from app.artifact_storage import LocalArtifactStore, S3ArtifactStore
from app.durable_jobs import DbDurableJobStore, InMemoryDurableJobStore


def test_production_fails_startup_with_default_local_artifact_store(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.delenv("ARTIFACT_STORE_BACKEND", raising=False)
    monkeypatch.setenv("JOB_QUEUE_BACKEND", "durable-db")
    with pytest.raises(RuntimeError, match="ARTIFACT_STORE_BACKEND"):
        _durable_adapters_or_fail_startup()


def test_production_fails_startup_with_default_in_memory_job_queue(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("ARTIFACT_STORE_BACKEND", "s3")
    monkeypatch.setenv("ARTIFACT_STORE_S3_BUCKET", "test-bucket")
    monkeypatch.delenv("JOB_QUEUE_BACKEND", raising=False)
    with pytest.raises(RuntimeError, match="JOB_QUEUE_BACKEND"):
        _durable_adapters_or_fail_startup()


def test_production_starts_when_both_backends_are_explicitly_configured(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("ARTIFACT_STORE_BACKEND", "s3")
    monkeypatch.setenv("ARTIFACT_STORE_S3_BUCKET", "test-bucket")
    monkeypatch.setenv("JOB_QUEUE_BACKEND", "durable-db")
    # No RuntimeError, and both backend selections are real, not config
    # no-ops: ARTIFACT_STORE_BACKEND=s3 actually constructs S3ArtifactStore,
    # JOB_QUEUE_BACKEND=durable-db actually constructs DbDurableJobStore.
    artifact_store, job_queue = _durable_adapters_or_fail_startup()
    assert isinstance(artifact_store, S3ArtifactStore)
    assert isinstance(job_queue, DbDurableJobStore)


def test_development_is_unaffected_by_the_production_gate(monkeypatch):
    monkeypatch.delenv("ENV", raising=False)
    monkeypatch.delenv("ARTIFACT_STORE_BACKEND", raising=False)
    monkeypatch.delenv("JOB_QUEUE_BACKEND", raising=False)
    artifact_store, job_queue = _durable_adapters_or_fail_startup()
    assert isinstance(artifact_store, LocalArtifactStore)
    assert isinstance(job_queue, InMemoryDurableJobStore)
