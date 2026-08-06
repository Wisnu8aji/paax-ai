"""Canonical package index error mapping + local-desktop-user actor tests.

ORION-F1 (Fase 0): the DB-owned drawing package index read endpoint must
never collapse known upstream/domain failures into a generic 500:

- FileNotFoundError  → 503 "store is unavailable"   (data root misconfigured)
- ValueError         → 404                           (run missing / not materialized)
- sqlite3.Error      → 503                           (store file is corrupt)

Plus the runtime actor regression: the portable web proxy authenticates as
``local-desktop-user`` (PAAX_PORTABLE_ACTOR_ID) and document-intelligence
verifies that actor through /internal/authorize-actor. This test proves
local-desktop-user is accepted as a project member/owner by the DB's
authoritative membership data.

The endpoint reads the on-disk portable.sqlite via PAAX_DATA_ROOT, so each
test builds a tiny real sqlite file under tmp_path and points PAAX_DATA_ROOT
at it — no mocking of the store layer.
"""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from paax_db.main import app

from .conftest import TestSession

from paax_db import models

INTERNAL_HEADERS = {
    "X-Internal-Key": "test-internal-key",
    "X-User-Id": "dem-job-orchestrator",
}


def _make_store(tmp_path: Path, *, with_run: bool = True, with_pages: bool = True, materialized: bool = True) -> Path:
    """Create a minimal portable.sqlite under tmp_path/db and return its path."""
    db_dir = tmp_path / "db"
    db_dir.mkdir(exist_ok=True)
    db_path = db_dir / "portable.sqlite"
    conn = sqlite3.connect(str(db_path))
    try:
        conn.executescript(
            """
            CREATE TABLE dem_runs (
                id TEXT PRIMARY KEY,
                project_id TEXT,
                document_id TEXT,
                document_hash TEXT,
                file_name TEXT,
                total_pages INTEGER,
                status TEXT,
                provider TEXT,
                prompt_version TEXT,
                created_at TEXT,
                updated_at TEXT,
                completed_at TEXT,
                artifact_key TEXT
            );
            CREATE TABLE dem_pages (
                id TEXT PRIMARY KEY,
                run_id TEXT,
                page_index INTEGER,
                status TEXT,
                attempt_count INTEGER DEFAULT 0,
                failure_kind TEXT,
                error TEXT,
                input_hash TEXT,
                result TEXT,
                paax_classification TEXT,
                paax_discipline TEXT,
                paax_level TEXT,
                paax_non_level_category TEXT,
                paax_classification_status TEXT,
                paax_classification_source TEXT,
                paax_rule_version TEXT,
                paax_review_decision TEXT,
                created_at TEXT,
                updated_at TEXT
            );
            """
        )
        if with_run:
            conn.execute(
                "INSERT INTO dem_runs (id, project_id, document_id, document_hash, file_name, total_pages, status, provider, prompt_version, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    "run-abc",
                    "PROJECT-X",
                    "doc-1",
                    "sha256:abc",
                    "test.pdf",
                    1,
                    "synthesis_complete",
                    "test",
                    "v1",
                    "2026-08-06T00:00:00",
                    "2026-08-06T00:00:00",
                ),
            )
        if with_pages and with_run:
            cls = "plan" if materialized else None
            cls_status = "confident" if materialized else None
            result_json = json.dumps({"sheet_identity": {"title": {"value": "DENAH"}, "sheet_number": {"value": "A-01"}}})
            conn.execute(
                "INSERT INTO dem_pages (id, run_id, page_index, status, result, paax_classification, paax_discipline, paax_level, paax_non_level_category, paax_classification_status, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    "page-1",
                    "run-abc",
                    0,
                    "done",
                    result_json,
                    cls,
                    "Architectural",
                    "Lantai 1" if materialized else None,
                    "" if materialized else None,
                    cls_status,
                    "2026-08-06T00:00:00",
                    "2026-08-06T00:00:00",
                ),
            )
        conn.commit()
    finally:
        conn.close()
    return db_path


@pytest.fixture
def data_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("PAAX_DATA_ROOT", str(tmp_path))
    return tmp_path


@pytest.mark.asyncio
async def test_package_analysis_missing_store_is_503(data_root: Path):
    """No portable.sqlite at the configured data root → 503, never 500."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/projects/PROJECT-X/drawing-intelligence/package-analysis",
            params={"run_id": "run-abc"},
            headers=INTERNAL_HEADERS,
        )
    assert response.status_code == 503
    assert "unavailable" in response.json()["detail"]


@pytest.mark.asyncio
async def test_package_analysis_run_not_found_is_404(data_root: Path, tmp_path: Path):
    """Run that does not exist → ValueError → 404 (never a server fault)."""
    _make_store(tmp_path, with_run=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/projects/PROJECT-X/drawing-intelligence/package-analysis",
            params={"run_id": "run-nope"},
            headers=INTERNAL_HEADERS,
        )
    assert response.status_code == 404
    detail = response.json()["detail"]
    # Explicit run_id against an empty store: the run simply does not exist,
    # so either the "no run for project" or "not part of project" ValueError
    # path is correct — both must surface as 404, never 500.
    assert "No DEM run found" in detail or "not part of project" in detail


@pytest.mark.asyncio
async def test_package_analysis_run_not_in_project_is_404(data_root: Path, tmp_path: Path):
    """Run exists but belongs to another project → ValueError → 404."""
    _make_store(tmp_path, with_run=True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/projects/PROJECT-OTHER/drawing-intelligence/package-analysis",
            params={"run_id": "run-abc"},
            headers=INTERNAL_HEADERS,
        )
    assert response.status_code == 404
    assert "not part of project" in response.json()["detail"]


@pytest.mark.asyncio
async def test_package_analysis_run_without_pages_is_404(data_root: Path, tmp_path: Path):
    """Run exists but has no dem_pages yet → ValueError → 404 (not materialized)."""
    _make_store(tmp_path, with_run=True, with_pages=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/projects/PROJECT-X/drawing-intelligence/package-analysis",
            params={"run_id": "run-abc"},
            headers=INTERNAL_HEADERS,
        )
    assert response.status_code == 404
    assert "No dem_pages found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_package_analysis_unmaterialized_run_is_404(data_root: Path, tmp_path: Path):
    """Pages exist but classification columns were never materialized → 404."""
    _make_store(tmp_path, with_run=True, with_pages=True, materialized=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/projects/PROJECT-X/drawing-intelligence/package-analysis",
            params={"run_id": "run-abc"},
            headers=INTERNAL_HEADERS,
        )
    assert response.status_code == 404
    assert "not materialized" in response.json()["detail"]


@pytest.mark.asyncio
async def test_package_analysis_corrupt_store_is_503(data_root: Path, tmp_path: Path):
    """Corrupt sqlite file → sqlite3.Error → 503, never 500."""
    db_dir = tmp_path / "db"
    db_dir.mkdir(exist_ok=True)
    (db_dir / "portable.sqlite").write_bytes(b"this is not a sqlite database at all" * 8)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/projects/PROJECT-X/drawing-intelligence/package-analysis",
            params={"run_id": "run-abc"},
            headers=INTERNAL_HEADERS,
        )
    assert response.status_code == 503
    assert "unavailable" in response.json()["detail"]


@pytest.mark.asyncio
async def test_package_analysis_materialized_run_returns_200(data_root: Path, tmp_path: Path):
    """Happy path: materialized run returns the canonical index with pages."""
    _make_store(tmp_path, with_run=True, with_pages=True, materialized=True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/projects/PROJECT-X/drawing-intelligence/package-analysis",
            params={"run_id": "run-abc"},
            headers=INTERNAL_HEADERS,
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"] == "run-abc"
    assert payload["total_pages"] == 1
    assert payload["pages"][0]["page_number"] == 1
    assert payload["pages"][0]["classification"] == "plan"
    assert payload["pages"][0]["classification_status"] == "confident"


# ── local-desktop-user actor (runtime regression from Fase 0) ────────────────


async def _insert_local_desktop_membership(*, member: bool = False, owner: bool = False) -> None:
    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-LOCAL", owner_id="some-owner", name="Local"))
        if member:
            session.add(models.ProjectMember(project_id="PROJECT-LOCAL", user_id="local-desktop-user", role="estimator"))
        await session.commit()


@pytest.mark.asyncio
async def test_authorize_actor_accepts_local_desktop_user_as_member():
    """The portable actor used by the web proxy must pass membership checks."""
    await _insert_local_desktop_membership(member=True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/internal/authorize-actor",
            json={"actor_id": "local-desktop-user", "project_id": "PROJECT-LOCAL"},
            headers=INTERNAL_HEADERS,
        )
    assert response.status_code == 200
    assert response.json()["authorized"] is True


@pytest.mark.asyncio
async def test_authorize_actor_accepts_local_desktop_user_as_owner():
    """Project owner fallback also covers the portable actor."""
    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-LOCAL-OWN", owner_id="local-desktop-user", name="Local Own"))
        await session.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/internal/authorize-actor",
            json={"actor_id": "local-desktop-user", "project_id": "PROJECT-LOCAL-OWN"},
            headers=INTERNAL_HEADERS,
        )
    assert response.status_code == 200
    assert response.json()["authorized"] is True


@pytest.mark.asyncio
async def test_authorize_actor_rejects_unknown_local_desktop_user():
    """Without membership, the actor is rejected — the DB remains authoritative."""
    await _insert_local_desktop_membership(member=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/internal/authorize-actor",
            json={"actor_id": "local-desktop-user", "project_id": "PROJECT-LOCAL"},
            headers=INTERNAL_HEADERS,
        )
    assert response.status_code == 403
