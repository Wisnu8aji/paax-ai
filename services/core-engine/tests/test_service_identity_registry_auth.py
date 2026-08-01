import hashlib
import json

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.auth import get_current_user


def _request(key: str, *, scopes: str = "") -> Request:
    headers = [(b"x-internal-key", key.encode())]
    if scopes:
        headers.append((b"x-internal-scopes", scopes.encode()))
    return Request({"type": "http", "method": "GET", "path": "/calculations", "headers": headers})


def test_core_registry_auth_ignores_spoofed_scope_header(tmp_path, monkeypatch):
    registry = tmp_path / "service-identities.json"
    registry.write_text(json.dumps({"version": 1, "identities": [{
        "identity": "web-user-proxy",
        "credential_sha256": hashlib.sha256(b"web-secret").hexdigest(),
        "scopes": ["core:access"],
        "actor_id": "local-desktop-user",
    }]}), encoding="utf-8")
    monkeypatch.setenv("PAAX_SERVICE_IDENTITY_REGISTRY", str(registry))
    monkeypatch.delenv("PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT", raising=False)

    user = get_current_user(_request("web-secret", scopes="human:approve"), None)

    assert user.uid == "local-desktop-user"
    assert user.service_identity == "web-user-proxy"
    assert user.internal_scopes == frozenset({"core:access"})


def test_core_registry_rejects_key_from_identity_without_core_scope(tmp_path, monkeypatch):
    registry = tmp_path / "service-identities.json"
    registry.write_text(json.dumps({"version": 1, "identities": [{
        "identity": "site-agent",
        "credential_sha256": hashlib.sha256(b"site-secret").hexdigest(),
        "scopes": ["site:access"],
    }]}), encoding="utf-8")
    monkeypatch.setenv("PAAX_SERVICE_IDENTITY_REGISTRY", str(registry))

    user = get_current_user(_request("site-secret"), None)
    assert "core:access" not in user.internal_scopes
