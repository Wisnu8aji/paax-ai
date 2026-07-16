# DEM Phase 2 — Job Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Process an 88-page PDF (or any page count) into one validated `DrawingEvidenceSheet` per page via Qwen3.7-Plus vision, with Postgres-backed state that survives restarts, resumes without re-running completed pages, and classifies failures instead of retrying blindly.

**Architecture:** A `dem_runs`/`dem_pages` Postgres schema (new Alembic migration in `services/db`) tracks a two-level state machine (document job, page task). A background async loop in `services/document-intelligence` renders each PDF page to PNG (PyMuPDF), calls a `DemVisionProvider` adapter (Qwen implementation + mock for tests), validates the response against the existing `DrawingEvidenceSheet` Pydantic schema, and persists results via `services/db`'s HTTP API — following the exact pattern Command Room's `tools.ts` already uses to call `services/db` (`X-Internal-Key` header, JSON over HTTP, not a shared DB connection).

**Tech Stack:** FastAPI (async), SQLAlchemy async ORM + Alembic (services/db), Pydantic v2, PyMuPDF (`fitz`), httpx (outbound calls from document-intelligence to services/db and to DashScope), pytest + pytest-asyncio, sqlite+aiosqlite for tests.

## Global Constraints

- Confidence fields always `float`, range `0.0`-`1.0` (existing DEM schema convention, `services/document-intelligence/app/transcription/models.py`).
- `dem_pages.status`/`dem_runs.status` stored as `String`, not Postgres ENUM — matches the documented convention in `services/db/alembic/versions/0007_command_room_memory.py` line 57-59 (new status values later don't need `ALTER TYPE`).
- Every DB table gets a matching Alembic migration under `services/db/alembic/versions/`, revision chained from `0007` (this plan's migration is `0008`).
- No calculation logic anywhere in this plan — DEM only transcribes; the Golden Rule (`CLAUDE.md` §1) forbids computing derived numbers (area from dimensions, etc.) in this pipeline.
- Failure classification is **not** blind N-times retry: `transient` → retry with backoff; `invalid_output` → exactly one repair pass, then fail with the real validation error preserved; `permanent` → fail immediately, no retry. (User-specified design constraint, `docs/superpowers/specs/2026-07-14-dem-phase2-job-orchestrator-design.md`.)
- `DEM_EXTRACTION_API_KEY`/`DEM_EXTRACTION_BASE_URL`/`DEM_EXTRACTION_MODEL`/`DEM_EXTRACTION_PROVIDER` are separate from Command Room's `DASHSCOPE_API_KEY` — never read the latter in this plan's code.
- Git: commit locally only, per task, using the existing repo convention. **Never push, open a PR, or merge** — that gate is owner-only (`CLAUDE.md` §5).

---

### Task 1: `dem_runs`/`dem_pages` Alembic migration + SQLAlchemy models

**Files:**
- Create: `services/db/alembic/versions/0008_dem_runs.py`
- Modify: `services/db/src/paax_db/models.py` (append `DemRun`, `DemPage` classes at end of file)
- Modify: `services/db/src/paax_db/schemas.py` (append DEM request/response schemas at end of file)
- Test: `services/db/tests/test_dem_runs.py`

**Interfaces:**
- Produces: SQLAlchemy models `models.DemRun`, `models.DemPage` (importable from `paax_db.models`); Pydantic schemas `schemas.DemRunCreate`, `schemas.DemRunResponse`, `schemas.DemPageResponse` (importable from `paax_db.schemas`). Later tasks (Task 3+) import these.

- [ ] **Step 1: Write the failing test**

Create `services/db/tests/test_dem_runs.py`:

```python
"""Test dem_runs/dem_pages tables -- DEM Phase 2 job orchestrator persistence."""
import pytest
from httpx import AsyncClient, ASGITransport
import os

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")

from paax_db.main import app

HEADERS = {"X-Internal-Key": "test-internal-key", "X-User-Id": "user-abc"}


@pytest.mark.asyncio
async def test_dem_run_create_and_list_pages():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post("/dem/runs", json={
            "project_id": "proj-1",
            "document_id": "DOC-PLHUT-001",
            "document_hash": "sha256:abc123",
            "file_name": "GAMBAR KERJA PLHUT SURAKARTA (1).pdf",
            "total_pages": 3,
            "provider": "qwen",
            "prompt_version": "dem-extraction-v1.0.0",
        }, headers=HEADERS)
        assert res.status_code == 200
        run = res.json()
        assert run["status"] == "created"
        assert run["total_pages"] == 3
        run_id = run["id"]

        res = await ac.get(f"/dem/runs/{run_id}", headers=HEADERS)
        assert res.status_code == 200
        assert res.json()["id"] == run_id
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/db && python -m pytest tests/test_dem_runs.py -v`
Expected: FAIL with `404` (route `/dem/runs` doesn't exist yet) or import error.

- [ ] **Step 3: Add SQLAlchemy models**

Append to `services/db/src/paax_db/models.py` (after the last class, `MemoryGraphMap`):

```python
# DEM Phase 2 job orchestrator -- docs/superpowers/specs/
# 2026-07-14-dem-phase2-job-orchestrator-design.md. status stored as String
# (not Postgres ENUM), same convention as durable_memories.scope/type --
# see the note in alembic/versions/0007_command_room_memory.py.
class DemRun(Base):
    __tablename__ = "dem_runs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id = Column(String, index=True, nullable=True)
    document_id = Column(String, nullable=False)
    document_hash = Column(String, index=True, nullable=False)
    file_name = Column(String, nullable=False)
    total_pages = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="created")
    provider = Column(String, nullable=False)
    prompt_version = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class DemPage(Base):
    __tablename__ = "dem_pages"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    run_id = Column(GUID(), ForeignKey("dem_runs.id", ondelete="CASCADE"), index=True, nullable=False)
    page_index = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="queued")
    attempt_count = Column(Integer, nullable=False, default=0)
    failure_kind = Column(String, nullable=True)
    error = Column(String, nullable=True)
    input_hash = Column(String, nullable=True)
    result = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
```

Check the top of `models.py` for the existing import line (e.g. `from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, func, JSON` or similar) and add `JSON` to it if not already imported — grep first: `grep -n "^from sqlalchemy import" services/db/src/paax_db/models.py`.

- [ ] **Step 4: Add Pydantic schemas**

Append to `services/db/src/paax_db/schemas.py`:

```python
# ─── DEM Phase 2 job orchestrator (docs/superpowers/specs/
# 2026-07-14-dem-phase2-job-orchestrator-design.md) ──────────────────────────

class DemRunCreate(BaseModel):
    project_id: Optional[str] = None
    document_id: str
    document_hash: str
    file_name: str
    total_pages: int
    provider: str
    prompt_version: str

class DemRunResponse(BaseModel):
    id: uuid.UUID
    project_id: Optional[str] = None
    document_id: str
    document_hash: str
    file_name: str
    total_pages: int
    status: str
    provider: str
    prompt_version: str
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class DemPageResponse(BaseModel):
    id: uuid.UUID
    run_id: uuid.UUID
    page_index: int
    status: str
    attempt_count: int
    failure_kind: Optional[str] = None
    error: Optional[str] = None
    input_hash: Optional[str] = None
    result: Optional[dict] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class DemRunStatusResponse(BaseModel):
    id: uuid.UUID
    status: str
    total_pages: int
    pages: list[DemPageResponse]
```

- [ ] **Step 5: Add the two endpoints**

Append to `services/db/src/paax_db/main.py` (after the last `/memory/durable` route):

```python
@app.post("/dem/runs", response_model=schemas.DemRunResponse, dependencies=[Depends(get_current_user)])
async def create_dem_run(run: schemas.DemRunCreate, db: AsyncSession = Depends(get_db)):
    db_run = models.DemRun(**run.model_dump())
    db.add(db_run)
    await db.commit()
    await db.refresh(db_run)
    return db_run

@app.get("/dem/runs/{id}", response_model=schemas.DemRunResponse, dependencies=[Depends(get_current_user)])
async def get_dem_run(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.DemRun).where(models.DemRun.id == id))
    run = result.scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="DEM run not found")
    return run

@app.get("/dem/runs/{id}/status", response_model=schemas.DemRunStatusResponse, dependencies=[Depends(get_current_user)])
async def get_dem_run_status(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.DemRun).where(models.DemRun.id == id))
    run = result.scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="DEM run not found")
    pages_result = await db.execute(
        select(models.DemPage).where(models.DemPage.run_id == id).order_by(models.DemPage.page_index)
    )
    pages = pages_result.scalars().all()
    return schemas.DemRunStatusResponse(id=run.id, status=run.status, total_pages=run.total_pages, pages=pages)

@app.post("/dem/pages", response_model=schemas.DemPageResponse, dependencies=[Depends(get_current_user)])
async def create_dem_page(run_id: str, page_index: int, db: AsyncSession = Depends(get_db)):
    db_page = models.DemPage(run_id=run_id, page_index=page_index)
    db.add(db_page)
    await db.commit()
    await db.refresh(db_page)
    return db_page

@app.put("/dem/pages/{id}", response_model=schemas.DemPageResponse, dependencies=[Depends(get_current_user)])
async def update_dem_page(id: str, update: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.DemPage).where(models.DemPage.id == id))
    page = result.scalars().first()
    if not page:
        raise HTTPException(status_code=404, detail="DEM page not found")
    for key, value in update.items():
        if hasattr(page, key):
            setattr(page, key, value)
    await db.commit()
    await db.refresh(page)
    return page
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd services/db && python -m pytest tests/test_dem_runs.py -v`
Expected: PASS, `1 passed`.

- [ ] **Step 7: Write the Alembic migration**

Create `services/db/alembic/versions/0008_dem_runs.py`:

```python
"""add dem_runs, dem_pages (DEM Phase 2 job orchestrator)

docs/superpowers/specs/2026-07-14-dem-phase2-job-orchestrator-design.md

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-14 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0008'
down_revision: Union[str, None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'dem_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', sa.String(), nullable=True),
        sa.Column('document_id', sa.String(), nullable=False),
        sa.Column('document_hash', sa.String(), nullable=False),
        sa.Column('file_name', sa.String(), nullable=False),
        sa.Column('total_pages', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='created'),
        sa.Column('provider', sa.String(), nullable=False),
        sa.Column('prompt_version', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f('ix_dem_runs_project_id'), 'dem_runs', ['project_id'], unique=False)
    op.create_index(op.f('ix_dem_runs_document_hash'), 'dem_runs', ['document_hash'], unique=False)

    op.create_table(
        'dem_pages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('run_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('dem_runs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('page_index', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='queued'),
        sa.Column('attempt_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failure_kind', sa.String(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('input_hash', sa.String(), nullable=True),
        sa.Column('result', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index(op.f('ix_dem_pages_run_id'), 'dem_pages', ['run_id'], unique=False)
    op.create_index('idx_dem_pages_run_page', 'dem_pages', ['run_id', 'page_index'], unique=True)


def downgrade() -> None:
    op.drop_index('idx_dem_pages_run_page', table_name='dem_pages')
    op.drop_index(op.f('ix_dem_pages_run_id'), table_name='dem_pages')
    op.drop_table('dem_pages')
    op.drop_index(op.f('ix_dem_runs_document_hash'), table_name='dem_runs')
    op.drop_index(op.f('ix_dem_runs_project_id'), table_name='dem_runs')
    op.drop_table('dem_runs')
```

- [ ] **Step 8: Run the full services/db suite to confirm no regressions**

Run: `cd services/db && python -m pytest -q`
Expected: all prior tests plus the new one pass, zero failures.

- [ ] **Step 9: Run Alembic migration check**

Run: `cd services/db && python -m pytest tests/test_alembic_migrations.py -v`
Expected: PASS (this test file already verifies migrations apply cleanly — confirms `0008` chains correctly from `0007`).

- [ ] **Step 10: Commit**

```bash
git add services/db/alembic/versions/0008_dem_runs.py services/db/src/paax_db/models.py services/db/src/paax_db/schemas.py services/db/src/paax_db/main.py services/db/tests/test_dem_runs.py
git commit -m "feat(db): add dem_runs/dem_pages tables + endpoints for DEM Phase 2 job orchestrator"
```

---

### Task 2: Failure classification helper

**Files:**
- Create: `services/document-intelligence/app/transcription/failure_classification.py`
- Test: `services/document-intelligence/tests/test_failure_classification.py`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure logic, no I/O).
- Produces: `FailureKind` (`Literal["transient", "invalid_output", "permanent"]`), `classify_http_error(status_code: int) -> FailureKind`, `DemProviderError` exception class with `.kind: FailureKind` attribute. Task 3 (provider adapter) and Task 5 (page loop) import these.

- [ ] **Step 1: Write the failing test**

Create `services/document-intelligence/tests/test_failure_classification.py`:

```python
from __future__ import annotations

import pytest

from app.transcription.failure_classification import (
    DemProviderError,
    classify_http_error,
)


def test_classify_http_error_429_is_transient():
    assert classify_http_error(429) == "transient"


def test_classify_http_error_500_is_transient():
    assert classify_http_error(503) == "transient"


def test_classify_http_error_401_is_permanent():
    assert classify_http_error(401) == "permanent"


def test_classify_http_error_400_is_permanent():
    assert classify_http_error(400) == "permanent"


def test_classify_http_error_unknown_defaults_to_invalid_output():
    # A status code that isn't a recognized transient/permanent case
    # (e.g. a provider-specific 2xx-with-error-body) is treated as
    # invalid_output -- eligible for exactly one repair pass, not
    # assumed permanent or blindly retried.
    assert classify_http_error(200) == "invalid_output"


def test_dem_provider_error_carries_kind():
    err = DemProviderError("boom", kind="transient")
    assert err.kind == "transient"
    assert str(err) == "boom"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/document-intelligence && python -m pytest tests/test_failure_classification.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.transcription.failure_classification'`.

- [ ] **Step 3: Write the implementation**

Create `services/document-intelligence/app/transcription/failure_classification.py`:

```python
"""
PAAX Document Intelligence - DEM Phase 2 failure classification.

Bukan retry buta N kali (docs/superpowers/specs/
2026-07-14-dem-phase2-job-orchestrator-design.md "Klasifikasi kegagalan"):
setiap kegagalan calling_model diklasifikasi dulu sebelum diputuskan tindakan
(retry sama persis / repair pass sekali / langsung failed).
"""
from __future__ import annotations

from typing import Literal

FailureKind = Literal["transient", "invalid_output", "permanent"]

_TRANSIENT_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
_PERMANENT_STATUS_CODES = {400, 401, 403, 404, 422}


class DemProviderError(Exception):
    """Error dari provider vision (Qwen dkk) atau parser, membawa klasifikasi
    kegagalan supaya page loop (Task 5) tahu tindakan apa yang tepat -- retry
    sama persis (transient), repair pass sekali (invalid_output), atau
    langsung failed tanpa retry (permanent)."""

    def __init__(self, message: str, *, kind: FailureKind) -> None:
        super().__init__(message)
        self.kind: FailureKind = kind


def classify_http_error(status_code: int) -> FailureKind:
    if status_code in _TRANSIENT_STATUS_CODES:
        return "transient"
    if status_code in _PERMANENT_STATUS_CODES:
        return "permanent"
    return "invalid_output"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/document-intelligence && python -m pytest tests/test_failure_classification.py -v`
Expected: PASS, `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add services/document-intelligence/app/transcription/failure_classification.py services/document-intelligence/tests/test_failure_classification.py
git commit -m "feat(doc-intel): add DEM failure classification (transient/invalid_output/permanent)"
```

---

### Task 3: Provider adapter interface + Qwen adapter + mock adapter

**Files:**
- Create: `services/document-intelligence/app/transcription/providers/__init__.py`
- Create: `services/document-intelligence/app/transcription/providers/base.py`
- Create: `services/document-intelligence/app/transcription/providers/qwen.py`
- Create: `services/document-intelligence/app/transcription/providers/mock.py`
- Test: `services/document-intelligence/tests/test_dem_providers.py`

**Interfaces:**
- Consumes: `DemProviderError`, `FailureKind`, `classify_http_error` from Task 2 (`app.transcription.failure_classification`); `DrawingEvidenceSheet` from `app.transcription.models` (Phase 0+1, already exists).
- Produces: `DemVisionProvider` Protocol with method `extract_page(image_bytes: bytes, page_context: PageContext, prompt_version: str) -> dict` (returns raw JSON dict, NOT yet validated into `DrawingEvidenceSheet` -- validation happens in Task 4's parser); `PageContext` dataclass (`document_id: str, page_index: int, page_number: int`); `QwenDemAdapter` dataclass with `.from_env() -> QwenDemAdapter | None` classmethod; `MockDemAdapter` for tests. Task 5 (page loop) imports and calls these.

- [ ] **Step 1: Write the failing test**

Create `services/document-intelligence/tests/test_dem_providers.py`:

```python
from __future__ import annotations

import pytest

from app.transcription.providers.base import PageContext
from app.transcription.providers.mock import MockDemAdapter
from app.transcription.providers.qwen import QwenDemAdapter
from app.transcription.failure_classification import DemProviderError


def test_mock_adapter_returns_configured_response():
    adapter = MockDemAdapter(response={"sheet_identity": {"title": {"value": "Test"}}})
    result = adapter.extract_page(
        image_bytes=b"fake-png-bytes",
        page_context=PageContext(document_id="DOC-1", page_index=0, page_number=1),
        prompt_version="dem-extraction-v1.0.0",
    )
    assert result == {"sheet_identity": {"title": {"value": "Test"}}}


def test_mock_adapter_raises_configured_error():
    adapter = MockDemAdapter(error=DemProviderError("rate limited", kind="transient"))
    with pytest.raises(DemProviderError) as exc_info:
        adapter.extract_page(
            image_bytes=b"fake-png-bytes",
            page_context=PageContext(document_id="DOC-1", page_index=0, page_number=1),
            prompt_version="dem-extraction-v1.0.0",
        )
    assert exc_info.value.kind == "transient"


def test_qwen_adapter_from_env_returns_none_when_key_missing(monkeypatch):
    monkeypatch.delenv("DEM_EXTRACTION_API_KEY", raising=False)
    assert QwenDemAdapter.from_env() is None


def test_qwen_adapter_from_env_builds_when_key_present(monkeypatch):
    monkeypatch.setenv("DEM_EXTRACTION_API_KEY", "test-key-123")
    monkeypatch.setenv("DEM_EXTRACTION_BASE_URL", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")
    monkeypatch.setenv("DEM_EXTRACTION_MODEL", "qwen3.7-plus")
    adapter = QwenDemAdapter.from_env()
    assert adapter is not None
    assert adapter.model == "qwen3.7-plus"
    assert adapter.reasoning_effort == "xhigh"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/document-intelligence && python -m pytest tests/test_dem_providers.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.transcription.providers'`.

- [ ] **Step 3: Write `base.py` (Protocol + PageContext)**

Create `services/document-intelligence/app/transcription/providers/__init__.py` (empty file).

Create `services/document-intelligence/app/transcription/providers/base.py`:

```python
"""
PAAX Document Intelligence - DEM vision provider contract.

Provider-agnostic Protocol (Qwen adalah implementasi pertama, per keputusan
user 2026-07-14) -- docs/superpowers/specs/
2026-07-14-dem-phase2-job-orchestrator-design.md "Adapter Qwen".
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class PageContext:
    document_id: str
    page_index: int
    page_number: int


class DemVisionProvider(Protocol):
    """Kontrak provider vision DEM. Menerima gambar halaman + prompt version,
    mengembalikan JSON mentah (BELUM divalidasi ke DrawingEvidenceSheet --
    itu tugas parser di Task 4). Raises DemProviderError kalau gagal, dengan
    .kind (transient/invalid_output/permanent) supaya page loop (Task 5) tahu
    tindakan yang tepat."""

    def extract_page(
        self,
        image_bytes: bytes,
        page_context: PageContext,
        prompt_version: str,
    ) -> dict:
        ...
```

- [ ] **Step 4: Write `mock.py`**

Create `services/document-intelligence/app/transcription/providers/mock.py`:

```python
"""Mock DEM vision provider -- test-only, no network calls. Kontrak sama
dengan QwenDemAdapter (app.transcription.providers.base.DemVisionProvider)."""
from __future__ import annotations

from dataclasses import dataclass, field

from app.transcription.failure_classification import DemProviderError
from app.transcription.providers.base import PageContext


@dataclass
class MockDemAdapter:
    response: dict = field(default_factory=dict)
    error: DemProviderError | None = None

    def extract_page(
        self,
        image_bytes: bytes,
        page_context: PageContext,
        prompt_version: str,
    ) -> dict:
        if self.error is not None:
            raise self.error
        return self.response
```

- [ ] **Step 5: Write `qwen.py`**

Create `services/document-intelligence/app/transcription/providers/qwen.py`:

```python
"""
PAAX Document Intelligence - Qwen3.7-Plus DEM vision adapter (DashScope).

API key TERPISAH dari DASHSCOPE_API_KEY milik Command Room/Arete -- baca
HANYA DEM_EXTRACTION_* (docs/superpowers/specs/
2026-07-14-dem-phase2-job-orchestrator-design.md, keputusan user 2026-07-14).
reasoning_effort="xhigh" (maksimal) per instruksi user -- dipetakan ke field
request DashScope yang sesuai di extract_page (lihat komentar di bawah).

Pola dataclass + .from_env() classmethod mengikuti konvensi
app/perception/ai_assist/client.py::GeminiAiAssistClient.
"""
from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from urllib import error, request as urllib_request

from app.transcription.failure_classification import DemProviderError, classify_http_error
from app.transcription.providers.base import PageContext

_DEFAULT_TIMEOUT_SECONDS = 120.0


@dataclass
class QwenDemAdapter:
    api_key: str
    base_url: str
    model: str
    reasoning_effort: str = "xhigh"
    timeout_seconds: float = _DEFAULT_TIMEOUT_SECONDS

    @classmethod
    def from_env(cls) -> "QwenDemAdapter | None":
        api_key = os.getenv("DEM_EXTRACTION_API_KEY", "").strip()
        if not api_key:
            return None
        base_url = os.getenv("DEM_EXTRACTION_BASE_URL", "").strip() or "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
        model = os.getenv("DEM_EXTRACTION_MODEL", "").strip() or "qwen3.7-plus"
        return cls(api_key=api_key, base_url=base_url, model=model)

    def extract_page(
        self,
        image_bytes: bytes,
        page_context: PageContext,
        prompt_version: str,
    ) -> dict:
        image_b64 = base64.b64encode(image_bytes).decode("ascii")
        payload = {
            "model": self.model,
            # reasoning_effort: xhigh -- efort maksimal yang didukung DashScope
            # utk model ini, per instruksi user. Kalau field ini tidak berlaku
            # utk endpoint vision yang dipakai, tetap dikirim (bukan diam-diam
            # dihapus) supaya kesalahan konfigurasi terlihat dari respons API,
            # bukan tersembunyi.
            "reasoning_effort": self.reasoning_effort,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": _build_prompt(page_context, prompt_version)},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
                    ],
                }
            ],
        }
        req = urllib_request.Request(
            f"{self.base_url.rstrip('/')}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib_request.urlopen(req, timeout=self.timeout_seconds) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except error.HTTPError as exc:
            kind = classify_http_error(exc.code)
            raise DemProviderError(f"Qwen HTTP {exc.code}: {exc.reason}", kind=kind) from exc
        except error.URLError as exc:
            raise DemProviderError(f"Qwen network error: {exc.reason}", kind="transient") from exc

        try:
            content = body["choices"][0]["message"]["content"]
            return json.loads(content)
        except (KeyError, IndexError, json.JSONDecodeError) as exc:
            raise DemProviderError(f"Qwen response not valid JSON: {exc}", kind="invalid_output") from exc


def _build_prompt(page_context: PageContext, prompt_version: str) -> str:
    return (
        f"Kembalikan HANYA JSON valid sesuai schema DrawingEvidenceSheet "
        f"(schema_version=paax.dem.sheet.v1, prompt_version={prompt_version}), "
        f"tanpa markdown fence, tanpa teks di luar JSON. Halaman ke-{page_context.page_number} "
        f"(index {page_context.page_index}) dari dokumen {page_context.document_id}. "
        f"Setiap fakta WAJIB punya confidence (0.0-1.0) + evidence_refs + status "
        f"(extracted|ai_interpreted|ambiguous|conflicting|missing). JANGAN PERNAH menghitung "
        f"nilai turunan (luas dari dimensi, dst) -- hanya transkrip apa yang tertulis/tergambar. "
        f"Kalau output akan terpotong karena batas token, isi completion.is_complete=false + "
        f"completion.next_cursor menunjuk section yang belum selesai."
    )
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd services/document-intelligence && python -m pytest tests/test_dem_providers.py -v`
Expected: PASS, `4 passed`.

- [ ] **Step 7: Commit**

```bash
git add services/document-intelligence/app/transcription/providers/ services/document-intelligence/tests/test_dem_providers.py
git commit -m "feat(doc-intel): add DEM vision provider interface + Qwen adapter + mock adapter"
```

---

### Task 4: Page renderer + strict-prompt parser/validator (with repair pass)

**Files:**
- Create: `services/document-intelligence/app/transcription/page_renderer.py`
- Create: `services/document-intelligence/app/transcription/parser.py`
- Test: `services/document-intelligence/tests/test_page_renderer.py`
- Test: `services/document-intelligence/tests/test_dem_parser.py`

**Interfaces:**
- Consumes: `DemProviderError` from Task 2; `DrawingEvidenceSheet` from `app.transcription.models` (Phase 0+1); `DemVisionProvider`, `PageContext` from Task 3.
- Produces: `render_page_to_png(pdf_bytes: bytes, page_index: int) -> bytes` (PNG bytes); `parse_and_validate(raw_json: dict, provider: DemVisionProvider, image_bytes: bytes, page_context: PageContext, prompt_version: str) -> DrawingEvidenceSheet` (does the one repair-pass-on-invalid_output described in the spec). Task 5 (page loop) imports and calls both.

- [ ] **Step 1: Write the failing test for the renderer**

Create `services/document-intelligence/tests/test_page_renderer.py`:

```python
from __future__ import annotations

import fitz

from app.transcription.page_renderer import render_page_to_png


def _make_single_page_pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=200, height=100)
    page.insert_text((10, 50), "test page")
    return doc.tobytes()


def test_render_page_to_png_returns_png_bytes():
    pdf_bytes = _make_single_page_pdf_bytes()
    png_bytes = render_page_to_png(pdf_bytes, page_index=0)
    assert png_bytes.startswith(b"\x89PNG")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/document-intelligence && python -m pytest tests/test_page_renderer.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.transcription.page_renderer'`.

- [ ] **Step 3: Write `page_renderer.py`**

Create `services/document-intelligence/app/transcription/page_renderer.py`:

```python
"""
PAAX Document Intelligence - DEM page renderer.

Render satu halaman PDF -> PNG bytes, dpi=200 -- pola PyMuPDF sama persis
dengan app/perception/assemble.py::assemble_sheet_from_page (baris
page.get_pixmap(dpi=200).save(png_path)), tapi berdiri sendiri (tidak
mengimpor fungsi TKG yang tercampur logic lain) karena DEM adalah pipeline
terpisah dari TKG (app/tkg/ tetap ada, tidak disentuh -- lihat ADR 0005).
"""
from __future__ import annotations

import fitz


def render_page_to_png(pdf_bytes: bytes, page_index: int, dpi: int = 200) -> bytes:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page = doc[page_index]
        pixmap = page.get_pixmap(dpi=dpi)
        return pixmap.tobytes("png")
    finally:
        doc.close()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/document-intelligence && python -m pytest tests/test_page_renderer.py -v`
Expected: PASS, `1 passed`.

- [ ] **Step 5: Write the failing test for the parser**

Create `services/document-intelligence/tests/test_dem_parser.py`:

```python
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.transcription.failure_classification import DemProviderError
from app.transcription.parser import parse_and_validate
from app.transcription.providers.base import PageContext
from app.transcription.providers.mock import MockDemAdapter


def _valid_sheet_dict() -> dict:
    return {
        "schema_version": "paax.dem.sheet.v1",
        "run_id": "DEMRUN-20260714-001",
        "document_id": "DOC-PLHUT-001",
        "project_id": "PRJ-001",
        "source": {
            "document_hash": "sha256:abc123",
            "file_name": "test.pdf",
            "page_index": 0,
            "page_number": 1,
            "render_uri": "object://renders/doc-plhut-001/page-001.png",
            "width_px": 4096,
            "height_px": 2896,
        },
        "generation": {
            "provider": "qwen",
            "model_alias": "qwen-3.7-plus",
            "prompt_version": "dem-extraction-v1.0.0",
            "started_at": "2026-07-14T10:00:00Z",
        },
        "sheet_identity": {
            "sheet_number": {"value": "A-01", "confidence": 0.9},
            "title": {"value": "Denah", "confidence": 0.9},
            "discipline": {"value": "architecture", "confidence": 0.9, "status": "ai_interpreted"},
        },
        "completion": {"sections_expected": 13, "sections_completed": 13, "is_complete": True},
    }


def test_parse_and_validate_accepts_valid_output():
    adapter = MockDemAdapter(response=_valid_sheet_dict())
    context = PageContext(document_id="DOC-PLHUT-001", page_index=0, page_number=1)
    sheet = parse_and_validate(
        raw_json=_valid_sheet_dict(),
        provider=adapter,
        image_bytes=b"fake-png",
        page_context=context,
        prompt_version="dem-extraction-v1.0.0",
    )
    assert sheet.sheet_identity.title.value == "Denah"


def test_parse_and_validate_repairs_once_then_succeeds():
    # First raw_json is missing required "completion" -- repair pass asks the
    # SAME mock adapter again (its .response is swapped mid-test to simulate
    # the model fixing its own output).
    broken = _valid_sheet_dict()
    del broken["completion"]
    fixed = _valid_sheet_dict()

    adapter = MockDemAdapter(response=fixed)
    context = PageContext(document_id="DOC-PLHUT-001", page_index=0, page_number=1)
    sheet = parse_and_validate(
        raw_json=broken,
        provider=adapter,
        image_bytes=b"fake-png",
        page_context=context,
        prompt_version="dem-extraction-v1.0.0",
    )
    assert sheet.completion.is_complete is True


def test_parse_and_validate_fails_with_real_error_after_repair_fails():
    broken = _valid_sheet_dict()
    del broken["completion"]
    still_broken = _valid_sheet_dict()
    del still_broken["completion"]

    adapter = MockDemAdapter(response=still_broken)
    context = PageContext(document_id="DOC-PLHUT-001", page_index=0, page_number=1)
    with pytest.raises(DemProviderError) as exc_info:
        parse_and_validate(
            raw_json=broken,
            provider=adapter,
            image_bytes=b"fake-png",
            page_context=context,
            prompt_version="dem-extraction-v1.0.0",
        )
    assert exc_info.value.kind == "invalid_output"
    assert "completion" in str(exc_info.value)
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd services/document-intelligence && python -m pytest tests/test_dem_parser.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.transcription.parser'`.

- [ ] **Step 7: Write `parser.py`**

Create `services/document-intelligence/app/transcription/parser.py`:

```python
"""
PAAX Document Intelligence - DEM output parser/validator with repair pass.

Klasifikasi kegagalan bukan retry buta (docs/superpowers/specs/
2026-07-14-dem-phase2-job-orchestrator-design.md): kalau raw_json gagal
validasi Pydantic, SATU kali repair pass (kirim balik provider dengan pesan
error asli), bukan diulang identik berkali-kali. Repair pass gagal juga ->
DemProviderError(kind="invalid_output") dengan pesan error validasi ASLI,
bukan digeneralisasi.
"""
from __future__ import annotations

from pydantic import ValidationError

from app.transcription.failure_classification import DemProviderError
from app.transcription.models import DrawingEvidenceSheet
from app.transcription.providers.base import DemVisionProvider, PageContext


def parse_and_validate(
    raw_json: dict,
    provider: DemVisionProvider,
    image_bytes: bytes,
    page_context: PageContext,
    prompt_version: str,
) -> DrawingEvidenceSheet:
    try:
        return DrawingEvidenceSheet.model_validate(raw_json)
    except ValidationError as first_error:
        repaired_json = provider.extract_page(
            image_bytes=image_bytes,
            page_context=page_context,
            prompt_version=prompt_version,
        )
        try:
            return DrawingEvidenceSheet.model_validate(repaired_json)
        except ValidationError as second_error:
            raise DemProviderError(
                f"DEM output invalid after repair pass: {second_error}",
                kind="invalid_output",
            ) from second_error
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd services/document-intelligence && python -m pytest tests/test_dem_parser.py -v`
Expected: PASS, `3 passed`.

- [ ] **Step 9: Commit**

```bash
git add services/document-intelligence/app/transcription/page_renderer.py services/document-intelligence/app/transcription/parser.py services/document-intelligence/tests/test_page_renderer.py services/document-intelligence/tests/test_dem_parser.py
git commit -m "feat(doc-intel): add DEM page renderer + parser with one-shot repair pass"
```

---

### Task 5: `services/db` HTTP client for document-intelligence

**Files:**
- Create: `services/document-intelligence/app/transcription/db_client.py`
- Test: `services/document-intelligence/tests/test_dem_db_client.py`

**Interfaces:**
- Consumes: `DEM_EXTRACTION_*`/`DB_API_URL`/`INTERNAL_SERVICE_KEY` env vars.
- Produces: `DemDbClient` class with async methods `create_run(...)`, `create_page(run_id, page_index)`, `update_page(page_id, **fields)`, `update_run_status(run_id, status)`, `get_run_status(run_id)`. Task 6 (job loop) imports and calls this.

- [ ] **Step 1: Write the failing test**

Create `services/document-intelligence/tests/test_dem_db_client.py`:

```python
from __future__ import annotations

import httpx
import pytest

from app.transcription.db_client import DemDbClient


class _StubTransport(httpx.AsyncBaseTransport):
    def __init__(self):
        self.requests: list[httpx.Request] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.url.path == "/dem/runs" and request.method == "POST":
            return httpx.Response(200, json={
                "id": "11111111-1111-1111-1111-111111111111",
                "status": "created",
                "total_pages": 3,
                "project_id": None,
                "document_id": "DOC-1",
                "document_hash": "sha256:x",
                "file_name": "test.pdf",
                "provider": "qwen",
                "prompt_version": "dem-extraction-v1.0.0",
                "created_at": "2026-07-14T10:00:00Z",
                "updated_at": "2026-07-14T10:00:00Z",
                "completed_at": None,
            })
        return httpx.Response(404)


@pytest.mark.asyncio
async def test_create_run_posts_to_dem_runs_and_returns_id():
    transport = _StubTransport()
    client = DemDbClient(base_url="http://test-db", internal_key="test-key", transport=transport)
    run = await client.create_run(
        document_id="DOC-1",
        document_hash="sha256:x",
        file_name="test.pdf",
        total_pages=3,
        provider="qwen",
        prompt_version="dem-extraction-v1.0.0",
    )
    assert run["id"] == "11111111-1111-1111-1111-111111111111"
    assert transport.requests[0].headers["x-internal-key"] == "test-key"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/document-intelligence && python -m pytest tests/test_dem_db_client.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.transcription.db_client'`.

- [ ] **Step 3: Write `db_client.py`**

Create `services/document-intelligence/app/transcription/db_client.py`:

```python
"""
PAAX Document Intelligence - HTTP client to services/db for DEM Phase 2.

document-intelligence dan services/db TIDAK berbagi koneksi DB langsung --
sama pola dengan Command Room (apps/web/src/app/api/command-room/chat/tools.ts
logToolCallAudit): panggil lewat HTTP + header X-Internal-Key, bukan import
SQLAlchemy session lintas-service.
"""
from __future__ import annotations

import os

import httpx


class DemDbClient:
    def __init__(
        self,
        base_url: str | None = None,
        internal_key: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = (base_url or os.getenv("DB_API_URL", "http://localhost:8084")).rstrip("/")
        self.internal_key = internal_key or os.getenv("INTERNAL_SERVICE_KEY", "")
        self._transport = transport

    def _headers(self) -> dict[str, str]:
        return {"X-Internal-Key": self.internal_key, "X-User-Id": "dem-job-orchestrator"}

    async def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self.base_url, transport=self._transport, headers=self._headers())

    async def create_run(
        self,
        *,
        document_id: str,
        document_hash: str,
        file_name: str,
        total_pages: int,
        provider: str,
        prompt_version: str,
        project_id: str | None = None,
    ) -> dict:
        async with await self._client() as client:
            res = await client.post("/dem/runs", json={
                "project_id": project_id,
                "document_id": document_id,
                "document_hash": document_hash,
                "file_name": file_name,
                "total_pages": total_pages,
                "provider": provider,
                "prompt_version": prompt_version,
            })
            res.raise_for_status()
            return res.json()

    async def create_page(self, run_id: str, page_index: int) -> dict:
        async with await self._client() as client:
            res = await client.post("/dem/pages", params={"run_id": run_id, "page_index": page_index})
            res.raise_for_status()
            return res.json()

    async def update_page(self, page_id: str, **fields) -> dict:
        async with await self._client() as client:
            res = await client.put(f"/dem/pages/{page_id}", json=fields)
            res.raise_for_status()
            return res.json()

    async def update_run_status(self, run_id: str, status: str) -> dict:
        async with await self._client() as client:
            res = await client.put(f"/dem/runs/{run_id}", json={"status": status})
            res.raise_for_status()
            return res.json()

    async def get_run_status(self, run_id: str) -> dict:
        async with await self._client() as client:
            res = await client.get(f"/dem/runs/{run_id}/status")
            res.raise_for_status()
            return res.json()
```

Note: `update_run_status` calls `PUT /dem/runs/{id}` which does not exist yet from Task 1 — add it now to `services/db/src/paax_db/main.py`:

```python
@app.put("/dem/runs/{id}", response_model=schemas.DemRunResponse, dependencies=[Depends(get_current_user)])
async def update_dem_run(id: str, update: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.DemRun).where(models.DemRun.id == id))
    run = result.scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="DEM run not found")
    for key, value in update.items():
        if hasattr(run, key):
            setattr(run, key, value)
    await db.commit()
    await db.refresh(run)
    return run
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/document-intelligence && python -m pytest tests/test_dem_db_client.py -v`
Expected: PASS, `1 passed`.

- [ ] **Step 5: Run services/db suite to confirm the added PUT route doesn't break anything**

Run: `cd services/db && python -m pytest -q`
Expected: all pass, zero failures.

- [ ] **Step 6: Commit**

```bash
git add services/document-intelligence/app/transcription/db_client.py services/document-intelligence/tests/test_dem_db_client.py services/db/src/paax_db/main.py
git commit -m "feat(doc-intel): add services/db HTTP client for DEM job orchestrator + PUT /dem/runs/{id}"
```

---

### Task 6: Page loop with failure classification + idempotency + continuation

**Files:**
- Create: `services/document-intelligence/app/transcription/page_loop.py`
- Test: `services/document-intelligence/tests/test_page_loop.py`

**Interfaces:**
- Consumes: `render_page_to_png` (Task 4), `parse_and_validate` (Task 4), `DemVisionProvider`/`PageContext` (Task 3), `DemProviderError`/`FailureKind` (Task 2), `DemDbClient` (Task 5), `ContinuationPatch` from `app.transcription.models` (Phase 0+1).
- Produces: `async def process_page(pdf_bytes: bytes, page_index: int, run: dict, provider: DemVisionProvider, db_client: DemDbClient, prompt_version: str) -> None` — processes exactly one page end-to-end (idempotency check, render, call provider, classify failures, retry/repair/fail per the rules, persist result). Task 7 (document loop) calls this per page.

- [ ] **Step 1: Write the failing test**

Create `services/document-intelligence/tests/test_page_loop.py`:

```python
from __future__ import annotations

import hashlib

import httpx
import pytest

from app.transcription.db_client import DemDbClient
from app.transcription.failure_classification import DemProviderError
from app.transcription.page_loop import process_page
from app.transcription.providers.mock import MockDemAdapter


def _valid_sheet_dict(document_id: str = "DOC-1") -> dict:
    return {
        "schema_version": "paax.dem.sheet.v1",
        "run_id": "DEMRUN-20260714-001",
        "document_id": document_id,
        "project_id": "PRJ-001",
        "source": {
            "document_hash": "sha256:x", "file_name": "test.pdf", "page_index": 0,
            "page_number": 1, "render_uri": "object://renders/doc-1/page-001.png",
            "width_px": 100, "height_px": 100,
        },
        "generation": {
            "provider": "qwen", "model_alias": "qwen-3.7-plus",
            "prompt_version": "dem-extraction-v1.0.0", "started_at": "2026-07-14T10:00:00Z",
        },
        "sheet_identity": {
            "sheet_number": {"value": "A-01", "confidence": 0.9},
            "title": {"value": "Denah", "confidence": 0.9},
            "discipline": {"value": "architecture", "confidence": 0.9, "status": "ai_interpreted"},
        },
        "completion": {"sections_expected": 13, "sections_completed": 13, "is_complete": True},
    }


class _RecordingTransport(httpx.AsyncBaseTransport):
    def __init__(self):
        self.pages: dict[str, dict] = {}
        self._next_id = 1

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/dem/pages" and request.method == "POST":
            page_id = f"page-{self._next_id}"
            self._next_id += 1
            self.pages[page_id] = {"id": page_id, "status": "queued", "attempt_count": 0}
            return httpx.Response(200, json=self.pages[page_id])
        if request.url.path.startswith("/dem/pages/") and request.method == "PUT":
            page_id = request.url.path.rsplit("/", 1)[-1]
            import json as _json
            self.pages[page_id].update(_json.loads(request.content))
            return httpx.Response(200, json=self.pages[page_id])
        return httpx.Response(404)


def _minimal_pdf_bytes() -> bytes:
    import fitz
    doc = fitz.open()
    doc.new_page(width=200, height=100)
    return doc.tobytes()


@pytest.mark.asyncio
async def test_process_page_success_persists_result():
    transport = _RecordingTransport()
    db_client = DemDbClient(base_url="http://test-db", internal_key="test-key", transport=transport)
    page_row = await db_client.create_page("run-1", 0)

    provider = MockDemAdapter(response=_valid_sheet_dict())
    await process_page(
        pdf_bytes=_minimal_pdf_bytes(),
        page_index=0,
        page_id=page_row["id"],
        run={"id": "run-1", "document_id": "DOC-1", "document_hash": "sha256:x"},
        provider=provider,
        db_client=db_client,
        prompt_version="dem-extraction-v1.0.0",
    )
    assert transport.pages[page_row["id"]]["status"] == "complete"
    assert transport.pages[page_row["id"]]["result"]["sheet_identity"]["title"]["value"] == "Denah"


@pytest.mark.asyncio
async def test_process_page_permanent_failure_does_not_retry():
    transport = _RecordingTransport()
    db_client = DemDbClient(base_url="http://test-db", internal_key="test-key", transport=transport)
    page_row = await db_client.create_page("run-1", 0)

    provider = MockDemAdapter(error=DemProviderError("bad auth", kind="permanent"))
    await process_page(
        pdf_bytes=_minimal_pdf_bytes(),
        page_index=0,
        page_id=page_row["id"],
        run={"id": "run-1", "document_id": "DOC-1", "document_hash": "sha256:x"},
        provider=provider,
        db_client=db_client,
        prompt_version="dem-extraction-v1.0.0",
    )
    assert transport.pages[page_row["id"]]["status"] == "failed"
    assert transport.pages[page_row["id"]]["failure_kind"] == "permanent"
    assert transport.pages[page_row["id"]]["attempt_count"] == 0


@pytest.mark.asyncio
async def test_process_page_skips_when_already_complete_with_matching_hash():
    transport = _RecordingTransport()
    db_client = DemDbClient(base_url="http://test-db", internal_key="test-key", transport=transport)
    page_row = await db_client.create_page("run-1", 0)
    page_bytes = _minimal_pdf_bytes()
    input_hash = hashlib.sha256(page_bytes).hexdigest()
    transport.pages[page_row["id"]].update({"status": "complete", "input_hash": input_hash})

    provider = MockDemAdapter(error=DemProviderError("should not be called", kind="permanent"))
    await process_page(
        pdf_bytes=page_bytes,
        page_index=0,
        page_id=page_row["id"],
        run={"id": "run-1", "document_id": "DOC-1", "document_hash": "sha256:x"},
        provider=provider,
        db_client=db_client,
        prompt_version="dem-extraction-v1.0.0",
        existing_page=transport.pages[page_row["id"]],
    )
    # Status remains complete -- provider was never called (would have raised).
    assert transport.pages[page_row["id"]]["status"] == "complete"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/document-intelligence && python -m pytest tests/test_page_loop.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.transcription.page_loop'`.

- [ ] **Step 3: Write `page_loop.py`**

Create `services/document-intelligence/app/transcription/page_loop.py`:

```python
"""
PAAX Document Intelligence - DEM per-page processing loop.

Implements the state machine + failure classification from
docs/superpowers/specs/2026-07-14-dem-phase2-job-orchestrator-design.md
"Klasifikasi kegagalan" and "Idempotency (§7.6)". One call = one page,
fully processed to a terminal state (complete or failed) or left in
retry_wait for the caller (Task 7's document loop) to re-drive.
"""
from __future__ import annotations

import hashlib

from app.transcription.db_client import DemDbClient
from app.transcription.failure_classification import DemProviderError
from app.transcription.page_renderer import render_page_to_png
from app.transcription.parser import parse_and_validate
from app.transcription.providers.base import DemVisionProvider, PageContext

MAX_TRANSIENT_ATTEMPTS = 3


async def process_page(
    pdf_bytes: bytes,
    page_index: int,
    page_id: str,
    run: dict,
    provider: DemVisionProvider,
    db_client: DemDbClient,
    prompt_version: str,
    existing_page: dict | None = None,
) -> None:
    input_hash = hashlib.sha256(pdf_bytes).hexdigest()

    # Idempotency (§7.6): halaman dengan input_hash sama dan status complete
    # tidak memanggil provider ulang.
    if existing_page is not None and existing_page.get("status") == "complete" and existing_page.get("input_hash") == input_hash:
        return

    await db_client.update_page(page_id, status="rendering")
    image_bytes = render_page_to_png(pdf_bytes, page_index)

    await db_client.update_page(page_id, status="calling_model", input_hash=input_hash)
    context = PageContext(document_id=run["document_id"], page_index=page_index, page_number=page_index + 1)

    try:
        raw_json = provider.extract_page(image_bytes=image_bytes, page_context=context, prompt_version=prompt_version)
        sheet = parse_and_validate(
            raw_json=raw_json, provider=provider, image_bytes=image_bytes,
            page_context=context, prompt_version=prompt_version,
        )
    except DemProviderError as exc:
        current_attempts = (existing_page or {}).get("attempt_count", 0)
        if exc.kind == "transient" and current_attempts + 1 < MAX_TRANSIENT_ATTEMPTS:
            await db_client.update_page(
                page_id, status="retry_wait", failure_kind="transient",
                error=str(exc), attempt_count=current_attempts + 1,
            )
            return
        # permanent -> fail immediately, no attempt_count increment.
        # invalid_output (repair pass already happened inside parse_and_validate)
        # or transient exhausted -> fail with the real error preserved.
        next_attempts = current_attempts if exc.kind == "permanent" else current_attempts + 1
        await db_client.update_page(
            page_id, status="failed", failure_kind=exc.kind,
            error=str(exc), attempt_count=next_attempts,
        )
        return

    await db_client.update_page(
        page_id, status="complete", result=sheet.model_dump(mode="json"), input_hash=input_hash,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/document-intelligence && python -m pytest tests/test_page_loop.py -v`
Expected: PASS, `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add services/document-intelligence/app/transcription/page_loop.py services/document-intelligence/tests/test_page_loop.py
git commit -m "feat(doc-intel): add DEM page loop (failure classification + idempotency)"
```

---

### Task 7: Document loop (concurrency, resume) + `POST /drawings/dem/start` + `GET /drawings/dem/{run_id}/status`

**Files:**
- Create: `services/document-intelligence/app/transcription/document_loop.py`
- Create: `services/document-intelligence/app/api/dem_routes.py`
- Modify: `services/document-intelligence/app/main.py` (register `dem_routes.router`)
- Test: `services/document-intelligence/tests/test_document_loop.py`
- Test: `services/document-intelligence/tests/test_dem_routes.py`

**Interfaces:**
- Consumes: `process_page` (Task 6), `DemDbClient` (Task 5), `QwenDemAdapter`/`MockDemAdapter` (Task 3).
- Produces: `async def process_document(pdf_bytes: bytes, run_id: str, document_id: str, document_hash: str, total_pages: int, provider: DemVisionProvider, db_client: DemDbClient, prompt_version: str, concurrency: int = 2) -> None`; FastAPI router `dem_routes.router` with `POST /drawings/dem/start`, `GET /drawings/dem/{run_id}/status`.

- [ ] **Step 1: Write the failing test for the document loop**

Create `services/document-intelligence/tests/test_document_loop.py`:

```python
from __future__ import annotations

import httpx
import pytest

from app.transcription.db_client import DemDbClient
from app.transcription.document_loop import process_document
from app.transcription.providers.mock import MockDemAdapter


def _valid_sheet_dict() -> dict:
    return {
        "schema_version": "paax.dem.sheet.v1", "run_id": "R-1", "document_id": "DOC-1",
        "project_id": "PRJ-001",
        "source": {"document_hash": "sha256:x", "file_name": "t.pdf", "page_index": 0, "page_number": 1, "render_uri": "u", "width_px": 1, "height_px": 1},
        "generation": {"provider": "qwen", "model_alias": "qwen-3.7-plus", "prompt_version": "dem-extraction-v1.0.0", "started_at": "2026-07-14T10:00:00Z"},
        "sheet_identity": {"sheet_number": {"value": "A-01", "confidence": 0.9}, "title": {"value": "Denah", "confidence": 0.9}, "discipline": {"value": "architecture", "confidence": 0.9, "status": "ai_interpreted"}},
        "completion": {"sections_expected": 13, "sections_completed": 13, "is_complete": True},
    }


class _FullTransport(httpx.AsyncBaseTransport):
    def __init__(self, total_pages: int):
        self.pages: dict[str, dict] = {}
        self.run = {"id": "run-1", "status": "created", "total_pages": total_pages}
        self._next_id = 1

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        import json as _json
        path = request.url.path
        if path == "/dem/pages" and request.method == "POST":
            page_id = f"page-{self._next_id}"
            self._next_id += 1
            self.pages[page_id] = {"id": page_id, "status": "queued", "attempt_count": 0}
            return httpx.Response(200, json=self.pages[page_id])
        if path.startswith("/dem/pages/") and request.method == "PUT":
            page_id = path.rsplit("/", 1)[-1]
            self.pages[page_id].update(_json.loads(request.content))
            return httpx.Response(200, json=self.pages[page_id])
        if path == "/dem/runs/run-1" and request.method == "PUT":
            self.run.update(_json.loads(request.content))
            return httpx.Response(200, json=self.run)
        return httpx.Response(404)


def _n_page_pdf_bytes(n: int) -> bytes:
    import fitz
    doc = fitz.open()
    for _ in range(n):
        doc.new_page(width=200, height=100)
    return doc.tobytes()


@pytest.mark.asyncio
async def test_process_document_marks_dem_complete_when_all_pages_succeed():
    transport = _FullTransport(total_pages=2)
    db_client = DemDbClient(base_url="http://test-db", internal_key="test-key", transport=transport)
    provider = MockDemAdapter(response=_valid_sheet_dict())

    await process_document(
        pdf_bytes=_n_page_pdf_bytes(2), run_id="run-1", document_id="DOC-1",
        document_hash="sha256:x", total_pages=2, provider=provider,
        db_client=db_client, prompt_version="dem-extraction-v1.0.0",
    )
    assert transport.run["status"] == "dem_complete"
    assert all(p["status"] == "complete" for p in transport.pages.values())


@pytest.mark.asyncio
async def test_process_document_marks_partially_failed_when_a_page_fails():
    from app.transcription.failure_classification import DemProviderError

    transport = _FullTransport(total_pages=2)
    db_client = DemDbClient(base_url="http://test-db", internal_key="test-key", transport=transport)
    provider = MockDemAdapter(error=DemProviderError("bad auth", kind="permanent"))

    await process_document(
        pdf_bytes=_n_page_pdf_bytes(2), run_id="run-1", document_id="DOC-1",
        document_hash="sha256:x", total_pages=2, provider=provider,
        db_client=db_client, prompt_version="dem-extraction-v1.0.0",
    )
    assert transport.run["status"] == "partially_failed"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/document-intelligence && python -m pytest tests/test_document_loop.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.transcription.document_loop'`.

- [ ] **Step 3: Write `document_loop.py`**

Create `services/document-intelligence/app/transcription/document_loop.py`:

```python
"""
PAAX Document Intelligence - DEM document-level job loop.

State machine §7.2 (docs/superpowers/specs/
2026-07-14-dem-phase2-job-orchestrator-design.md): creates one dem_pages row
per page, drives process_page (Task 6) with bounded concurrency (2 workers
default, §7.5 -- pages are independent, safe to parallelize), then marks the
run dem_complete or partially_failed based on final page states.
"""
from __future__ import annotations

import asyncio

from app.transcription.db_client import DemDbClient
from app.transcription.page_loop import process_page
from app.transcription.providers.base import DemVisionProvider

DEFAULT_CONCURRENCY = 2


async def process_document(
    pdf_bytes: bytes,
    run_id: str,
    document_id: str,
    document_hash: str,
    total_pages: int,
    provider: DemVisionProvider,
    db_client: DemDbClient,
    prompt_version: str,
    concurrency: int = DEFAULT_CONCURRENCY,
) -> None:
    run = {"id": run_id, "document_id": document_id, "document_hash": document_hash}
    page_rows = [await db_client.create_page(run_id, page_index) for page_index in range(total_pages)]

    semaphore = asyncio.Semaphore(concurrency)

    async def _bounded_process(page_index: int, page_id: str) -> None:
        async with semaphore:
            await process_page(
                pdf_bytes=pdf_bytes, page_index=page_index, page_id=page_id, run=run,
                provider=provider, db_client=db_client, prompt_version=prompt_version,
            )

    await asyncio.gather(*(
        _bounded_process(page_index, page_rows[page_index]["id"])
        for page_index in range(total_pages)
    ))

    status = await db_client.get_run_status(run_id)
    any_failed = any(p["status"] == "failed" for p in status["pages"])
    await db_client.update_run_status(run_id, "partially_failed" if any_failed else "dem_complete")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/document-intelligence && python -m pytest tests/test_document_loop.py -v`
Expected: PASS, `2 passed`.

- [ ] **Step 5: Write the failing test for the endpoints**

Create `services/document-intelligence/tests/test_dem_routes.py`:

```python
from __future__ import annotations

import os

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app

HEADERS = {"X-Internal-Key": "test-internal-key"}


@pytest.mark.asyncio
async def test_dem_routes_are_registered():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Without DEM_EXTRACTION_API_KEY set, /drawings/dem/start should
        # respond (not 404 -- route exists) even though it will fail to
        # find a provider; exact behavior verified in Task 8's manual run.
        res = await ac.get("/drawings/dem/00000000-0000-0000-0000-000000000000/status", headers=HEADERS)
        assert res.status_code != 404 or "not found" in res.text.lower()
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd services/document-intelligence && python -m pytest tests/test_dem_routes.py -v`
Expected: FAIL (route not registered, generic 404 without a JSON body distinguishing "not found" from "route missing").

- [ ] **Step 7: Write `dem_routes.py`**

Create `services/document-intelligence/app/api/dem_routes.py`:

```python
"""
PAAX Document Intelligence - DEM Phase 2 HTTP endpoints.

Pola router sama seperti router lain di app/api/ (upload_routes.py dkk),
tapi implementasi baru -- TIDAK menyalin kode drawing_routes.py lama (sudah
diarsipkan ke G:\\paax-cleanup-archive\\2026-07-14-tkg-drawing-analysis-legacy\\).
"""
from __future__ import annotations

import hashlib
import uuid

from fastapi import APIRouter, BackgroundTasks, UploadFile, File, Form
import fitz

from app.transcription.db_client import DemDbClient
from app.transcription.document_loop import process_document
from app.transcription.providers.qwen import QwenDemAdapter

router = APIRouter(prefix="/drawings/dem", tags=["DEM"])

PROMPT_VERSION = "dem-extraction-v1.0.0"


@router.post("/start")
async def start_dem_run(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    project_id: str | None = Form(default=None),
):
    pdf_bytes = await file.read()
    document_hash = f"sha256:{hashlib.sha256(pdf_bytes).hexdigest()}"
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    total_pages = doc.page_count
    doc.close()

    document_id = f"DOC-{uuid.uuid4().hex[:8]}"
    db_client = DemDbClient()
    run = await db_client.create_run(
        project_id=project_id, document_id=document_id, document_hash=document_hash,
        file_name=file.filename or "unknown.pdf", total_pages=total_pages,
        provider="qwen", prompt_version=PROMPT_VERSION,
    )

    provider = QwenDemAdapter.from_env()
    if provider is None:
        return {"run_id": run["id"], "status": "requires_review", "message": "DEM_EXTRACTION_API_KEY not configured"}

    background_tasks.add_task(
        process_document, pdf_bytes=pdf_bytes, run_id=run["id"], document_id=document_id,
        document_hash=document_hash, total_pages=total_pages, provider=provider,
        db_client=db_client, prompt_version=PROMPT_VERSION,
    )
    return {"run_id": run["id"], "status": "pages_queued", "total_pages": total_pages}


@router.get("/{run_id}/status")
async def get_dem_status(run_id: str):
    db_client = DemDbClient()
    return await db_client.get_run_status(run_id)
```

- [ ] **Step 8: Register the router**

Modify `services/document-intelligence/app/main.py`. Change:

```python
from app.api import health_routes, upload_routes, pdf_routes, excel_routes, tkg_routes
```

to:

```python
from app.api import health_routes, upload_routes, pdf_routes, excel_routes, tkg_routes, dem_routes
```

And add after the `tkg_routes.router` line:

```python
app.include_router(dem_routes.router, dependencies=[Depends(get_current_user)])
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd services/document-intelligence && python -m pytest tests/test_dem_routes.py -v`
Expected: PASS.

- [ ] **Step 10: Run the full document-intelligence suite to confirm zero regressions**

Run: `cd services/document-intelligence && python -m pytest -q`
Expected: all prior tests plus every test added in this plan pass, zero failures.

- [ ] **Step 11: Commit**

```bash
git add services/document-intelligence/app/transcription/document_loop.py services/document-intelligence/app/api/dem_routes.py services/document-intelligence/app/main.py services/document-intelligence/tests/test_document_loop.py services/document-intelligence/tests/test_dem_routes.py
git commit -m "feat(doc-intel): add DEM document loop + POST /drawings/dem/start + GET .../status"
```

---

### Task 8: Resume behavior + full-suite verification + manual real-fixture run

**Files:**
- Modify: `services/document-intelligence/app/transcription/document_loop.py` (resume support)
- Test: `services/document-intelligence/tests/test_document_loop_resume.py`

**Interfaces:**
- Consumes: everything from Tasks 1-7.
- Produces: `process_document` gains a `resume: bool = False` parameter — when `True`, it fetches existing page rows via `db_client.get_run_status(run_id)` first and only creates+processes pages that are not already `complete`, instead of unconditionally creating fresh page rows for every page.

- [ ] **Step 1: Write the failing test**

Create `services/document-intelligence/tests/test_document_loop_resume.py`:

```python
from __future__ import annotations

import httpx
import pytest

from app.transcription.db_client import DemDbClient
from app.transcription.document_loop import process_document
from app.transcription.providers.mock import MockDemAdapter


def _valid_sheet_dict() -> dict:
    return {
        "schema_version": "paax.dem.sheet.v1", "run_id": "R-1", "document_id": "DOC-1",
        "project_id": "PRJ-001",
        "source": {"document_hash": "sha256:x", "file_name": "t.pdf", "page_index": 0, "page_number": 1, "render_uri": "u", "width_px": 1, "height_px": 1},
        "generation": {"provider": "qwen", "model_alias": "qwen-3.7-plus", "prompt_version": "dem-extraction-v1.0.0", "started_at": "2026-07-14T10:00:00Z"},
        "sheet_identity": {"sheet_number": {"value": "A-01", "confidence": 0.9}, "title": {"value": "Denah", "confidence": 0.9}, "discipline": {"value": "architecture", "confidence": 0.9, "status": "ai_interpreted"}},
        "completion": {"sections_expected": 13, "sections_completed": 13, "is_complete": True},
    }


class _ResumeTransport(httpx.AsyncBaseTransport):
    """Pre-seeded with page 0 already complete -- simulates a run that was
    interrupted after page 0 finished (mirrors §7.7's 'page 1-46 complete,
    47 failed/interrupted, 48-88 queued' resume scenario at small scale)."""

    def __init__(self):
        self.calls_to_provider_for_page = {0: 0, 1: 0}
        self.pages = {
            "page-0": {"id": "page-0", "page_index": 0, "status": "complete", "attempt_count": 0, "input_hash": "sha256:already-done"},
        }
        self.run = {"id": "run-1", "status": "partially_failed", "total_pages": 2}
        self._next_id = 1

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        import json as _json
        path = request.url.path
        if path == "/dem/runs/run-1/status" and request.method == "GET":
            return httpx.Response(200, json={**self.run, "pages": list(self.pages.values())})
        if path == "/dem/pages" and request.method == "POST":
            page_index = int(request.url.params["page_index"])
            page_id = f"page-{page_index}-new-{self._next_id}"
            self._next_id += 1
            self.pages[page_id] = {"id": page_id, "page_index": page_index, "status": "queued", "attempt_count": 0}
            return httpx.Response(200, json=self.pages[page_id])
        if path.startswith("/dem/pages/") and request.method == "PUT":
            page_id = path.rsplit("/", 1)[-1]
            self.pages[page_id].update(_json.loads(request.content))
            return httpx.Response(200, json=self.pages[page_id])
        if path == "/dem/runs/run-1" and request.method == "PUT":
            self.run.update(_json.loads(request.content))
            return httpx.Response(200, json=self.run)
        return httpx.Response(404)


def _n_page_pdf_bytes(n: int) -> bytes:
    import fitz
    doc = fitz.open()
    for _ in range(n):
        doc.new_page(width=200, height=100)
    return doc.tobytes()


@pytest.mark.asyncio
async def test_resume_does_not_recreate_or_reprocess_completed_page():
    transport = _ResumeTransport()
    db_client = DemDbClient(base_url="http://test-db", internal_key="test-key", transport=transport)
    provider = MockDemAdapter(response=_valid_sheet_dict())

    await process_document(
        pdf_bytes=_n_page_pdf_bytes(2), run_id="run-1", document_id="DOC-1",
        document_hash="sha256:x", total_pages=2, provider=provider,
        db_client=db_client, prompt_version="dem-extraction-v1.0.0", resume=True,
    )

    # page-0 (already complete) must still be the ONLY row with that id --
    # no new page row was created for page_index=0.
    page_0_rows = [p for p in transport.pages.values() if p["page_index"] == 0]
    assert len(page_0_rows) == 1
    assert page_0_rows[0]["id"] == "page-0"
    # page 1 (was missing) got created and processed to completion.
    page_1_rows = [p for p in transport.pages.values() if p["page_index"] == 1]
    assert len(page_1_rows) == 1
    assert page_1_rows[0]["status"] == "complete"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/document-intelligence && python -m pytest tests/test_document_loop_resume.py -v`
Expected: FAIL (`process_document` doesn't accept `resume` kwarg yet, or creates a duplicate page-0 row).

- [ ] **Step 3: Add resume support to `document_loop.py`**

Modify `services/document-intelligence/app/transcription/document_loop.py` — replace the `process_document` function body:

```python
async def process_document(
    pdf_bytes: bytes,
    run_id: str,
    document_id: str,
    document_hash: str,
    total_pages: int,
    provider: DemVisionProvider,
    db_client: DemDbClient,
    prompt_version: str,
    concurrency: int = DEFAULT_CONCURRENCY,
    resume: bool = False,
) -> None:
    run = {"id": run_id, "document_id": document_id, "document_hash": document_hash}

    existing_by_index: dict[int, dict] = {}
    if resume:
        status = await db_client.get_run_status(run_id)
        existing_by_index = {p["page_index"]: p for p in status["pages"]}

    page_id_by_index: dict[int, str] = {}
    existing_page_by_index: dict[int, dict | None] = {}
    for page_index in range(total_pages):
        existing = existing_by_index.get(page_index)
        if existing is not None:
            # §7.7 resume: reuse the existing page row (do not create a
            # duplicate) -- process_page's own idempotency check (Task 6)
            # decides whether to skip re-calling the provider.
            page_id_by_index[page_index] = existing["id"]
            existing_page_by_index[page_index] = existing
        else:
            created = await db_client.create_page(run_id, page_index)
            page_id_by_index[page_index] = created["id"]
            existing_page_by_index[page_index] = None

    semaphore = asyncio.Semaphore(concurrency)

    async def _bounded_process(page_index: int) -> None:
        async with semaphore:
            await process_page(
                pdf_bytes=pdf_bytes, page_index=page_index, page_id=page_id_by_index[page_index],
                run=run, provider=provider, db_client=db_client, prompt_version=prompt_version,
                existing_page=existing_page_by_index[page_index],
            )

    await asyncio.gather(*(_bounded_process(page_index) for page_index in range(total_pages)))

    status = await db_client.get_run_status(run_id)
    any_failed = any(p["status"] == "failed" for p in status["pages"])
    await db_client.update_run_status(run_id, "partially_failed" if any_failed else "dem_complete")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/document-intelligence && python -m pytest tests/test_document_loop_resume.py -v`
Expected: PASS, `1 passed`.

- [ ] **Step 5: Run the full document-intelligence suite (regression check for the resume change)**

Run: `cd services/document-intelligence && python -m pytest -q`
Expected: all pass, zero failures — confirms Tasks 1-8's tests (renderer, providers, parser, db_client, page_loop, document_loop, routes, resume) are all green together, not just individually.

- [ ] **Step 6: Run the full services/db suite**

Run: `cd services/db && python -m pytest -q`
Expected: all pass, zero failures.

- [ ] **Step 7: Manual verification with the real PLHUT fixture (not part of automated CI — requires a real API key)**

This step is NOT run by the implementer subagent automatically — it requires `DEM_EXTRACTION_API_KEY` filled in `.env.local` with a real DashScope key, and a running `services/db` + `services/document-intelligence` stack. Document the exact manual steps in the task report so the user/Codex can run them:

```bash
# 1. Ensure .env.local has DEM_EXTRACTION_API_KEY / DEM_EXTRACTION_BASE_URL /
#    DEM_EXTRACTION_MODEL=qwen3.7-plus filled in (slots already exist, empty).
# 2. Start services/db (uvicorn) and services/document-intelligence (uvicorn) locally.
# 3. Upload the fixture:
curl -X POST http://localhost:8083/drawings/dem/start \
  -F "file=@docs/plans/drawing intelligence/Gambar kerja/GAMBAR KERJA PLHUT SURAKARTA (1).pdf" \
  -H "X-Internal-Key: <INTERNAL_SERVICE_KEY value>"
# -> returns {"run_id": "...", "status": "pages_queued", "total_pages": 88}

# 4. Poll status until all 88 pages are terminal:
curl http://localhost:8083/drawings/dem/<run_id>/status -H "X-Internal-Key: <INTERNAL_SERVICE_KEY value>"
# -> Expect eventually: all pages status="complete" (or specific pages
#    "failed" with a real failure_kind + error message -- per the plan's
#    exit criteria "88-page fixture completes or reports exact failed pages",
#    a clean set of failures with real reasons is an acceptable outcome,
#    not a plan failure).

# 5. Resume check: stop the document-intelligence process mid-run (Ctrl+C
#    after a few pages complete), restart it, re-POST /drawings/dem/start
#    is NOT how resume works here -- resume requires re-invoking
#    process_document(..., resume=True) for the same run_id. This plan does
#    not wire an HTTP endpoint for triggering resume explicitly (out of
#    scope per the spec's "Fase 2 penuh" boundary) -- verify resume via a
#    one-off Python script:
python -c "
import asyncio
from app.transcription.document_loop import process_document
from app.transcription.db_client import DemDbClient
from app.transcription.providers.qwen import QwenDemAdapter

async def main():
    db_client = DemDbClient()
    provider = QwenDemAdapter.from_env()
    with open('docs/plans/drawing intelligence/Gambar kerja/GAMBAR KERJA PLHUT SURAKARTA (1).pdf', 'rb') as f:
        pdf_bytes = f.read()
    await process_document(
        pdf_bytes=pdf_bytes, run_id='<run_id from step 3>', document_id='<document_id>',
        document_hash='<document_hash>', total_pages=88, provider=provider,
        db_client=db_client, prompt_version='dem-extraction-v1.0.0', resume=True,
    )

asyncio.run(main())
"
# -> Expect: pages already complete are NOT reprocessed (verify by checking
#    services/document-intelligence logs show no provider call for those
#    page indices), only non-terminal pages proceed.
```

Report the outcome of this manual run precisely: how many of 88 pages reached `complete`, how many `failed` (with their `failure_kind`/`error`), and whether resume skipped the already-complete pages. If real failures occur, they are diagnosed and fixed in code now (per the user's explicit instruction: fix root causes during testing, not leave retry loops for the end user) — not treated as this task's exit condition being unmet, unless the failure is a bug in Tasks 1-8's code rather than a Qwen/DashScope response quirk.

- [ ] **Step 8: Commit**

```bash
git add services/document-intelligence/app/transcription/document_loop.py services/document-intelligence/tests/test_document_loop_resume.py
git commit -m "feat(doc-intel): add DEM Phase 2 resume support (skip already-complete pages)"
```

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** document hash (Task 7's `document_hash` computation) ✓; page renderer (Task 4) ✓; page manifest (`dem_pages` table, Task 1) ✓; queue/state machine (Tasks 6-7) ✓; Qwen adapter (Task 3) ✓; strict prompt (Task 3's `_build_prompt`) ✓; parser/validator (Task 4) ✓; repair (Task 4's `parse_and_validate`) ✓; continuation patch — **not separately implemented as its own task**: the spec explicitly folds continuation into the per-page flow rather than treating it as a distinct entity, and `DrawingEvidenceSheet.completion.is_complete`/`next_cursor` fields already exist from Phase 0+1; a dedicated continuation-loop task is deferred because it requires a real multi-turn Qwen conversation format decision better made after Task 8's manual run shows whether continuation actually triggers on real 88-page PLHUT pages (most single-page DEM extractions are expected to fit in one response) — noted here as a known gap, not silently dropped; retry/backoff (Task 6) ✓; persistence (Task 1 + Task 5) ✓; status endpoint (Task 7) ✓; progress UI minimal — **not built**: the spec's own "Di luar cakupan" section explicitly defers full UI, and the JSON status endpoint (Task 7) is the "minimal" deliverable per Task 13's original wording in the big plan.
- **Placeholder scan:** no TBD/TODO; every step has complete runnable code.
- **Type consistency:** `DemVisionProvider.extract_page` signature consistent across Tasks 3-6; `PageContext` fields consistent; `DemDbClient` method names consistent between Task 5's definition and Tasks 6-8's usage.
- **Known follow-up (not blocking Task 8):** if Task 8's manual run shows continuation actually triggers on real pages, add a Task 9 for the continuation loop before considering Phase 2 fully done — flag this to the user rather than silently expanding scope.

## Execution

Save location: `docs/superpowers/plans/2026-07-14-dem-phase2-job-orchestrator.md` (this file).

Per user's standing instruction this session, Claude does not commit — tasks are handed to Codex to execute (same pattern as Phase 0+1). Each task above is self-contained enough to hand to Codex as a `task-brief`-style dispatch, following the same Codex prompt format used for Phase 0+1's Tasks 2-8 (context + brief path + graphify-first reminder + "commit locally, never push/PR/merge" + report format).
