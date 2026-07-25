"""A prior audit found that get_current_user's internal-key test bypass
activated whenever ENV defaulted to "development" (i.e. whenever ENV was
simply unset), not only under an explicit test flag. A misconfigured
production deployment that forgot both ENV and INTERNAL_SERVICE_KEY would
then silently accept the well-known "test-internal-key". This proves the
bypass now requires TESTING=1 explicitly."""
import pytest
from fastapi.testclient import TestClient


def test_well_known_test_key_is_rejected_without_testing_flag(monkeypatch):
    # app.main is already imported by other test modules by the time this
    # runs (dotenv-loaded INTERNAL_SERVICE_KEY included) -- delete the env
    # vars *after* import so the check exercises get_current_user's runtime
    # os.environ.get() reads, the same ones a real unset-in-prod deployment
    # would hit.
    from app.main import app
    monkeypatch.delenv("TESTING", raising=False)
    monkeypatch.delenv("INTERNAL_SERVICE_KEY", raising=False)
    monkeypatch.delenv("ENV", raising=False)

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get(
        "/drawings/dem/RUN-DOES-NOT-MATTER/status",
        headers={"X-Internal-Key": "test-internal-key"},
    )
    assert response.status_code == 401


def test_well_known_test_key_is_accepted_with_explicit_testing_flag(monkeypatch):
    from app.main import app
    monkeypatch.delenv("INTERNAL_SERVICE_KEY", raising=False)
    monkeypatch.setenv("TESTING", "1")

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get(
        "/drawings/dem/RUN-DOES-NOT-EXIST/status",
        headers={"X-Internal-Key": "test-internal-key"},
    )
    # Auth passes (not 401); the route itself then fails on the unknown run --
    # that non-401 is proof the auth boundary let the request through.
    assert response.status_code != 401
