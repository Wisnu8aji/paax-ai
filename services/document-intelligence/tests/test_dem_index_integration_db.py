"""Integration: document-intelligence index route → services/db (real chain).

ORION-F1 (Fase 0): prove the index endpoint behaves correctly against the
REAL DB service, not a stubbed DemDbClient. Two FastAPI apps are chained
in-process through ASGITransport:

    DI app  (app.main)  ── DemDbClient(transport=ASGITransport(db_app)) ──>  DB app  (paax_db.main)

The DB app uses its real route handlers and the real file-based canonical
package index store (PAAX_DATA_ROOT/db/portable.sqlite). The web-proxy hop
(Next.js route.ts) is covered separately by route.test.ts; this file proves
the DI→DB status/identity chain:

- nonexistent run  → 404 (never 500)
- run with data    → 200 with the drawing package index schema
- run without data → 404 "package index is not available for this run"
- actor local-desktop-user is authorized through /internal/authorize-actor
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")
os.environ.setdefault("TESTING", "1")
os.environ.setdefault("PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT", "1")
os.environ.setdefault(
    "INTERNAL_SERVICE_SCOPES",
    "dem:read,dem:write,dem:delete,dem:authorize-actor,human:approve,di:access",
)

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# DB service under test (real app, real routes, real store).
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "db" / "src"))
import paax_db.database as paax_database
import paax_db.models as paax_models
from paax_db.database import get_db as paax_get_db
from paax_db.main import app as db_app

# DI service under test (real app, real routes).
from app.main import app as di_app
from app.transcription.db_client import DemDbClient

HEADERS = {"X-Internal-Key": "test-internal-key", "X-User-Id": "local-desktop-user"}

RUN_ID = "11111111-1111-1111-1111-111111111111"
PROJECT_ID = "PROJECT-INTEGRATION"


# ── DB app test database (same pattern as services/db/tests/conftest.py) ─────

test_engine = create_async_engine(
    "sqlite+aiosqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = async_sessionmaker(test_engine, expire_on_commit=False)


@event.listens_for(test_engine.sync_engine, "connect")
def _enable_foreign_keys(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


async def _override_get_db():
    async with TestSession() as session:
        yield session


db_app.dependency_overrides[paax_get_db] = _override_get_db


async def _reset_db_schema_async() -> None:
    async with test_engine.begin() as conn:
        await conn.run_sync(paax_models.Base.metadata.drop_all)
        await conn.run_sync(paax_models.Base.metadata.create_all)


@pytest.fixture(autouse=True)
def _reset_db_schema():
    """Sync fixture (asyncio.run) — same pattern as services/db/tests/conftest.py;
    avoids pytest-asyncio 1.4 async-fixture loop-scope restrictions."""
    import asyncio

    asyncio.run(_reset_db_schema_async())
    yield
    asyncio.run(_reset_db_schema_async())


@pytest.fixture
def data_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("PAAX_DATA_ROOT", str(tmp_path))
    return tmp_path


@pytest.fixture
def chained_client(monkeypatch: pytest.MonkeyPatch) -> AsyncClient:
    """DI app whose DemDbClient talks to the REAL DB app via ASGI transport."""

    class _ChainedDemDbClient(DemDbClient):
        def __init__(self, *args, **kwargs):
            super().__init__(base_url="http://db-in-process", internal_key="test-internal-key")
            self._transport = ASGITransport(app=db_app)

    monkeypatch.setattr("app.api.dem_routes.DemDbClient", _ChainedDemDbClient)
    return AsyncClient(transport=ASGITransport(app=di_app), base_url="http://di-test")


async def _seed_db_membership_and_run() -> None:
    """DB SQLAlchemy side: project + local-desktop-user membership + DEM run."""
    async with TestSession() as session:
        session.add(paax_models.Project(id=PROJECT_ID, owner_id="OWNER-INT", name="Integration"))
        session.add(paax_models.ProjectMember(project_id=PROJECT_ID, user_id="local-desktop-user", role="estimator"))
        session.add(
            paax_models.DemRun(
                id=RUN_ID,
                project_id=PROJECT_ID,
                document_id="DOC-INT",
                document_hash="sha256:int",
                file_name="integration.pdf",
                total_pages=1,
                status="synthesis_complete",
                provider="qwen",
                prompt_version="dem-extraction-v1.0.0",
            )
        )
        await session.commit()


def _write_portable_store(data_root: Path, *, with_pages: bool, materialized: bool = True) -> Path:
    """File-based canonical index store (what /package-analysis actually reads)."""
    db_dir = data_root / "db"
    db_dir.mkdir(exist_ok=True)
    db_path = db_dir / "portable.sqlite"
    conn = sqlite3.connect(str(db_path))
    try:
        conn.executescript(
            """
            CREATE TABLE dem_runs (
                id TEXT PRIMARY KEY, project_id TEXT, document_id TEXT,
                document_hash TEXT, file_name TEXT, total_pages INTEGER,
                status TEXT, provider TEXT, prompt_version TEXT,
                created_at TEXT, updated_at TEXT, completed_at TEXT, artifact_key TEXT
            );
            CREATE TABLE dem_pages (
                id TEXT PRIMARY KEY, run_id TEXT, page_index INTEGER,
                status TEXT, attempt_count INTEGER DEFAULT 0, failure_kind TEXT,
                error TEXT, input_hash TEXT, result TEXT,
                paax_classification TEXT, paax_discipline TEXT, paax_level TEXT,
                paax_non_level_category TEXT, paax_classification_status TEXT,
                paax_classification_source TEXT, paax_rule_version TEXT,
                paax_review_decision TEXT, created_at TEXT, updated_at TEXT
            );
            """
        )
        conn.execute(
            "INSERT INTO dem_runs (id, project_id, document_id, document_hash, file_name, total_pages, status, provider, prompt_version, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (RUN_ID, PROJECT_ID, "DOC-INT", "sha256:int", "integration.pdf", 1, "synthesis_complete", "qwen", "v1", "2026-08-06T00:00:00", "2026-08-06T00:00:00"),
        )
        if with_pages:
            cls = "plan" if materialized else None
            cls_status = "confident" if materialized else None
            result_json = json.dumps({"sheet_identity": {"title": {"value": "DENAH"}, "sheet_number": {"value": "A-01"}}})
            conn.execute(
                "INSERT INTO dem_pages (id, run_id, page_index, status, result, paax_classification, paax_discipline, paax_level, paax_non_level_category, paax_classification_status, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                ("page-int-1", RUN_ID, 0, "done", result_json, cls, "Architectural", "Lantai 1" if materialized else None, "" if materialized else None, cls_status, "2026-08-06T00:00:00", "2026-08-06T00:00:00"),
            )
        conn.commit()
    finally:
        conn.close()
    return db_path


@pytest.mark.asyncio
async def test_integration_nonexistent_run_is_404_not_500(chained_client: AsyncClient, data_root: Path):
    """The whole chain must surface 404 for a run the DB does not know."""
    await _seed_db_membership_and_run()
    async with chained_client as ac:
        response = await ac.get("/drawings/dem/99999999-9999-9999-9999-999999999999/index", headers=HEADERS)
    assert response.status_code == 404
    assert response.json()["detail"] == "DEM run not found"


@pytest.mark.asyncio
async def test_integration_run_with_data_returns_200(chained_client: AsyncClient, data_root: Path):
    """Run with materialized pages → 200 with the frontend-facing index shape."""
    await _seed_db_membership_and_run()
    _write_portable_store(data_root, with_pages=True, materialized=True)
    async with chained_client as ac:
        response = await ac.get(f"/drawings/dem/{RUN_ID}/index", headers=HEADERS)
    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"] == RUN_ID
    assert payload["package_id"] == f"run-{RUN_ID}"
    assert payload["document_name"] == "integration.pdf"
    assert payload["total_pages"] == 1
    assert len(payload["entries"]) == 1
    assert payload["entries"][0]["page_number"] == 1
    assert payload["entries"][0]["sheet_code"] == "A-01"
    assert payload["entries"][0]["needs_review"] is False


@pytest.mark.asyncio
async def test_integration_run_without_data_is_404(chained_client: AsyncClient, data_root: Path):
    """Run exists but has no materialized pages → 404, not 500."""
    await _seed_db_membership_and_run()
    _write_portable_store(data_root, with_pages=False)
    async with chained_client as ac:
        response = await ac.get(f"/drawings/dem/{RUN_ID}/index", headers=HEADERS)
    assert response.status_code == 404
    assert "package index" in response.json()["detail"]


@pytest.mark.asyncio
async def test_integration_unmaterialized_run_is_404(chained_client: AsyncClient, data_root: Path):
    """Pages exist but classification was never materialized → 404, not 500."""
    await _seed_db_membership_and_run()
    _write_portable_store(data_root, with_pages=True, materialized=False)
    async with chained_client as ac:
        response = await ac.get(f"/drawings/dem/{RUN_ID}/index", headers=HEADERS)
    assert response.status_code == 404
    assert "package index" in response.json()["detail"]


@pytest.mark.asyncio
async def test_integration_db_down_maps_to_503(chained_client: AsyncClient, data_root: Path, monkeypatch: pytest.MonkeyPatch):
    """When the DB hop fails at the network level the DI surfaces 503, not 500.

    The chain is broken by replacing the DB app transport with one that raises
    ConnectError, simulating services/db being down.
    """

    class _DownTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused", request=request)

    class _BrokenClient(DemDbClient):
        def __init__(self, *args, **kwargs):
            super().__init__(base_url="http://db-down", internal_key="test-internal-key")
            self._transport = _DownTransport()

    monkeypatch.setattr("app.api.dem_routes.DemDbClient", _BrokenClient)
    async with AsyncClient(transport=ASGITransport(app=di_app), base_url="http://di-test") as ac:
        response = await ac.get(f"/drawings/dem/{RUN_ID}/index", headers=HEADERS)
    assert response.status_code == 503
    assert "unavailable" in response.json()["detail"]


@pytest.mark.asyncio
async def test_integration_unauthorized_actor_is_403(chained_client: AsyncClient, data_root: Path):
    """An actor without membership is rejected by the DB through the real chain."""
    await _seed_db_membership_and_run()
    _write_portable_store(data_root, with_pages=True, materialized=True)
    headers_other = {"X-Internal-Key": "test-internal-key", "X-User-Id": "someone-else"}
    async with chained_client as ac:
        response = await ac.get(f"/drawings/dem/{RUN_ID}/index", headers=headers_other)
    assert response.status_code == 403
    assert "not a member" in response.json()["detail"]
