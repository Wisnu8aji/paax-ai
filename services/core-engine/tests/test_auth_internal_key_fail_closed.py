"""A prior audit found that get_current_user's internal-key test bypass
activated whenever ENV defaulted to "development" (i.e. whenever ENV was
simply unset), not only under an explicit test flag. A misconfigured
production deployment that forgot both ENV and INTERNAL_SERVICE_KEY would
then silently accept the well-known "test-internal-key". This proves the
bypass now requires TESTING=1 explicitly."""
import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def app_without_testing_flag(monkeypatch):
    monkeypatch.delenv("TESTING", raising=False)
    monkeypatch.delenv("INTERNAL_SERVICE_KEY", raising=False)
    monkeypatch.delenv("ENV", raising=False)
    from app.main import app
    return app


def test_well_known_test_key_is_rejected_without_testing_flag(app_without_testing_flag):
    client = TestClient(
        app_without_testing_flag,
        headers={"X-Internal-Key": "test-internal-key"},
        raise_server_exceptions=False,
    )
    response = client.get("/regions")
    assert response.status_code == 401


def test_well_known_test_key_is_accepted_with_explicit_testing_flag(monkeypatch):
    monkeypatch.setenv("TESTING", "1")
    monkeypatch.delenv("INTERNAL_SERVICE_KEY", raising=False)
    from app.main import app
    client = TestClient(
        app,
        headers={"X-Internal-Key": "test-internal-key"},
        raise_server_exceptions=False,
    )
    response = client.get("/regions")
    assert response.status_code == 200
