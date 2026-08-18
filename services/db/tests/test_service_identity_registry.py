from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from starlette.requests import Request

from paax_db.auth import get_current_user
from paax_db import models
from paax_db.main import app


REPO_ROOT = Path(__file__).resolve().parents[3]


def _request(headers: dict[str, str]) -> Request:
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/projects/PROJECT-A",
        "headers": [(key.lower().encode(), value.encode()) for key, value in headers.items()],
    })


def _write_registry(path, *, credential: str, identity: str, scopes: list[str], actor_id: str | None = None) -> None:
    entry = {
        "identity": identity,
        "credential_sha256": hashlib.sha256(credential.encode("utf-8")).hexdigest(),
        "scopes": scopes,
    }
    if actor_id is not None:
        entry["actor_id"] = actor_id
    path.write_text(json.dumps({"version": 1, "identities": [entry]}), encoding="utf-8")


def test_registry_binds_identity_scopes_and_actor_not_request_headers(tmp_path, monkeypatch):
    registry = tmp_path / "service-identities.json"
    _write_registry(
        registry,
        credential="web-secret",
        identity="web-user-proxy",
        scopes=["human:approve"],
        actor_id="local-desktop-user",
    )
    assert "web-secret" not in registry.read_text(encoding="utf-8")
    monkeypatch.setenv("PAAX_SERVICE_IDENTITY_REGISTRY", str(registry))
    monkeypatch.delenv("PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT", raising=False)

    user = get_current_user(_request({
        "X-Internal-Key": "web-secret",
        "X-User-Id": "attacker",
        "X-Internal-Scopes": "agent:propose,human:approve",
    }), None)

    assert user.uid == "local-desktop-user"
    assert user.service_identity == "web-user-proxy"
    assert user.internal_scopes == frozenset({"human:approve"})


def test_registry_rejects_invalid_key_without_legacy_fallback(tmp_path, monkeypatch):
    registry = tmp_path / "service-identities.json"
    _write_registry(registry, credential="real-secret", identity="ai-orchestrator", scopes=["agent:propose"])
    monkeypatch.setenv("PAAX_SERVICE_IDENTITY_REGISTRY", str(registry))
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "wrong-but-configured")
    monkeypatch.delenv("PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT", raising=False)

    with pytest.raises(HTTPException) as raised:
        get_current_user(_request({"X-Internal-Key": "wrong-but-configured"}), None)

    assert raised.value.status_code == 401


def test_legacy_single_key_is_disabled_by_default_and_available_only_for_explicit_rollback(monkeypatch):
    monkeypatch.delenv("PAAX_SERVICE_IDENTITY_REGISTRY", raising=False)
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "legacy-key")
    monkeypatch.delenv("PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT", raising=False)

    with pytest.raises(HTTPException) as disabled:
        get_current_user(_request({"X-Internal-Key": "legacy-key"}), None)
    assert disabled.value.status_code == 401

    monkeypatch.setenv("PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT", "1")
    monkeypatch.setenv("INTERNAL_SERVICE_SCOPES", "dem:read")
    user = get_current_user(_request({"X-Internal-Key": "legacy-key", "X-User-Id": "rollback-user"}), None)

    assert user.uid == "rollback-user"
    assert user.service_identity == "legacy-single-key"
    assert user.internal_scopes == frozenset({"dem:read"})


def test_portable_launcher_uses_per_service_key_files_and_hash_only_registry():
    source = (REPO_ROOT / "scripts/portable/Start-PLHUT-Local.ps1").read_text(encoding="utf-8")

    assert '"service-identities.json"' in source
    assert '"service-credentials"' in source
    assert "credential_sha256" in source
    assert "[hashtable]$ServiceEnvironment" in source
    assert "$psi.EnvironmentVariables[$environmentName] = $value" in source
    assert "internal-service.key" not in source


def test_portable_launcher_runs_pinned_pnpm_through_command_shell_shim():
    """Regression: ProcessStartInfo with UseShellExecute=false cannot execute a
    .cmd shim directly on Windows.  The portable launcher must route Corepack
    through cmd.exe and use the pnpm version pinned by the workspace."""
    source = (REPO_ROOT / "scripts/portable/Start-PLHUT-Local.ps1").read_text(encoding="utf-8")

    assert "function Set-ProcessLaunchCommand" in source
    assert "$Psi.FileName = $env:ComSpec" in source
    assert '$Psi.Arguments = (' in source
    assert "ArgumentList" not in source
    assert 'Start-ServiceProcess "ai-orchestrator" "corepack.cmd" @($packageManager' in source
    assert 'Start-ServiceProcess "web" "corepack.cmd" @($packageManager' in source


def test_portable_launcher_validates_listener_identity_not_only_cmd_wrapper_pid():
    """A Corepack launch records cmd.exe as the parent PID, while Next owns the
    TCP port in a child process. The listener command line is the authoritative
    repository identity for an already-running service."""
    source = (REPO_ROOT / "scripts/portable/Start-PLHUT-Local.ps1").read_text(encoding="utf-8")

    assert "function Test-ListenerOwnership" in source
    assert "$listenerCmdLine.Contains($repoRoot)" in source
    assert "Test-ListenerOwnership -Port $Port -ServiceName $Name" in source


def test_portable_launcher_has_valid_powershell_syntax():
    script = REPO_ROOT / "scripts/portable/Start-PLHUT-Local.ps1"
    command = (
        "$tokens = $null; $errors = $null; "
        f"[System.Management.Automation.Language.Parser]::ParseFile('{script}', [ref]$tokens, [ref]$errors) | Out-Null; "
        "if ($errors.Count) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }"
    )
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", command],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr


def test_portable_launcher_document_intelligence_identity_grants_project_graph_synthesize_scope():
    """Regression: the durable document-intelligence worker processes dem.synthesize
    jobs and then calls GET /projects/{id}/sheet-revisions/active and
    POST /projects/{id}/project-graph/snapshots, both gated by
    service_scope="project_graph:synthesize" in services/db. The portable
    launcher's document-intelligence identity must declare that scope or the
    worker is denied 403 for the active-sheet-revision read."""
    source = (REPO_ROOT / "scripts/portable/Start-PLHUT-Local.ps1").read_text(encoding="utf-8")

    identity_lines = [
        line
        for line in source.splitlines()
        if '"document-intelligence"' in line and 'identity = "document-intelligence"' in line
    ]
    assert identity_lines, "document-intelligence identity missing from portable launcher"
    assert len(identity_lines) == 1
    assert "project_graph:synthesize" in identity_lines[0]


@pytest.mark.asyncio
async def test_registry_allows_web_human_approval_but_denies_agent_resolve(tmp_path, monkeypatch):
    registry = tmp_path / "service-identities.json"
    registry.write_text(json.dumps({"version": 1, "identities": [
        {
            "identity": "web-user-proxy",
            "credential_sha256": hashlib.sha256(b"web-secret").hexdigest(),
            "scopes": ["human:approve"],
            "actor_id": "OWNER-A",
        },
        {
            "identity": "ai-orchestrator",
            "credential_sha256": hashlib.sha256(b"agent-secret").hexdigest(),
            "scopes": ["agent:propose", "agent:calculate"],
        },
    ]}), encoding="utf-8")
    monkeypatch.setenv("PAAX_SERVICE_IDENTITY_REGISTRY", str(registry))
    monkeypatch.delenv("PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT", raising=False)

    web = {"X-Internal-Key": "web-secret", "X-User-Id": "spoofed"}
    agent = {"X-Internal-Key": "agent-secret", "X-Internal-Scopes": "human:approve"}
    snapshot = {
        "snapshot_id": "SNAP-A", "schema_version": "paax.pckm.graph.v1", "source_manifest_hash": "a",
        "generation_metadata": {}, "nodes": [{"node_id": "J2", "node_type": "element_type", "canonical_name": "J2", "normalized_name": "j2", "discipline": "architecture", "verification_status": "extracted", "confidence": 1}],
        "edges": [], "evidence": [], "node_evidence": [], "edge_evidence": [], "aliases": [], "communities": [],
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post("/projects", json={"id": "PROJECT-A", "owner_id": "spoofed", "name": "Project A"}, headers=web)).status_code == 200
        assert (await client.get("/projects/PROJECT-A", headers=web)).status_code == 200
        assert (await client.post("/projects/PROJECT-A/project-graph/snapshots", json=snapshot, headers=web)).status_code == 200
        assert (await client.post("/projects/PROJECT-A/project-graph/corrections", json={"id": "CORR-1", "snapshot_id": "SNAP-A", "target_type": "node", "target_id": "J2", "correction_type": "rename", "proposed_value": {"canonical_name": "Jendela J2"}, "rationale": "Sheet label"}, headers=web)).status_code == 200
        recommendation = await client.post("/projects/PROJECT-A/project-graph/recommendations", json={"snapshot_id": "SNAP-A", "target_type": "project_graph_correction", "target_id": "CORR-1", "recommendation": "recommend_accept", "rationale": "Evidence supports human review", "idempotency_key": "agent-run-1"}, headers=agent)
        listed = await client.get("/projects/PROJECT-A/project-graph/recommendations", headers=web)
        denied = await client.post("/projects/PROJECT-A/project-graph/corrections/CORR-1/resolve", json={"status": "resolved", "resolution_note": "agent must not resolve"}, headers=agent)
        approved = await client.post("/projects/PROJECT-A/project-graph/corrections/CORR-1/resolve", json={"status": "resolved", "resolution_note": "human review"}, headers=web)

    assert recommendation.status_code == 201
    assert recommendation.json()["created_by_service_identity"] == "ai-orchestrator"
    assert listed.status_code == 200
    assert listed.json()[0]["metadata"] == {}
    assert denied.status_code == 403
    assert approved.status_code == 200


@pytest.mark.asyncio
async def test_registry_document_intelligence_has_only_its_declared_authorize_actor_scope(tmp_path, monkeypatch):
    from .conftest import TestSession

    registry = tmp_path / "service-identities.json"
    registry.write_text(json.dumps({"version": 1, "identities": [{
        "identity": "document-intelligence",
        "credential_sha256": hashlib.sha256(b"di-secret").hexdigest(),
        "scopes": ["dem:authorize-actor"],
    }]}), encoding="utf-8")
    monkeypatch.setenv("PAAX_SERVICE_IDENTITY_REGISTRY", str(registry))
    monkeypatch.delenv("PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT", raising=False)
    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-DI", owner_id="OWNER-DI", name="Project DI"))
        await session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/internal/authorize-actor", json={"project_id": "PROJECT-DI", "actor_id": "OWNER-DI"}, headers={"X-Internal-Key": "di-secret", "X-Internal-Scopes": "human:approve"})

    assert response.status_code == 200
    assert response.json()["authorized"] is True


@pytest.mark.asyncio
async def test_registry_project_graph_synthesis_authorized_only_with_document_intelligence_scope(tmp_path, monkeypatch):
    """Regression: Start-PLHUT-Local.ps1 grants the document-intelligence identity
    project_graph:synthesize. With that registry-granted scope the dem.synthesize
    worker's two DB calls succeed; an identity that lacks the scope (the launcher
    before the fix) is denied 403 exactly like the reported PLHUT local failure."""
    from .conftest import TestSession

    registry = tmp_path / "service-identities.json"
    registry.write_text(json.dumps({"version": 1, "identities": [
        {
            "identity": "document-intelligence",
            "credential_sha256": hashlib.sha256(b"di-secret").hexdigest(),
            "scopes": ["dem:read", "dem:write", "dem:delete", "dem:authorize-actor", "project_graph:synthesize", "di:access", "core:access"],
        },
        {
            "identity": "di-without-synthesize",
            "credential_sha256": hashlib.sha256(b"di-narrow-secret").hexdigest(),
            "scopes": ["dem:read", "dem:write", "dem:delete", "dem:authorize-actor", "di:access", "core:access"],
        },
    ]}), encoding="utf-8")
    monkeypatch.setenv("PAAX_SERVICE_IDENTITY_REGISTRY", str(registry))
    monkeypatch.delenv("PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT", raising=False)

    async with TestSession() as session:
        session.add(models.Project(id="PLHUT-SURAKARTA", owner_id="owner-plhut", name="PLHUT Surakarta"))
        await session.commit()

    headers = {"X-Internal-Key": "di-secret"}
    narrow_headers = {"X-Internal-Key": "di-narrow-secret"}
    snapshot = {
        "snapshot_id": "SNAP-PLHUT-1", "schema_version": "paax.pckm.graph.v1", "source_manifest_hash": "manifest",
        "generation_metadata": {"run_id": "RUN-1"}, "nodes": [], "edges": [], "evidence": [],
        "node_evidence": [], "edge_evidence": [], "aliases": [], "communities": [],
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        active = await client.get("/projects/PLHUT-SURAKARTA/sheet-revisions/active", headers=headers)
        posted = await client.post("/projects/PLHUT-SURAKARTA/project-graph/snapshots", json=snapshot, headers=headers)
        narrow_active = await client.get("/projects/PLHUT-SURAKARTA/sheet-revisions/active", headers=narrow_headers)
        narrow_posted = await client.post("/projects/PLHUT-SURAKARTA/project-graph/snapshots", json={**snapshot, "snapshot_id": "SNAP-PLHUT-2"}, headers=narrow_headers)

    assert active.status_code == 200
    assert active.json() == []
    assert posted.status_code == 200
    assert narrow_active.status_code == 403
    assert narrow_posted.status_code == 403
