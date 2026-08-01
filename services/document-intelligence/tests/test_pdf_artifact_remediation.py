"""
test_pdf_artifact_remediation.py — Regression test suite for PDF Review/Analyze,
Artifact Storage, Signing, and Service-to-Service Authorization Remediation.
"""

import hashlib
import time
import pytest
import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.artifact_storage import LocalArtifactStore, sign_artifact_key, verify_artifact_signature, _safe_key
from app.api.dem_routes import ARTIFACT_STORE, _artifact_signing_secret


client = TestClient(app)


def test_safe_key_format():
    """Canonical object keys must be relative and portable without colons."""
    assert _safe_key("original-pdf/runs/514fb7f2-26fd-5816-9f22-a4a2412688bf") == "original-pdf/runs/514fb7f2-26fd-5816-9f22-a4a2412688bf"
    with pytest.raises(ValueError, match="relative portable key"):
        _safe_key("reference://plhut-surakarta-2024")


def test_artifact_token_signing_and_verification():
    """Artifact signing token must bind project_id, key, and expiry."""
    secret = b"test-secret-key-32-bytes-long!!"
    key = "original-pdf/runs/test-run-123"
    project_id = "PLHUT-SURAKARTA"
    expiry = int(time.time()) + 300

    token = sign_artifact_key(key, secret=secret, expires_at=expiry, project_id=project_id)
    assert isinstance(token, str)
    assert len(token) > 20

    # Valid token verification
    assert verify_artifact_signature(key, token, secret=secret, project_id=project_id) is True

    # Invalid project_id
    assert verify_artifact_signature(key, token, secret=secret, project_id="WRONG-PROJECT") is False

    # Invalid key
    assert verify_artifact_signature("wrong/key/path", token, secret=secret, project_id=project_id) is False

    # Expired token
    expired_token = sign_artifact_key(key, secret=secret, expires_at=int(time.time()) - 10, project_id=project_id)
    assert verify_artifact_signature(key, expired_token, secret=secret, project_id=project_id) is False


def test_artifact_secret_fails_closed_when_unset(monkeypatch):
    """Signing secret must raise exception when missing and not in test mode."""
    monkeypatch.delenv("ARTIFACT_SIGNING_SECRET", raising=False)
    monkeypatch.delenv("TESTING", raising=False)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        _artifact_signing_secret()
    assert exc_info.value.status_code == 500
    assert "ARTIFACT_SIGNING_SECRET" in exc_info.value.detail
