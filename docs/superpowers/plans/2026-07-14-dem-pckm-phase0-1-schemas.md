# DEM/PCKM Phase 0+1 — Audit & Shared Schemas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the current architecture state in an ADR, then add the shared Pydantic+Zod schema contracts for Drawing Evidence Model (DEM) and Project Construction Knowledge Model (PCKM) — with schema tests green and zero provider/model integration yet.

**Architecture:** Every new schema pair follows the established `services/*` (Pydantic, source of truth) ↔ `packages/schemas/src/index.ts` (Zod, mirror) pattern already used for TKG (`services/core-engine/app/tkg/models.py` ↔ the `TKG — Transkrip Kanonik Gambar` section of `index.ts`). New Pydantic models live in two new modules under `services/document-intelligence/app/` (`transcription/models.py` for DEM, `project_graph/models.py` for PCKM) since DEM/PCKM extraction is a document-intelligence concern, not core-engine. Each schema is validated by a parity test: a Python pytest that builds an example payload and a matching TypeScript jest test that parses the same example shape through the Zod schema — this is how existing TKG/RAB schemas are verified (`packages/schemas/src/__tests__/schemas.test.ts` already does this for `RABResult`, `HSPBreakdown`, etc.), not an automated cross-language diff.

**Tech Stack:** Python 3.13 / Pydantic v2 (services/document-intelligence, Poetry), TypeScript / Zod 3.23 (packages/schemas, pnpm + jest + tsup).

## Global Constraints

- **Aturan Emas (`CLAUDE.md` §1):** no numeric calculation logic in these schemas or their tests — fields hold raw/normalized *values already present in source data*, never derived/computed numbers.
- **`CLAUDE.md` §2:** Zod and Pydantic changed together in the same commit — never one without the other.
- Confidence fields are always `float` constrained `0.0–1.0` (matches every existing confidence field in the codebase: `EvidenceSchema.confidence`, `ElementInstanceSchema` review states, etc.).
- Status enum for evidence/observations is the flat 6-value set already chosen in the spec (`extracted, ai_interpreted, ambiguous, conflicting, missing, human_verified`) — **do not** introduce the older 7-stage `readiness_status` chain (`detected→...→qto_ready`), it was superseded (see spec `docs/plans/drawing intelligence/PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md` §6.5).
- bbox fields are always normalized `[x0, y0, x1, y1]` in `0.0–1.0` range (matches `bbox_norm` convention used throughout `services/document-intelligence/app/perception/models.py` and the 12-model DEM extraction benchmark reviewed this session).
- Every new Pydantic file starts with a module docstring stating what it is, which spec section it follows, and which Zod section mirrors it — matches the existing convention in `app/tkg/models.py` and `app/perception/models.py`.
- Test commands: Python — `cd services/document-intelligence && python -m pytest tests/<file> -v`. TypeScript — `cd packages/schemas && pnpm test` (jest).
- No `TODO`/`unclear` placeholder values in code — Pydantic `Optional[X] = None` / Zod `.nullish()` express "not yet known", never a string placeholder.

---

## File Structure

**New files (backend, Python):**
```
services/document-intelligence/app/transcription/__init__.py     — empty, marks package
services/document-intelligence/app/transcription/models.py       — DEM: DrawingEvidenceSheet, manifest, continuation patch
services/document-intelligence/app/project_graph/__init__.py     — empty, marks package
services/document-intelligence/app/project_graph/models.py       — PCKM: graph node/edge/snapshot, query plan/result, answer contract
```

**New test files (backend, Python):**
```
services/document-intelligence/tests/test_transcription_models.py
services/document-intelligence/tests/test_project_graph_models.py
```

**Modified files:**
```
packages/schemas/src/index.ts               — 4 new sections appended (DEM, PCKM graph, query, answer)
packages/schemas/src/__tests__/schemas.test.ts — parity tests for each new section
docs/ai-map/STATE_CURRENT.md                — refreshed to current branch/commit/model names
docs/adr/0005-dem-pckm-graph-retrieval.md   — new ADR (Phase 0)
```

Each `models.py` is one file per subsystem (DEM vs PCKM) rather than one file per schema — this matches the existing convention (`consolidated_models.py` holds ~15 related Pydantic classes in one file; `tkg/models.py` holds the whole TKG tree in one file). Splitting further would fight the codebase's established pattern.

---

### Task 1: Architecture audit — refresh state doc + write ADR

**Files:**
- Modify: `docs/ai-map/STATE_CURRENT.md`
- Create: `docs/adr/0005-dem-pckm-graph-retrieval.md`

**Interfaces:**
- Consumes: nothing (docs-only, no code dependency)
- Produces: nothing later tasks import — this is Phase 0 audit work folded into Task 1 per Task Right-Sizing (no meaningful TDD cycle for a documentation update)

This task has no test framework — "testable deliverable" here means: the files exist, contain the stated facts, and a `grep` confirms the stale claims are gone. This replaces Phase 0's original 8-task/3-deliverable list (`ADR_DEM_PCKM_GRAPH_COMMAND_ROOM.md`, `CURRENT_FLOW_AUDIT.md`, `SCHEMA_GAP_REPORT.md`) with what's actually needed to unblock Task 2 — the schema gap is now fully known (this plan *is* the schema gap report), so a separate `SCHEMA_GAP_REPORT.md` would just duplicate this plan's File Structure section.

- [ ] **Step 1: Update `docs/ai-map/STATE_CURRENT.md` branch/model facts**

Replace the stale header block (currently says branch `feat/command-room-updates`, last update 2026-07-10, Lucent/Solace 2-model routing) with:

```markdown
# 📍 PAAX — STATE_CURRENT (status aktif, ringkas)

> Update terakhir: **2026-07-14**. Riwayat lengkap sebelum tanggal ini ada di
> `docs/history/STATE_ARCHIVE_2026-06_2026-07.md`. File ini HANYA status
> aktif — jangan tambah narasi panjang di sini, tulis laporan detail ke
> `report/` lalu ringkas 1-2 baris di sini.

## Branch & PR aktif
- Branch kerja: `feat/command-room-model-overhaul` (belum di-PR/merge), commit terbaru `fa7a01d`.
- PR historis #29-#40 semua sudah merge ke `main` (bridging non-struktur,
  X1/X1B/X2 AI-assist, packaging schemas).

## Yang sudah nyata jalan di `main` (terverifikasi lewat kode + git log, bukan laporan)
- **Command Room** — chat AI utama baru (`apps/web/src/app/(dashboard)/command-room/`),
  terpisah dari chat lama per-proyek (`proyek/[projectId]/chat/`, masih ada,
  belum dihapus). Model routing 3 model: **Lucent**=DeepSeek V4 Pro,
  **Arete**=Qwen3.7-Plus (DashScope), **Noir**=Claude Sonnet 5 (Anthropic) via
  `lib/paax-models.ts`. `projectId` sudah opsional di request chat
  (`app/api/command-room/chat/route.ts:42-49`, "Fase 10 PLAN.md §9"), belum
  dipakai untuk retrieval terstruktur. Masih churn aktif — belum dianggap stabil.
- **Drawing Intelligence** — pakai NVIDIA + Gemini untuk OCR/reasoning gambar
  kerja: `app/perception/ocr/nvidia_vision_extractor.py` +
  `app/perception/ai_assist/client.py` (`GeminiAiAssistClient`,
  `NvidiaAiAssistClient`, `NullAiAssistClient` — belum ada varian
  Qwen/Anthropic vision). `is_raster_sheet()` gate
  (`app/perception/ingest/raster_detector.py`) masih memblokir vision untuk
  PDF vector-native — DEM extraction pipeline (Phase 2+ rencana ini) akan
  melepas gerbang itu.
- **DEM/PCKM plan** — `docs/plans/drawing intelligence/PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md`
  disetujui sebagai arsitektur target (2026-07-14). Implementation plan Phase
  0+1 (dokumen ini) di `docs/superpowers/plans/`.
```

Keep everything below `## Blocker / catatan jujur yang masih berlaku` as-is — those items (Cloud Run deploy, dual NVIDIA/DeepSeek implementation, pgvector, site-agent scaffold) are still true and out of scope for this change.

- [ ] **Step 2: Verify the stale facts are gone**

Run: `grep -n "feat/command-room-updates\|Solace\|2026-07-10" "docs/ai-map/STATE_CURRENT.md"`
Expected: no output (all three stale strings removed from the header block edited in Step 1). It is fine if `2026-07-10` still appears later in the file inside the "Pekerjaan sesi ini (2026-07-10, ...)" historical section — that is a dated log entry, not a claim about current state, and Step 1 did not touch it.

- [ ] **Step 3: Write ADR 0005**

Follow the exact format of `docs/adr/0002-deterministic-rab-engine.md` (`# ADR NNNN: Title` / `## Status` / `## Context` / `## Decision` / `## Consequences` with Positive/Negative subsections):

```markdown
# ADR 0005: Drawing Evidence Model (DEM) and Project Construction Knowledge Model (PCKM)

## Status
Accepted

## Context
PAAX's Drawing Intelligence pipeline today produces a single `ConsolidatedExtraction`
(`services/document-intelligence/app/perception/consolidated_models.py`) per document —
one flat registry of elements with no per-page evidence trail and no graph-native
relationships between sheets. Vision extraction is also gated: `is_raster_sheet()`
(`app/perception/ingest/raster_detector.py`) only calls vision AI for sheets proven to
be scanned/photographed; vector-native PDFs (the majority of real drawing sets,
including the PLHUT fixture) go through PyMuPDF vector + regex/grammar only, so vision
AI currently has no role in the primary extraction path for most real drawings.

The owner wants Command Room to answer project questions grounded in evidence that
traces back to a specific sheet/page/bbox, using a Graphify-style scoped retrieval
(BFS/DFS/path/explain, seed scoring, token budget) instead of injecting entire project
context into every chat turn — while keeping the Golden Rule (`CLAUDE.md` §1) intact:
AI never computes final RAB/BOQ/volume numbers, only classifies/extracts/links.

## Decision
Introduce two new data models, evidence-backed and graph-native from the start:

1. **Drawing Evidence Model (DEM)** — one record per drawing sheet/page, `schema_version:
   "paax.dem.sheet.v1"`. Raw transcript only: no cross-page merging, no computed
   quantities, every fact carries `evidence_refs` + `confidence` + `status`
   (`extracted | ai_interpreted | ambiguous | conflicting | missing | human_verified`).
2. **Project Construction Knowledge Model (PCKM)** — project-level graph
   (`schema_version: "paax.pckm.graph.v1"`) built by normalizing/linking DEM records:
   nodes (project/spatial/construction/information taxonomy), edges (`CONTAINS`,
   `LOCATED_ON`, `INSTANCE_OF`, etc.), aliases, conflicts, immutable snapshots.

Both models are defined once in Pydantic (`services/document-intelligence/app/
transcription/models.py` for DEM, `app/project_graph/models.py` for PCKM) and mirrored
in Zod (`packages/schemas/src/index.ts`), following the same pairing convention already
used for TKG. This phase (Phase 0+1 of the larger DEM/PCKM plan) ships schemas only —
no model/provider wiring, no DB persistence, no Command Room integration yet. Full
rationale, node/edge taxonomy, retrieval architecture, and 8-phase rollout are in
`docs/plans/drawing intelligence/PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md`.

## Consequences

### Positive
- DEM's evidence-first design makes every AI claim auditable back to a page/bbox,
  satisfying `CLAUDE.md` §1.1's audit trail requirement before any vision-extraction
  code is written.
- PCKM's graph-native shape (nodes/edges, not one big document) lets Command Room
  retrieval stay scoped and token-cheap from day one, instead of retrofitting graph
  structure onto a flat model later.
- Schema-first sequencing (this phase) means Phase 2 (DEM job orchestrator) and Phase 3
  (PCKM synthesis engine) both build against a frozen contract instead of guessing at
  shapes while the pipeline is also being built.

### Negative
- Two more Pydantic/Zod pairs to keep in sync going forward (existing pattern, but more
  surface area — TKG + RAB/HSP/CPM + DEM + PCKM).
- DEM/PCKM do not replace `ConsolidatedExtraction`/`TkgDocument` in this phase — until
  Phase 6/7 migration work lands, the codebase carries three overlapping "what did we
  extract from this drawing" shapes (`ConsolidatedExtraction`, `TkgDocument`, DEM). This
  is accepted short-term technical debt, not silently ignored: Phase 3's exit criteria
  explicitly includes a legacy TKG export path, and Phase 6/7 own retiring the older
  shapes.
```

- [ ] **Step 4: Commit**

```bash
git add docs/ai-map/STATE_CURRENT.md docs/adr/0005-dem-pckm-graph-retrieval.md
git commit -m "docs: freeze DEM/PCKM architecture decision in ADR 0005, refresh STATE_CURRENT"
```

---

### Task 2: DEM sheet schema — Pydantic + Zod + parity test

**Files:**
- Create: `services/document-intelligence/app/transcription/__init__.py`
- Create: `services/document-intelligence/app/transcription/models.py`
- Create: `services/document-intelligence/tests/test_transcription_models.py`
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/__tests__/schemas.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `DrawingEvidenceSheet` (Pydantic, `app/transcription/models.py`) and `DrawingEvidenceSheetSchema` (Zod, `packages/schemas/src/index.ts`) — both accept the same JSON shape. Later DEM tasks (manifest, continuation patch) import `EvidenceItem`, `ObservationValue`, `DemStatus` from this same module.

- [ ] **Step 1: Write the failing Python test**

Create `services/document-intelligence/tests/test_transcription_models.py`:

```python
from __future__ import annotations

from app.transcription.models import (
    DemGeneration,
    DemObservations,
    DemSource,
    DrawingEvidenceSheet,
    EvidenceItem,
    InterpretedValue,
    ObservationValue,
    ScaleCandidate,
    SheetCompletion,
    SheetIdentity,
    SheetView,
    ValueWithEvidence,
)


def test_drawing_evidence_sheet_accepts_minimal_valid_payload():
    sheet = DrawingEvidenceSheet(
        schema_version="paax.dem.sheet.v1",
        run_id="DEMRUN-20260714-001",
        document_id="DOC-PLHUT-001",
        project_id="PRJ-001",
        source=DemSource(
            document_hash="sha256:abc123",
            file_name="GAMBAR KERJA PLHUT SURAKARTA (1).pdf",
            page_index=5,
            page_number=6,
            render_uri="object://renders/doc-plhut-001/page-006.png",
            width_px=4096,
            height_px=2896,
        ),
        generation=DemGeneration(
            provider="qwen",
            model_alias="qwen-3.7-plus",
            prompt_version="dem-extraction-v1.0.0",
            started_at="2026-07-14T10:00:00Z",
            completed_at="2026-07-14T10:00:12Z",
            continuation_count=0,
            temperature=0.0,
            status="complete",
        ),
        sheet_identity=SheetIdentity(
            sheet_number=ValueWithEvidence(value="A-06", raw="A-06", confidence=0.98, evidence_refs=["EV-P006-001"]),
            title=ValueWithEvidence(value="Rencana Paving", raw="RENCANA PAVING", confidence=0.99, evidence_refs=["EV-P006-002"]),
            discipline=InterpretedValue(value="architecture", confidence=0.88, status="ai_interpreted"),
            scale_candidates=[ScaleCandidate(raw="1 : 100", normalized="1:100", confidence=0.94, evidence_refs=["EV-P006-003"])],
        ),
        views=[SheetView(view_id="VIEW-P006-01", type="site_plan", title="Rencana Paving", bbox=(0.08, 0.12, 0.84, 0.91), confidence=0.91)],
        observations=DemObservations(
            texts=[ObservationValue(raw="R.PLHUT", normalized="Ruang PLHUT", confidence=0.9, evidence_refs=["EV-P006-004"])],
            dimensions=[ObservationValue(raw="20400", normalized="20400", numeric_value=20400.0, unit="mm", confidence=0.86, evidence_refs=["EV-P006-005"])],
        ),
        evidence=[
            EvidenceItem(evidence_id="EV-P006-001", kind="visible_text", raw="A-06", bbox=(0.91, 0.88, 0.96, 0.92), confidence=0.98),
        ],
        completion=SheetCompletion(sections_expected=13, sections_completed=13, is_complete=True, next_cursor=None),
    )

    assert sheet.source.page_number == 6
    assert sheet.sheet_identity.discipline.status == "ai_interpreted"
    assert sheet.observations.dimensions[0].numeric_value == 20400.0
    assert sheet.completion.is_complete is True
    # DEM never computes derived numbers — dimensions carry only the raw/normalized
    # value read from the sheet, no cross-sheet or calculated fields exist on the model.
    assert not hasattr(sheet.observations.dimensions[0], "cross_section_area_mm2")


def test_drawing_evidence_sheet_defaults_empty_observation_lists():
    sheet = DrawingEvidenceSheet(
        schema_version="paax.dem.sheet.v1",
        run_id="DEMRUN-20260714-002",
        document_id="DOC-PLHUT-001",
        project_id="PRJ-001",
        source=DemSource(
            document_hash="sha256:abc123",
            file_name="GAMBAR KERJA PLHUT SURAKARTA (1).pdf",
            page_index=0,
            page_number=1,
            render_uri="object://renders/doc-plhut-001/page-001.png",
            width_px=4096,
            height_px=2896,
        ),
        generation=DemGeneration(
            provider="qwen",
            model_alias="qwen-3.7-plus",
            prompt_version="dem-extraction-v1.0.0",
            started_at="2026-07-14T10:00:00Z",
            completed_at="2026-07-14T10:00:05Z",
            continuation_count=0,
            temperature=0.0,
            status="complete",
        ),
        sheet_identity=SheetIdentity(
            sheet_number=ValueWithEvidence(value="", confidence=0.0),
            title=ValueWithEvidence(value="GAMBAR KERJA", confidence=0.95),
            discipline=InterpretedValue(value="cover", confidence=0.9, status="ai_interpreted"),
        ),
        completion=SheetCompletion(sections_expected=13, sections_completed=13, is_complete=True, next_cursor=None),
    )

    assert sheet.observations.texts == []
    assert sheet.views == []
    assert sheet.evidence == []
    assert sheet.ambiguities == []
    assert sheet.conflicts == []
    assert sheet.unclassified == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/document-intelligence && python -m pytest tests/test_transcription_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.transcription'`

- [ ] **Step 3: Write the Pydantic models**

Create `services/document-intelligence/app/transcription/__init__.py` (empty file, marks the package):

```python
```

Create `services/document-intelligence/app/transcription/models.py`:

```python
"""
PAAX Document Intelligence — Drawing Evidence Model (DEM).

Skema per docs/plans/drawing intelligence/
PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md §6 (Drawing Evidence Model).
Paritas Zod di packages/schemas/src/index.ts (blok "DEM — Drawing Evidence Model").

DEM adalah transkrip evidence PER HALAMAN. Tidak menyimpulkan bentuk bangunan
global, tidak menggabungkan kode antar halaman, tidak menghitung volume/BOQ/RAB.
Setiap fakta penting WAJIB punya evidence_refs + confidence + status — angka
hasil kalkulasi (mis. luas dari dimensi) TIDAK PERNAH muncul di sini, itu
tugas services/core-engine (Aturan Emas, CLAUDE.md §1).
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

DemStatus = Literal[
    "extracted", "ai_interpreted", "ambiguous", "conflicting", "missing", "human_verified",
]


class DemSource(BaseModel):
    document_hash: str
    file_name: str
    page_index: int
    page_number: int
    render_uri: str
    width_px: int
    height_px: int


class DemGeneration(BaseModel):
    provider: str
    model_alias: str
    prompt_version: str
    started_at: str
    completed_at: Optional[str] = None
    continuation_count: int = 0
    temperature: float = 0.0
    status: Literal["complete", "partial", "failed"] = "complete"


class ValueWithEvidence(BaseModel):
    """Fakta bertekstual dengan confidence + evidence_refs (§6.4 sheet_identity.sheet_number/title)."""
    value: str
    raw: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_refs: list[str] = Field(default_factory=list)


class InterpretedValue(BaseModel):
    """Fakta hasil klasifikasi AI (bukan tertulis langsung) — punya status, bukan raw text (§6.4 discipline)."""
    value: str
    confidence: float = Field(ge=0.0, le=1.0)
    status: DemStatus = "extracted"


class ScaleCandidate(BaseModel):
    raw: str
    normalized: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_refs: list[str] = Field(default_factory=list)


class SheetIdentity(BaseModel):
    sheet_number: ValueWithEvidence
    title: ValueWithEvidence
    discipline: InterpretedValue
    scale_candidates: list[ScaleCandidate] = Field(default_factory=list)


class SheetView(BaseModel):
    view_id: str
    type: str
    title: str
    bbox: tuple[float, float, float, float]
    confidence: float = Field(ge=0.0, le=1.0)


class ObservationValue(BaseModel):
    """Satu item di salah satu dari 13 daftar observations (§6.4). Bentuk seragam
    lintas tipe (texts/dimensions/grids/levels/spaces/element_labels/symbols/
    tables/materials/notes/references/patterns/geometry_descriptions) —
    dibedakan oleh array mana ia berada, bukan field diskriminator, karena
    DEM tidak melakukan klasifikasi taksonomi konstruksi di lapisan ini
    (itu tugas PCKM synthesis, app/project_graph/)."""
    raw: str
    normalized: Optional[str] = None
    numeric_value: Optional[float] = None
    unit: Optional[str] = None
    bbox: Optional[tuple[float, float, float, float]] = None
    confidence: float = Field(ge=0.0, le=1.0)
    status: DemStatus = "extracted"
    evidence_refs: list[str] = Field(default_factory=list)


class DemObservations(BaseModel):
    texts: list[ObservationValue] = Field(default_factory=list)
    dimensions: list[ObservationValue] = Field(default_factory=list)
    grids: list[ObservationValue] = Field(default_factory=list)
    levels: list[ObservationValue] = Field(default_factory=list)
    spaces: list[ObservationValue] = Field(default_factory=list)
    element_labels: list[ObservationValue] = Field(default_factory=list)
    symbols: list[ObservationValue] = Field(default_factory=list)
    tables: list[ObservationValue] = Field(default_factory=list)
    materials: list[ObservationValue] = Field(default_factory=list)
    notes: list[ObservationValue] = Field(default_factory=list)
    references: list[ObservationValue] = Field(default_factory=list)
    patterns: list[ObservationValue] = Field(default_factory=list)
    geometry_descriptions: list[ObservationValue] = Field(default_factory=list)


class EvidenceItem(BaseModel):
    evidence_id: str
    kind: str
    raw: str
    bbox: Optional[tuple[float, float, float, float]] = None
    confidence: float = Field(ge=0.0, le=1.0)


class SheetCompletion(BaseModel):
    sections_expected: int
    sections_completed: int
    is_complete: bool
    next_cursor: Optional[str] = None


class DrawingEvidenceSheet(BaseModel):
    schema_version: Literal["paax.dem.sheet.v1"] = "paax.dem.sheet.v1"
    run_id: str
    document_id: str
    project_id: str
    source: DemSource
    generation: DemGeneration
    sheet_identity: SheetIdentity
    views: list[SheetView] = Field(default_factory=list)
    observations: DemObservations = Field(default_factory=DemObservations)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    ambiguities: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    unclassified: list[str] = Field(default_factory=list)
    completion: SheetCompletion
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/document-intelligence && python -m pytest tests/test_transcription_models.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing Zod/jest test**

Add to `packages/schemas/src/__tests__/schemas.test.ts` (append at end of file, after the existing `mockHSPBreakdown` block and any tests that follow it — do not remove existing content):

```typescript
import { DrawingEvidenceSheetSchema } from "../index";

// Contoh payload sama persis dengan test_drawing_evidence_sheet_accepts_minimal_valid_payload
// di services/document-intelligence/tests/test_transcription_models.py — parity dijaga
// dengan menjaga kedua contoh ini identik, bukan generator otomatis.
const mockDrawingEvidenceSheet = {
  schema_version: "paax.dem.sheet.v1",
  run_id: "DEMRUN-20260714-001",
  document_id: "DOC-PLHUT-001",
  project_id: "PRJ-001",
  source: {
    document_hash: "sha256:abc123",
    file_name: "GAMBAR KERJA PLHUT SURAKARTA (1).pdf",
    page_index: 5,
    page_number: 6,
    render_uri: "object://renders/doc-plhut-001/page-006.png",
    width_px: 4096,
    height_px: 2896,
  },
  generation: {
    provider: "qwen",
    model_alias: "qwen-3.7-plus",
    prompt_version: "dem-extraction-v1.0.0",
    started_at: "2026-07-14T10:00:00Z",
    completed_at: "2026-07-14T10:00:12Z",
    continuation_count: 0,
    temperature: 0.0,
    status: "complete",
  },
  sheet_identity: {
    sheet_number: { value: "A-06", raw: "A-06", confidence: 0.98, evidence_refs: ["EV-P006-001"] },
    title: { value: "Rencana Paving", raw: "RENCANA PAVING", confidence: 0.99, evidence_refs: ["EV-P006-002"] },
    discipline: { value: "architecture", confidence: 0.88, status: "ai_interpreted" },
    scale_candidates: [{ raw: "1 : 100", normalized: "1:100", confidence: 0.94, evidence_refs: ["EV-P006-003"] }],
  },
  views: [{ view_id: "VIEW-P006-01", type: "site_plan", title: "Rencana Paving", bbox: [0.08, 0.12, 0.84, 0.91], confidence: 0.91 }],
  observations: {
    texts: [{ raw: "R.PLHUT", normalized: "Ruang PLHUT", confidence: 0.9, evidence_refs: ["EV-P006-004"] }],
    dimensions: [{ raw: "20400", normalized: "20400", numeric_value: 20400.0, unit: "mm", confidence: 0.86, evidence_refs: ["EV-P006-005"] }],
  },
  evidence: [
    { evidence_id: "EV-P006-001", kind: "visible_text", raw: "A-06", bbox: [0.91, 0.88, 0.96, 0.92], confidence: 0.98 },
  ],
  completion: { sections_expected: 13, sections_completed: 13, is_complete: true, next_cursor: null },
};

describe("DrawingEvidenceSheetSchema", () => {
  it("parses a real DEM page payload matching the Pydantic model", () => {
    const result = DrawingEvidenceSheetSchema.parse(mockDrawingEvidenceSheet);
    expect(result.source.page_number).toBe(6);
    expect(result.sheet_identity.discipline.status).toBe("ai_interpreted");
    expect(result.observations.dimensions[0].numeric_value).toBe(20400.0);
    expect(result.completion.is_complete).toBe(true);
  });

  it("defaults empty observation lists when omitted", () => {
    const minimal = {
      schema_version: "paax.dem.sheet.v1",
      run_id: "DEMRUN-20260714-002",
      document_id: "DOC-PLHUT-001",
      project_id: "PRJ-001",
      source: {
        document_hash: "sha256:abc123",
        file_name: "GAMBAR KERJA PLHUT SURAKARTA (1).pdf",
        page_index: 0,
        page_number: 1,
        render_uri: "object://renders/doc-plhut-001/page-001.png",
        width_px: 4096,
        height_px: 2896,
      },
      generation: {
        provider: "qwen",
        model_alias: "qwen-3.7-plus",
        prompt_version: "dem-extraction-v1.0.0",
        started_at: "2026-07-14T10:00:00Z",
        continuation_count: 0,
        temperature: 0.0,
        status: "complete",
      },
      sheet_identity: {
        sheet_number: { value: "", confidence: 0.0 },
        title: { value: "GAMBAR KERJA", confidence: 0.95 },
        discipline: { value: "cover", confidence: 0.9, status: "ai_interpreted" },
      },
      completion: { sections_expected: 13, sections_completed: 13, is_complete: true, next_cursor: null },
    };

    const result = DrawingEvidenceSheetSchema.parse(minimal);
    expect(result.observations.texts).toEqual([]);
    expect(result.views).toEqual([]);
    expect(result.evidence).toEqual([]);
  });
});
```

- [ ] **Step 6: Run jest to verify it fails**

Run: `cd packages/schemas && pnpm test`
Expected: FAIL — `DrawingEvidenceSheetSchema` is not exported from `../index`

- [ ] **Step 7: Add the Zod schemas**

Append to `packages/schemas/src/index.ts` (after the closing `});` of `TkgDocumentSchema`, the last line of the existing TKG section):

```typescript
// ─── DEM — Drawing Evidence Model (selaras app/transcription/models.py) ──────
//
// Skema per docs/plans/drawing intelligence/
// PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md §6.
// DEM adalah transkrip evidence PER HALAMAN — tidak ada angka hasil kalkulasi
// di sini (Aturan Emas, CLAUDE.md §1). Setiap fakta wajib punya confidence +
// evidence_refs + status.

export const DemStatusEnum = z.enum([
  "extracted", "ai_interpreted", "ambiguous", "conflicting", "missing", "human_verified",
]);

export const DemSourceSchema = z.object({
  document_hash: z.string(),
  file_name: z.string(),
  page_index: z.number().int().nonnegative(),
  page_number: z.number().int().positive(),
  render_uri: z.string(),
  width_px: z.number().int().positive(),
  height_px: z.number().int().positive(),
});

export const DemGenerationSchema = z.object({
  provider: z.string(),
  model_alias: z.string(),
  prompt_version: z.string(),
  started_at: z.string(),
  completed_at: z.string().nullish(),
  continuation_count: z.number().int().nonnegative().default(0),
  temperature: z.number().default(0),
  status: z.enum(["complete", "partial", "failed"]).default("complete"),
});

export const ValueWithEvidenceSchema = z.object({
  value: z.string(),
  raw: z.string().nullish(),
  confidence: z.number().min(0).max(1),
  evidence_refs: z.array(z.string()).default([]),
});

export const InterpretedValueSchema = z.object({
  value: z.string(),
  confidence: z.number().min(0).max(1),
  status: DemStatusEnum.default("extracted"),
});

export const ScaleCandidateSchema = z.object({
  raw: z.string(),
  normalized: z.string(),
  confidence: z.number().min(0).max(1),
  evidence_refs: z.array(z.string()).default([]),
});

export const SheetIdentitySchema = z.object({
  sheet_number: ValueWithEvidenceSchema,
  title: ValueWithEvidenceSchema,
  discipline: InterpretedValueSchema,
  scale_candidates: z.array(ScaleCandidateSchema).default([]),
});

export const SheetViewSchema = z.object({
  view_id: z.string(),
  type: z.string(),
  title: z.string(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  confidence: z.number().min(0).max(1),
});

export const ObservationValueSchema = z.object({
  raw: z.string(),
  normalized: z.string().nullish(),
  numeric_value: z.number().nullish(),
  unit: z.string().nullish(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullish(),
  confidence: z.number().min(0).max(1),
  status: DemStatusEnum.default("extracted"),
  evidence_refs: z.array(z.string()).default([]),
});

export const DemObservationsSchema = z.object({
  texts: z.array(ObservationValueSchema).default([]),
  dimensions: z.array(ObservationValueSchema).default([]),
  grids: z.array(ObservationValueSchema).default([]),
  levels: z.array(ObservationValueSchema).default([]),
  spaces: z.array(ObservationValueSchema).default([]),
  element_labels: z.array(ObservationValueSchema).default([]),
  symbols: z.array(ObservationValueSchema).default([]),
  tables: z.array(ObservationValueSchema).default([]),
  materials: z.array(ObservationValueSchema).default([]),
  notes: z.array(ObservationValueSchema).default([]),
  references: z.array(ObservationValueSchema).default([]),
  patterns: z.array(ObservationValueSchema).default([]),
  geometry_descriptions: z.array(ObservationValueSchema).default([]),
});

export const EvidenceItemSchema = z.object({
  evidence_id: z.string(),
  kind: z.string(),
  raw: z.string(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullish(),
  confidence: z.number().min(0).max(1),
});

export const SheetCompletionSchema = z.object({
  sections_expected: z.number().int(),
  sections_completed: z.number().int(),
  is_complete: z.boolean(),
  next_cursor: z.string().nullable(),
});

export const DrawingEvidenceSheetSchema = z.object({
  schema_version: z.literal("paax.dem.sheet.v1").default("paax.dem.sheet.v1"),
  run_id: z.string(),
  document_id: z.string(),
  project_id: z.string(),
  source: DemSourceSchema,
  generation: DemGenerationSchema,
  sheet_identity: SheetIdentitySchema,
  views: z.array(SheetViewSchema).default([]),
  observations: DemObservationsSchema.default({}),
  evidence: z.array(EvidenceItemSchema).default([]),
  ambiguities: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
  unclassified: z.array(z.string()).default([]),
  completion: SheetCompletionSchema,
});
export type DrawingEvidenceSheet = z.infer<typeof DrawingEvidenceSheetSchema>;
```

- [ ] **Step 8: Run jest to verify it passes**

Run: `cd packages/schemas && pnpm test`
Expected: PASS (all tests, including the 2 new `DrawingEvidenceSheetSchema` tests)

- [ ] **Step 9: Commit**

```bash
git add services/document-intelligence/app/transcription/ services/document-intelligence/tests/test_transcription_models.py packages/schemas/src/index.ts packages/schemas/src/__tests__/schemas.test.ts
git commit -m "feat(schemas): add DEM sheet schema (Pydantic + Zod parity)"
```

---

### Task 3: DEM manifest + continuation patch schema — Pydantic + Zod + parity test

**Files:**
- Modify: `services/document-intelligence/app/transcription/models.py`
- Modify: `services/document-intelligence/tests/test_transcription_models.py`
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/__tests__/schemas.test.ts`

**Interfaces:**
- Consumes: `DemStatus` (Task 2, same module — no cross-file import needed)
- Produces: `DocumentManifest`, `PageManifestEntry` (Pydantic) / `DocumentManifestSchema` (Zod) — Phase 2's page-loop orchestrator (future plan) will read/write these. `ContinuationPatch` (Pydantic) / `ContinuationPatchSchema` (Zod) — Phase 2's continuation engine will consume these.

- [ ] **Step 1: Write the failing Python test**

Append to `services/document-intelligence/tests/test_transcription_models.py`:

```python
from app.transcription.models import (
    ContinuationPatch,
    DocumentManifest,
    PageManifestEntry,
)


def test_document_manifest_tracks_page_status_and_resume_state():
    manifest = DocumentManifest(
        document_id="DOC-PLHUT-001",
        document_hash="sha256:abc123",
        total_pages=88,
        pages=[
            PageManifestEntry(page_index=0, status="complete", attempt_count=1, input_hash="sha256:page0hash"),
            PageManifestEntry(page_index=1, status="complete", attempt_count=1, input_hash="sha256:page1hash"),
            PageManifestEntry(page_index=46, status="failed", attempt_count=3, input_hash="sha256:page46hash", error="timeout after 30s"),
            PageManifestEntry(page_index=47, status="queued", attempt_count=0, input_hash=None),
        ],
    )

    complete_pages = [p for p in manifest.pages if p.status == "complete"]
    assert len(complete_pages) == 2
    failed = next(p for p in manifest.pages if p.page_index == 46)
    assert failed.error == "timeout after 30s"
    assert failed.attempt_count == 3


def test_continuation_patch_carries_base_hash_and_cursor():
    patch = ContinuationPatch(
        schema_version="paax.dem.patch.v1",
        run_id="DEMRUN-20260714-001",
        page_index=5,
        base_result_hash="sha256:previousresulthash",
        cursor="grids:0",
        append={"grids": [], "levels": [], "spaces": []},
        is_complete=False,
        next_cursor="element_labels:0",
    )

    assert patch.base_result_hash == "sha256:previousresulthash"
    assert patch.is_complete is False
    assert patch.next_cursor == "element_labels:0"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/document-intelligence && python -m pytest tests/test_transcription_models.py -v`
Expected: FAIL with `ImportError: cannot import name 'DocumentManifest' from 'app.transcription.models'`

- [ ] **Step 3: Add the Pydantic models**

Append to `services/document-intelligence/app/transcription/models.py` (after `DrawingEvidenceSheet`):

```python
class PageManifestEntry(BaseModel):
    """Status satu halaman dalam page-loop (§7.3 state machine spec).
    input_hash membuat idempotency key (§7.6) — kalau document_hash+page_index+
    input_hash+prompt_version+model_alias sama dan result valid sudah ada,
    jangan panggil model ulang."""
    page_index: int
    status: Literal["queued", "rendering", "calling_model", "complete", "retry_wait", "failed"]
    attempt_count: int = 0
    input_hash: Optional[str] = None
    error: Optional[str] = None


class DocumentManifest(BaseModel):
    """Manifest per-dokumen untuk resume (§7.7) — page 1-46 complete, page 47
    failed/interrupted, page 48-88 queued: resume mulai dari task non-terminal,
    TIDAK mengulang halaman complete."""
    document_id: str
    document_hash: str
    total_pages: int
    pages: list[PageManifestEntry] = Field(default_factory=list)


class ContinuationPatch(BaseModel):
    """Hasil continuation ketika satu halaman kehabisan token di tengah section
    (§8.3). base_result_hash mencegah patch diterapkan ke versi salah — server
    menggabungkan patch secara deterministik, TIDAK PERNAH mengirim seluruh
    JSON sebelumnya kecuali untuk validasi ID (§8.2)."""
    schema_version: Literal["paax.dem.patch.v1"] = "paax.dem.patch.v1"
    run_id: str
    page_index: int
    base_result_hash: str
    cursor: str
    append: dict[str, list] = Field(default_factory=dict)
    is_complete: bool
    next_cursor: Optional[str] = None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/document-intelligence && python -m pytest tests/test_transcription_models.py -v`
Expected: PASS (4 tests total)

- [ ] **Step 5: Write the failing jest test**

Append to `packages/schemas/src/__tests__/schemas.test.ts`:

```typescript
import { ContinuationPatchSchema, DocumentManifestSchema } from "../index";

describe("DocumentManifestSchema", () => {
  it("tracks page status and resume state", () => {
    const manifest = DocumentManifestSchema.parse({
      document_id: "DOC-PLHUT-001",
      document_hash: "sha256:abc123",
      total_pages: 88,
      pages: [
        { page_index: 0, status: "complete", attempt_count: 1, input_hash: "sha256:page0hash" },
        { page_index: 46, status: "failed", attempt_count: 3, input_hash: "sha256:page46hash", error: "timeout after 30s" },
        { page_index: 47, status: "queued", attempt_count: 0, input_hash: null },
      ],
    });

    const failed = manifest.pages.find((p) => p.page_index === 46);
    expect(failed?.error).toBe("timeout after 30s");
    expect(failed?.attempt_count).toBe(3);
  });
});

describe("ContinuationPatchSchema", () => {
  it("carries base hash and cursor for deterministic merge", () => {
    const patch = ContinuationPatchSchema.parse({
      schema_version: "paax.dem.patch.v1",
      run_id: "DEMRUN-20260714-001",
      page_index: 5,
      base_result_hash: "sha256:previousresulthash",
      cursor: "grids:0",
      append: { grids: [], levels: [], spaces: [] },
      is_complete: false,
      next_cursor: "element_labels:0",
    });

    expect(patch.base_result_hash).toBe("sha256:previousresulthash");
    expect(patch.is_complete).toBe(false);
  });
});
```

- [ ] **Step 6: Run jest to verify it fails**

Run: `cd packages/schemas && pnpm test`
Expected: FAIL — `DocumentManifestSchema`/`ContinuationPatchSchema` not exported

- [ ] **Step 7: Add the Zod schemas**

Append to `packages/schemas/src/index.ts` (after `DrawingEvidenceSheetSchema`'s `export type` line):

```typescript
export const PageManifestEntrySchema = z.object({
  page_index: z.number().int().nonnegative(),
  status: z.enum(["queued", "rendering", "calling_model", "complete", "retry_wait", "failed"]),
  attempt_count: z.number().int().nonnegative().default(0),
  input_hash: z.string().nullish(),
  error: z.string().nullish(),
});

export const DocumentManifestSchema = z.object({
  document_id: z.string(),
  document_hash: z.string(),
  total_pages: z.number().int().positive(),
  pages: z.array(PageManifestEntrySchema).default([]),
});
export type DocumentManifest = z.infer<typeof DocumentManifestSchema>;

export const ContinuationPatchSchema = z.object({
  schema_version: z.literal("paax.dem.patch.v1").default("paax.dem.patch.v1"),
  run_id: z.string(),
  page_index: z.number().int().nonnegative(),
  base_result_hash: z.string(),
  cursor: z.string(),
  append: z.record(z.array(z.unknown())).default({}),
  is_complete: z.boolean(),
  next_cursor: z.string().nullish(),
});
export type ContinuationPatch = z.infer<typeof ContinuationPatchSchema>;
```

- [ ] **Step 8: Run jest to verify it passes**

Run: `cd packages/schemas && pnpm test`
Expected: PASS (all tests)

- [ ] **Step 9: Commit**

```bash
git add services/document-intelligence/app/transcription/models.py services/document-intelligence/tests/test_transcription_models.py packages/schemas/src/index.ts packages/schemas/src/__tests__/schemas.test.ts
git commit -m "feat(schemas): add DEM manifest + continuation patch schema (Pydantic + Zod parity)"
```

---

### Task 4: PCKM graph node schema — Pydantic + Zod + parity test

**Files:**
- Create: `services/document-intelligence/app/project_graph/__init__.py`
- Create: `services/document-intelligence/app/project_graph/models.py`
- Create: `services/document-intelligence/tests/test_project_graph_models.py`
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/__tests__/schemas.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ProjectGraphNode` (Pydantic) / `ProjectGraphNodeSchema` (Zod). Task 5 (edges) and Task 6 (snapshot) import `node_id`/`NodeType` conventions from this task.

This task incorporates the containment-invariant validator recommended in the updated
plan spec (§11.4 "Validasi terhadap standar industri — IFC", point 2): a node may have
**at most one** active `LOCATED_ON` edge — but since edges live in a separate list at
the *snapshot* level (Task 6), not on the node itself, the invariant is enforced as a
snapshot-level validator in Task 6, not here. This task defines the node shape only.

- [ ] **Step 1: Write the failing Python test**

Create `services/document-intelligence/tests/test_project_graph_models.py`:

```python
from __future__ import annotations

from app.project_graph.models import (
    NodeProperty,
    NodeSourceRef,
    ProjectGraphNode,
)


def test_project_graph_node_accepts_element_type_payload():
    node = ProjectGraphNode(
        node_id="ELTYPE-COLUMN-K1",
        type="element_type",
        canonical_name="Kolom K1",
        aliases=["K1", "Kol. K1"],
        properties={
            "shape": NodeProperty(value="rectangular", value_source="extracted", evidence_refs=[]),
            "b_mm": NodeProperty(value=300, value_source="extracted", evidence_refs=["EV-P049-121"]),
            "h_mm": NodeProperty(value=500, value_source="extracted", evidence_refs=["EV-P049-122"]),
        },
        discipline="structure",
        verification_status="ai_interpreted",
        confidence=0.92,
        source_refs=[
            NodeSourceRef(document_id="DOC-PLHUT-001", page_index=48, sheet_id="S-49", evidence_refs=["EV-P049-121", "EV-P049-122"]),
        ],
    )

    assert node.properties["b_mm"].value == 300
    assert node.properties["b_mm"].evidence_refs == ["EV-P049-121"]
    assert node.verification_status == "ai_interpreted"
    # Node stores the property VALUE as extracted, never a derived number —
    # cross_section_area_mm2 (b*h) would be a calculation, which belongs to
    # services/core-engine, never to a PCKM node property (Aturan Emas).
    assert "cross_section_area_mm2" not in node.properties


def test_project_graph_node_defaults_empty_aliases_and_properties():
    node = ProjectGraphNode(
        node_id="LEVEL-01",
        type="level",
        canonical_name="Lantai 1",
        discipline="general",
        verification_status="extracted",
        confidence=0.99,
    )

    assert node.aliases == []
    assert node.properties == {}
    assert node.source_refs == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/document-intelligence && python -m pytest tests/test_project_graph_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.project_graph'`

- [ ] **Step 3: Write the Pydantic models**

Create `services/document-intelligence/app/project_graph/__init__.py` (empty file):

```python
```

Create `services/document-intelligence/app/project_graph/models.py`:

```python
"""
PAAX Document Intelligence — Project Construction Knowledge Model (PCKM) graph.

Skema per docs/plans/drawing intelligence/
PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md §11 (node/edge contract).
Paritas Zod di packages/schemas/src/index.ts (blok "PCKM — Project Construction
Knowledge Model graph").

PCKM adalah model kanonik PROYEK (bukan per-halaman seperti DEM) — dibangun
dengan MENORMALISASI dan MENGHUBUNGKAN DEM records, bukan menyimpan hasil
kalkulasi baru. Setiap node/edge tetap membawa evidence_refs balik ke DEM
asalnya (Aturan Emas, CLAUDE.md §1 — PCKM tidak pernah menghitung).

Taksonomi node_type/edge relation divalidasi terhadap skema industri IFC
(IfcOpenShell, dipelajari sbg referensi taksonomi, bukan dependency) — pola
Type-vs-Occurrence PCKM (element_type vs element_occurrence, dihubungkan
INSTANCE_OF) selaras IfcTypeObject vs IfcObject/IfcRelDefinesByType.
"""
from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel, Field

NodeType = Literal[
    # Project/document nodes
    "project", "document", "sheet", "view", "drawing_zone", "revision",
    # Spatial nodes
    "site", "building", "wing", "level", "zone", "grid_axis", "grid_intersection",
    "space", "room", "external_area",
    # Construction nodes
    "system", "discipline", "element_type", "element_occurrence", "assembly",
    "material", "finish", "opening", "equipment", "fixture",
    # Information nodes
    "dimension", "specification", "note", "schedule_table", "detail_reference",
    "drawing_reference", "assumption", "conflict", "missing_information",
]

VerificationStatus = Literal[
    "extracted", "ai_interpreted", "cross_sheet_inferred", "human_verified", "conflicting", "ambiguous",
]


class NodeProperty(BaseModel):
    """Satu properti bernilai dari node (§11.5 contoh `b_mm`/`h_mm`). value_source
    membedakan apakah nilai ini tertulis langsung atau hasil interpretasi AI —
    TIDAK PERNAH "calculated" (angka hasil kalkulasi bukan tugas PCKM)."""
    value: Union[str, float, int, bool]
    value_source: Literal["extracted", "ai_interpreted", "cross_sheet_inferred"] = "extracted"
    evidence_refs: list[str] = Field(default_factory=list)


class NodeSourceRef(BaseModel):
    document_id: str
    page_index: int
    sheet_id: str
    evidence_refs: list[str] = Field(default_factory=list)


class ProjectGraphNode(BaseModel):
    node_id: str
    type: NodeType
    canonical_name: str
    aliases: list[str] = Field(default_factory=list)
    properties: dict[str, NodeProperty] = Field(default_factory=dict)
    discipline: str
    verification_status: VerificationStatus
    confidence: float = Field(ge=0.0, le=1.0)
    source_refs: list[NodeSourceRef] = Field(default_factory=list)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/document-intelligence && python -m pytest tests/test_project_graph_models.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing jest test**

Create `packages/schemas/src/__tests__/schemas.test.ts` addition (append at end):

```typescript
import { ProjectGraphNodeSchema } from "../index";

describe("ProjectGraphNodeSchema", () => {
  it("parses an element_type node with typed properties", () => {
    const node = ProjectGraphNodeSchema.parse({
      node_id: "ELTYPE-COLUMN-K1",
      type: "element_type",
      canonical_name: "Kolom K1",
      aliases: ["K1", "Kol. K1"],
      properties: {
        shape: { value: "rectangular", value_source: "extracted", evidence_refs: [] },
        b_mm: { value: 300, value_source: "extracted", evidence_refs: ["EV-P049-121"] },
        h_mm: { value: 500, value_source: "extracted", evidence_refs: ["EV-P049-122"] },
      },
      discipline: "structure",
      verification_status: "ai_interpreted",
      confidence: 0.92,
      source_refs: [
        { document_id: "DOC-PLHUT-001", page_index: 48, sheet_id: "S-49", evidence_refs: ["EV-P049-121", "EV-P049-122"] },
      ],
    });

    expect(node.properties.b_mm.value).toBe(300);
    expect(node.verification_status).toBe("ai_interpreted");
  });

  it("defaults empty aliases and properties", () => {
    const node = ProjectGraphNodeSchema.parse({
      node_id: "LEVEL-01",
      type: "level",
      canonical_name: "Lantai 1",
      discipline: "general",
      verification_status: "extracted",
      confidence: 0.99,
    });

    expect(node.aliases).toEqual([]);
    expect(node.properties).toEqual({});
  });
});
```

- [ ] **Step 6: Run jest to verify it fails**

Run: `cd packages/schemas && pnpm test`
Expected: FAIL — `ProjectGraphNodeSchema` not exported

- [ ] **Step 7: Add the Zod schemas**

Append to `packages/schemas/src/index.ts` (after the DEM section's last `export type` line):

```typescript
// ─── PCKM — Project Construction Knowledge Model graph (selaras
// app/project_graph/models.py) ────────────────────────────────────────────
//
// Skema per docs/plans/drawing intelligence/
// PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md §11. PCKM adalah model
// kanonik PROYEK — node/edge dibangun dari normalisasi DEM, tidak pernah
// menyimpan angka hasil kalkulasi baru (Aturan Emas, CLAUDE.md §1).

export const NodeTypeEnum = z.enum([
  "project", "document", "sheet", "view", "drawing_zone", "revision",
  "site", "building", "wing", "level", "zone", "grid_axis", "grid_intersection",
  "space", "room", "external_area",
  "system", "discipline", "element_type", "element_occurrence", "assembly",
  "material", "finish", "opening", "equipment", "fixture",
  "dimension", "specification", "note", "schedule_table", "detail_reference",
  "drawing_reference", "assumption", "conflict", "missing_information",
]);

export const VerificationStatusEnum = z.enum([
  "extracted", "ai_interpreted", "cross_sheet_inferred", "human_verified", "conflicting", "ambiguous",
]);

export const NodePropertySchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
  value_source: z.enum(["extracted", "ai_interpreted", "cross_sheet_inferred"]).default("extracted"),
  evidence_refs: z.array(z.string()).default([]),
});

export const NodeSourceRefSchema = z.object({
  document_id: z.string(),
  page_index: z.number().int().nonnegative(),
  sheet_id: z.string(),
  evidence_refs: z.array(z.string()).default([]),
});

export const ProjectGraphNodeSchema = z.object({
  node_id: z.string(),
  type: NodeTypeEnum,
  canonical_name: z.string(),
  aliases: z.array(z.string()).default([]),
  properties: z.record(NodePropertySchema).default({}),
  discipline: z.string(),
  verification_status: VerificationStatusEnum,
  confidence: z.number().min(0).max(1),
  source_refs: z.array(NodeSourceRefSchema).default([]),
});
export type ProjectGraphNode = z.infer<typeof ProjectGraphNodeSchema>;
```

- [ ] **Step 8: Run jest to verify it passes**

Run: `cd packages/schemas && pnpm test`
Expected: PASS (all tests)

- [ ] **Step 9: Commit**

```bash
git add services/document-intelligence/app/project_graph/ services/document-intelligence/tests/test_project_graph_models.py packages/schemas/src/index.ts packages/schemas/src/__tests__/schemas.test.ts
git commit -m "feat(schemas): add PCKM graph node schema (Pydantic + Zod parity)"
```

---

### Task 5: PCKM graph edge schema + containment invariant — Pydantic + Zod + parity test

**Files:**
- Modify: `services/document-intelligence/app/project_graph/models.py`
- Modify: `services/document-intelligence/tests/test_project_graph_models.py`
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/__tests__/schemas.test.ts`

**Interfaces:**
- Consumes: `ProjectGraphNode.node_id` shape (Task 4, same module)
- Produces: `ProjectGraphEdge` (Pydantic) / `ProjectGraphEdgeSchema` (Zod), and `assert_single_located_on()` — a standalone validator function (not a Pydantic model validator, since the invariant spans a *list* of edges, not one edge in isolation) that Task 6's snapshot model calls.

This task implements the plan's IFC-informed recommendation (spec §11.4 point 2): each
`element_occurrence` node may have **at most one** active `LOCATED_ON` edge, mirroring
IFC's `IfcRelContainedInSpatialStructure` ("every element belongs to exactly one spatial
structure"). The check is a plain function over a `list[ProjectGraphEdge]` rather than a
Pydantic validator on a single edge, because the invariant is only checkable once you
have the full edge list for a node — exactly the shape Task 6's snapshot model has.

- [ ] **Step 1: Write the failing Python test**

Append to `services/document-intelligence/tests/test_project_graph_models.py`:

```python
import pytest

from app.project_graph.models import (
    ProjectGraphEdge,
    assert_single_located_on,
)


def test_project_graph_edge_accepts_instance_of_relation():
    edge = ProjectGraphEdge(
        edge_id="EDGE-001",
        source="ELOC-K1-L1-B2",
        target="ELTYPE-COLUMN-K1",
        relation="INSTANCE_OF",
        confidence_class="CROSS_SHEET_INFERRED",
        confidence=0.89,
        evidence_refs=["EV-P032-017", "EV-P049-121"],
    )

    assert edge.relation == "INSTANCE_OF"
    assert edge.confidence_class == "CROSS_SHEET_INFERRED"


def test_assert_single_located_on_passes_when_each_occurrence_has_one_location():
    edges = [
        ProjectGraphEdge(edge_id="E1", source="ELOC-K1-L1-B2", target="LEVEL-01", relation="LOCATED_ON", confidence_class="EXTRACTED", confidence=0.95),
        ProjectGraphEdge(edge_id="E2", source="ELOC-K1-L1-B2", target="ELTYPE-COLUMN-K1", relation="INSTANCE_OF", confidence_class="EXTRACTED", confidence=0.9),
        ProjectGraphEdge(edge_id="E3", source="ELOC-K2-L2-A1", target="LEVEL-02", relation="LOCATED_ON", confidence_class="EXTRACTED", confidence=0.95),
    ]

    # Should not raise — ELOC-K1-L1-B2 has exactly one LOCATED_ON (to LEVEL-01),
    # the INSTANCE_OF edge on the same node is a different relation and doesn't count.
    assert_single_located_on(edges)


def test_assert_single_located_on_raises_when_occurrence_has_two_locations():
    edges = [
        ProjectGraphEdge(edge_id="E1", source="ELOC-K1-L1-B2", target="LEVEL-01", relation="LOCATED_ON", confidence_class="EXTRACTED", confidence=0.95),
        ProjectGraphEdge(edge_id="E2", source="ELOC-K1-L1-B2", target="LEVEL-02", relation="LOCATED_ON", confidence_class="AMBIGUOUS", confidence=0.4),
    ]

    with pytest.raises(ValueError, match="ELOC-K1-L1-B2 has 2 active LOCATED_ON edges"):
        assert_single_located_on(edges)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/document-intelligence && python -m pytest tests/test_project_graph_models.py -v`
Expected: FAIL with `ImportError: cannot import name 'ProjectGraphEdge' from 'app.project_graph.models'`

- [ ] **Step 3: Add the Pydantic models**

Append to `services/document-intelligence/app/project_graph/models.py`:

```python
EdgeRelation = Literal[
    "CONTAINS", "PART_OF", "LOCATED_ON", "LOCATED_IN", "ALIGNED_TO", "DEFINED_BY",
    "DEPICTED_IN", "REFERENCES", "SAME_AS", "POSSIBLY_SAME_AS", "USES_MATERIAL",
    "HAS_FINISH", "HAS_DIMENSION", "HAS_TYPE", "INSTANCE_OF", "SERVES",
    "CONNECTED_TO", "SUPPORTED_BY", "SUPPORTS", "ADJACENT_TO", "OPENS_TO",
    "CONFLICTS_WITH", "HAS_EVIDENCE", "DERIVED_FROM", "SUPERSEDES",
    # Pola opening dua-langkah (IFC IfcRelVoidsElement/IfcRelFillsElement,
    # §11.4 validasi IFC) — dinding punya opening, opening diisi pintu/jendela.
    "HAS_OPENING", "FILLED_BY",
]

ConfidenceClass = Literal[
    "EXTRACTED", "AI_INTERPRETED", "CROSS_SHEET_INFERRED", "HUMAN_VERIFIED", "CONFLICTING", "AMBIGUOUS",
]


class EdgeResolver(BaseModel):
    method: str
    model: Optional[str] = None


class ProjectGraphEdge(BaseModel):
    edge_id: str
    source: str
    target: str
    relation: EdgeRelation
    confidence_class: ConfidenceClass
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_refs: list[str] = Field(default_factory=list)
    resolver: Optional[EdgeResolver] = None


def assert_single_located_on(edges: list[ProjectGraphEdge]) -> None:
    """Invariant IFC-informed (§11.4 validasi standar industri, poin 2):
    setiap element_occurrence hanya boleh punya SATU edge LOCATED_ON aktif,
    mirip IfcRelContainedInSpatialStructure ("setiap elemen hanya di SATU
    level struktur spasial"). Tanpa aturan ini, query "elemen apa di lantai
    2" berisiko ambigu. Raises ValueError kalau invariant dilanggar — dipanggil
    snapshot validator (Task 6), bukan divalidasi per-edge saat construction,
    karena butuh melihat seluruh daftar edge sekaligus."""
    located_on_count: dict[str, int] = {}
    for edge in edges:
        if edge.relation == "LOCATED_ON":
            located_on_count[edge.source] = located_on_count.get(edge.source, 0) + 1

    for node_id, count in located_on_count.items():
        if count > 1:
            raise ValueError(f"{node_id} has {count} active LOCATED_ON edges (max 1 allowed)")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/document-intelligence && python -m pytest tests/test_project_graph_models.py -v`
Expected: PASS (5 tests total)

- [ ] **Step 5: Write the failing jest test**

Append to `packages/schemas/src/__tests__/schemas.test.ts`:

```typescript
import { ProjectGraphEdgeSchema } from "../index";

describe("ProjectGraphEdgeSchema", () => {
  it("parses an INSTANCE_OF relation with cross-sheet-inferred confidence", () => {
    const edge = ProjectGraphEdgeSchema.parse({
      edge_id: "EDGE-001",
      source: "ELOC-K1-L1-B2",
      target: "ELTYPE-COLUMN-K1",
      relation: "INSTANCE_OF",
      confidence_class: "CROSS_SHEET_INFERRED",
      confidence: 0.89,
      evidence_refs: ["EV-P032-017", "EV-P049-121"],
    });

    expect(edge.relation).toBe("INSTANCE_OF");
    expect(edge.confidence_class).toBe("CROSS_SHEET_INFERRED");
  });

  it("accepts the two-step opening pattern relations", () => {
    const voids = ProjectGraphEdgeSchema.parse({
      edge_id: "EDGE-010", source: "WALL-01", target: "OPENING-01",
      relation: "HAS_OPENING", confidence_class: "EXTRACTED", confidence: 0.9,
    });
    const fills = ProjectGraphEdgeSchema.parse({
      edge_id: "EDGE-011", source: "OPENING-01", target: "DOOR-P1",
      relation: "FILLED_BY", confidence_class: "EXTRACTED", confidence: 0.9,
    });

    expect(voids.relation).toBe("HAS_OPENING");
    expect(fills.relation).toBe("FILLED_BY");
  });
});
```

- [ ] **Step 6: Run jest to verify it fails**

Run: `cd packages/schemas && pnpm test`
Expected: FAIL — `ProjectGraphEdgeSchema` not exported

- [ ] **Step 7: Add the Zod schema**

Append to `packages/schemas/src/index.ts` (after `ProjectGraphNodeSchema`'s `export type` line):

```typescript
export const EdgeRelationEnum = z.enum([
  "CONTAINS", "PART_OF", "LOCATED_ON", "LOCATED_IN", "ALIGNED_TO", "DEFINED_BY",
  "DEPICTED_IN", "REFERENCES", "SAME_AS", "POSSIBLY_SAME_AS", "USES_MATERIAL",
  "HAS_FINISH", "HAS_DIMENSION", "HAS_TYPE", "INSTANCE_OF", "SERVES",
  "CONNECTED_TO", "SUPPORTED_BY", "SUPPORTS", "ADJACENT_TO", "OPENS_TO",
  "CONFLICTS_WITH", "HAS_EVIDENCE", "DERIVED_FROM", "SUPERSEDES",
  "HAS_OPENING", "FILLED_BY",
]);

export const ConfidenceClassEnum = z.enum([
  "EXTRACTED", "AI_INTERPRETED", "CROSS_SHEET_INFERRED", "HUMAN_VERIFIED", "CONFLICTING", "AMBIGUOUS",
]);

export const EdgeResolverSchema = z.object({
  method: z.string(),
  model: z.string().nullish(),
});

export const ProjectGraphEdgeSchema = z.object({
  edge_id: z.string(),
  source: z.string(),
  target: z.string(),
  relation: EdgeRelationEnum,
  confidence_class: ConfidenceClassEnum,
  confidence: z.number().min(0).max(1),
  evidence_refs: z.array(z.string()).default([]),
  resolver: EdgeResolverSchema.nullish(),
});
export type ProjectGraphEdge = z.infer<typeof ProjectGraphEdgeSchema>;
```

- [ ] **Step 8: Run jest to verify it passes**

Run: `cd packages/schemas && pnpm test`
Expected: PASS (all tests)

- [ ] **Step 9: Commit**

```bash
git add services/document-intelligence/app/project_graph/models.py services/document-intelligence/tests/test_project_graph_models.py packages/schemas/src/index.ts packages/schemas/src/__tests__/schemas.test.ts
git commit -m "feat(schemas): add PCKM graph edge schema + LOCATED_ON containment invariant"
```

---

### Task 6: PCKM graph snapshot schema — Pydantic + Zod + parity test

**Files:**
- Modify: `services/document-intelligence/app/project_graph/models.py`
- Modify: `services/document-intelligence/tests/test_project_graph_models.py`
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/__tests__/schemas.test.ts`

**Interfaces:**
- Consumes: `ProjectGraphNode` (Task 4), `ProjectGraphEdge` + `assert_single_located_on` (Task 5)
- Produces: `ProjectGraphSnapshot` (Pydantic, with a `model_validator` that calls `assert_single_located_on`) / `ProjectGraphSnapshotSchema` (Zod). This is the top-level PCKM shape Phase 3 (PCKM synthesis engine, future plan) will build and Phase 4 (retrieval service, future plan) will query.

- [ ] **Step 1: Write the failing Python test**

Append to `services/document-intelligence/tests/test_project_graph_models.py`:

```python
import pytest
from pydantic import ValidationError

from app.project_graph.models import ProjectGraphSnapshot


def _make_valid_snapshot_kwargs() -> dict:
    return dict(
        schema_version="paax.pckm.graph.v1",
        project_id="PRJ-001",
        snapshot_id="PGS-001",
        document_ids=["DOC-PLHUT-001"],
        dem_run_ids=["DEMRUN-20260714-001"],
        page_count=88,
        nodes=[
            ProjectGraphNode(node_id="ELTYPE-COLUMN-K1", type="element_type", canonical_name="Kolom K1", discipline="structure", verification_status="extracted", confidence=0.9),
            ProjectGraphNode(node_id="LEVEL-01", type="level", canonical_name="Lantai 1", discipline="general", verification_status="extracted", confidence=0.99),
        ],
        edges=[
            ProjectGraphEdge(edge_id="E1", source="ELTYPE-COLUMN-K1", target="LEVEL-01", relation="LOCATED_ON", confidence_class="EXTRACTED", confidence=0.9),
        ],
    )


def test_project_graph_snapshot_accepts_valid_graph():
    from app.project_graph.models import ProjectGraphEdge, ProjectGraphNode

    snapshot = ProjectGraphSnapshot(**_make_valid_snapshot_kwargs())

    assert snapshot.snapshot_id == "PGS-001"
    assert len(snapshot.nodes) == 2
    assert snapshot.aliases == []
    assert snapshot.conflicts == []


def test_project_graph_snapshot_rejects_duplicate_located_on():
    from app.project_graph.models import ProjectGraphEdge, ProjectGraphNode

    kwargs = _make_valid_snapshot_kwargs()
    kwargs["edges"] = [
        ProjectGraphEdge(edge_id="E1", source="ELTYPE-COLUMN-K1", target="LEVEL-01", relation="LOCATED_ON", confidence_class="EXTRACTED", confidence=0.9),
        ProjectGraphEdge(edge_id="E2", source="ELTYPE-COLUMN-K1", target="LEVEL-02", relation="LOCATED_ON", confidence_class="AMBIGUOUS", confidence=0.3),
    ]

    with pytest.raises(ValidationError, match="active LOCATED_ON edges"):
        ProjectGraphSnapshot(**kwargs)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/document-intelligence && python -m pytest tests/test_project_graph_models.py -v`
Expected: FAIL with `ImportError: cannot import name 'ProjectGraphSnapshot' from 'app.project_graph.models'`

- [ ] **Step 3: Add the Pydantic model**

Add this import at the top of `services/document-intelligence/app/project_graph/models.py`, replacing the existing `from pydantic import BaseModel, Field` line:

```python
from pydantic import BaseModel, Field, model_validator
```

Append to the end of the file:

```python
class ProjectGraphSnapshot(BaseModel):
    """Top-level PCKM (§11.2 schema utama). project_summary/communities/aliases/
    conflicts/missing_information/indexes/quality tetap sebagai field-field
    terpisah (belum semua diisi di Phase 1 — schema-only, lihat exit criteria
    plan §Phase 1: 'no provider integration yet'), tapi dideklarasikan sekarang
    supaya Phase 3 (synthesis engine) tidak perlu migrasi schema lagi nanti."""
    schema_version: Literal["paax.pckm.graph.v1"] = "paax.pckm.graph.v1"
    project_id: str
    snapshot_id: str
    document_ids: list[str] = Field(default_factory=list)
    dem_run_ids: list[str] = Field(default_factory=list)
    page_count: int = 0
    nodes: list[ProjectGraphNode] = Field(default_factory=list)
    edges: list[ProjectGraphEdge] = Field(default_factory=list)
    communities: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_located_on_invariant(self) -> "ProjectGraphSnapshot":
        assert_single_located_on(self.edges)
        return self
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/document-intelligence && python -m pytest tests/test_project_graph_models.py -v`
Expected: PASS (7 tests total)

- [ ] **Step 5: Write the failing jest test**

Append to `packages/schemas/src/__tests__/schemas.test.ts`:

```typescript
import { ProjectGraphSnapshotSchema } from "../index";

describe("ProjectGraphSnapshotSchema", () => {
  const validSnapshot = {
    schema_version: "paax.pckm.graph.v1",
    project_id: "PRJ-001",
    snapshot_id: "PGS-001",
    document_ids: ["DOC-PLHUT-001"],
    dem_run_ids: ["DEMRUN-20260714-001"],
    page_count: 88,
    nodes: [
      { node_id: "ELTYPE-COLUMN-K1", type: "element_type", canonical_name: "Kolom K1", discipline: "structure", verification_status: "extracted", confidence: 0.9 },
      { node_id: "LEVEL-01", type: "level", canonical_name: "Lantai 1", discipline: "general", verification_status: "extracted", confidence: 0.99 },
    ],
    edges: [
      { edge_id: "E1", source: "ELTYPE-COLUMN-K1", target: "LEVEL-01", relation: "LOCATED_ON", confidence_class: "EXTRACTED", confidence: 0.9 },
    ],
  };

  it("parses a valid snapshot", () => {
    const snapshot = ProjectGraphSnapshotSchema.parse(validSnapshot);
    expect(snapshot.snapshot_id).toBe("PGS-001");
    expect(snapshot.nodes).toHaveLength(2);
  });

  // Note: unlike the Pydantic side (Task 6 Step 3), Zod's base .object() does not
  // itself enforce the LOCATED_ON containment invariant — Zod has no direct
  // equivalent of Pydantic's cross-field model_validator without a .superRefine()
  // call, and this phase intentionally keeps the Zod schema a pure shape check.
  // The invariant is enforced authoritatively on the Python/backend side (Task 6),
  // which is where snapshots are actually constructed; the TS side only ever reads
  // already-validated snapshots. Documented here, not silently skipped.
  it("does NOT enforce the LOCATED_ON invariant on the TS side (documented asymmetry)", () => {
    const withDuplicateLocatedOn = {
      ...validSnapshot,
      edges: [
        { edge_id: "E1", source: "ELTYPE-COLUMN-K1", target: "LEVEL-01", relation: "LOCATED_ON", confidence_class: "EXTRACTED", confidence: 0.9 },
        { edge_id: "E2", source: "ELTYPE-COLUMN-K1", target: "LEVEL-02", relation: "LOCATED_ON", confidence_class: "AMBIGUOUS", confidence: 0.3 },
      ],
    };

    expect(() => ProjectGraphSnapshotSchema.parse(withDuplicateLocatedOn)).not.toThrow();
  });
});
```

- [ ] **Step 6: Run jest to verify it fails**

Run: `cd packages/schemas && pnpm test`
Expected: FAIL — `ProjectGraphSnapshotSchema` not exported

- [ ] **Step 7: Add the Zod schema**

Append to `packages/schemas/src/index.ts` (after `ProjectGraphEdgeSchema`'s `export type` line):

```typescript
export const ProjectGraphSnapshotSchema = z.object({
  schema_version: z.literal("paax.pckm.graph.v1").default("paax.pckm.graph.v1"),
  project_id: z.string(),
  snapshot_id: z.string(),
  document_ids: z.array(z.string()).default([]),
  dem_run_ids: z.array(z.string()).default([]),
  page_count: z.number().int().nonnegative().default(0),
  nodes: z.array(ProjectGraphNodeSchema).default([]),
  edges: z.array(ProjectGraphEdgeSchema).default([]),
  communities: z.array(z.string()).default([]),
  aliases: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
  missing_information: z.array(z.string()).default([]),
});
export type ProjectGraphSnapshot = z.infer<typeof ProjectGraphSnapshotSchema>;
```

- [ ] **Step 8: Run jest to verify it passes**

Run: `cd packages/schemas && pnpm test`
Expected: PASS (all tests)

- [ ] **Step 9: Commit**

```bash
git add services/document-intelligence/app/project_graph/models.py services/document-intelligence/tests/test_project_graph_models.py packages/schemas/src/index.ts packages/schemas/src/__tests__/schemas.test.ts
git commit -m "feat(schemas): add PCKM graph snapshot schema with containment invariant validator"
```

---

### Task 7: Command Room query plan + grounded answer schema — Pydantic + Zod + parity test

**Files:**
- Modify: `services/document-intelligence/app/project_graph/models.py`
- Modify: `services/document-intelligence/tests/test_project_graph_models.py`
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/__tests__/schemas.test.ts`

**Interfaces:**
- Consumes: nothing new (uses only `str`/primitive fields — query plan and answer contract reference node/edge IDs as strings, not typed objects, since retrieval Phase 4 hasn't been designed yet)
- Produces: `GraphQueryPlan`, `GroundedAnswer` (Pydantic) / matching Zod schemas. Phase 4 (retrieval service) and Phase 5 (Command Room integration) — both future plans — consume these directly.

This is the last schema pair for Phase 1 — it covers spec §16.4 (structured query plan)
and §18 (answer contract), which is everything Phase 1's exit criteria needs
("schema tests green, no provider integration yet").

- [ ] **Step 1: Write the failing Python test**

Append to `services/document-intelligence/tests/test_project_graph_models.py`:

```python
from app.project_graph.models import Citation, GraphQueryPlan, GroundedAnswer, RetrievalTrace


def test_graph_query_plan_accepts_element_lookup_intent():
    plan = GraphQueryPlan(
        intent="ELEMENT_LOOKUP",
        project_id="PRJ-001",
        entities=[{"type": "element_type", "value": "K1"}],
        filters={"level": None, "discipline": "structure"},
        relations=["INSTANCE_OF", "LOCATED_ON", "DEFINED_BY", "DEPICTED_IN"],
        traversal_mode="bfs",
        traversal_depth=2,
        budget_tokens=1400,
    )

    assert plan.intent == "ELEMENT_LOOKUP"
    assert plan.traversal_mode == "bfs"
    assert "INSTANCE_OF" in plan.relations


def test_grounded_answer_carries_citations_and_retrieval_trace():
    answer = GroundedAnswer(
        answer="Kolom K1 ditemukan di lantai 1, grid B3.",
        citations=[
            Citation(citation_id="C1", document_id="DOC-PLHUT-001", sheet_id="S-49", page_number=49, title="Detail Kolom", evidence_ids=["EV-P049-121"]),
        ],
        data_status="grounded",
        confidence=0.91,
        missing_data=[],
        conflicts=[],
        retrieval_trace=RetrievalTrace(intent="ELEMENT_LOOKUP", seed_node_ids=["ELTYPE-COLUMN-K1"], node_count=8, edge_count=11, context_token_estimate=1120),
    )

    assert answer.data_status == "grounded"
    assert answer.citations[0].page_number == 49
    assert answer.retrieval_trace.context_token_estimate == 1120
    # Golden Rule: GroundedAnswer never carries a computed RAB/volume number —
    # only text, citations, and a confidence score about the retrieval itself.
    assert not hasattr(answer, "computed_volume_m3")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/document-intelligence && python -m pytest tests/test_project_graph_models.py -v`
Expected: FAIL with `ImportError: cannot import name 'GraphQueryPlan' from 'app.project_graph.models'`

- [ ] **Step 3: Add the Pydantic models**

Append to `services/document-intelligence/app/project_graph/models.py`:

```python
QueryIntent = Literal[
    "GENERAL_CHAT", "PROJECT_OVERVIEW", "DIRECT_FACT", "LIST_FILTER", "NODE_EXPLAIN",
    "RELATIONSHIP", "PATH_QUERY", "SHEET_LOOKUP", "SPACE_LOOKUP", "ELEMENT_LOOKUP",
    "MATERIAL_LOOKUP", "CONFLICT_LOOKUP", "MISSING_DATA", "NUMERIC_STORED_FACT",
    "CALCULATION_REQUIRED", "RAB_QUERY", "SCHEDULE_QUERY",
]


class QueryEntity(BaseModel):
    type: str
    value: str


class GraphQueryPlan(BaseModel):
    """§16.4 structured query plan. traversal_mode/depth diisi query expansion
    (Phase 4, belum dibangun) — Phase 1 hanya mendefinisikan bentuknya."""
    intent: QueryIntent
    project_id: str
    entities: list[QueryEntity] = Field(default_factory=list)
    filters: dict[str, Optional[str]] = Field(default_factory=dict)
    relations: list[str] = Field(default_factory=list)
    traversal_mode: Literal["bfs", "dfs", "shortest_path", "direct_lookup"] = "bfs"
    traversal_depth: int = 2
    budget_tokens: int = 1400


class Citation(BaseModel):
    citation_id: str
    document_id: str
    sheet_id: str
    page_number: int
    title: str
    evidence_ids: list[str] = Field(default_factory=list)


class RetrievalTrace(BaseModel):
    intent: QueryIntent
    seed_node_ids: list[str] = Field(default_factory=list)
    node_count: int = 0
    edge_count: int = 0
    context_token_estimate: int = 0


class GroundedAnswer(BaseModel):
    """§18 answer contract. Command Room (Phase 5, belum dibangun) mengisi ini
    dari hasil retrieval — LLM tidak pernah menulis angka RAB/volume ke sini,
    hanya teks jawaban + citation + confidence tentang KUALITAS RETRIEVAL-nya
    sendiri (bukan kepastian angka teknis)."""
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    data_status: Literal["grounded", "partial", "ungrounded", "not_ready"] = "grounded"
    confidence: float = Field(ge=0.0, le=1.0)
    missing_data: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    retrieval_trace: RetrievalTrace
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/document-intelligence && python -m pytest tests/test_project_graph_models.py -v`
Expected: PASS (9 tests total)

- [ ] **Step 5: Run the FULL document-intelligence test suite to confirm no regressions**

Run: `cd services/document-intelligence && python -m pytest -q`
Expected: PASS — all pre-existing tests plus the 9 new ones in `test_transcription_models.py` + `test_project_graph_models.py`, zero failures.

- [ ] **Step 6: Write the failing jest test**

Append to `packages/schemas/src/__tests__/schemas.test.ts`:

```typescript
import { GraphQueryPlanSchema, GroundedAnswerSchema } from "../index";

describe("GraphQueryPlanSchema", () => {
  it("parses an ELEMENT_LOOKUP intent with BFS traversal", () => {
    const plan = GraphQueryPlanSchema.parse({
      intent: "ELEMENT_LOOKUP",
      project_id: "PRJ-001",
      entities: [{ type: "element_type", value: "K1" }],
      filters: { level: null, discipline: "structure" },
      relations: ["INSTANCE_OF", "LOCATED_ON", "DEFINED_BY", "DEPICTED_IN"],
      traversal_mode: "bfs",
      traversal_depth: 2,
      budget_tokens: 1400,
    });

    expect(plan.intent).toBe("ELEMENT_LOOKUP");
    expect(plan.relations).toContain("INSTANCE_OF");
  });
});

describe("GroundedAnswerSchema", () => {
  it("carries citations and a retrieval trace", () => {
    const answer = GroundedAnswerSchema.parse({
      answer: "Kolom K1 ditemukan di lantai 1, grid B3.",
      citations: [
        { citation_id: "C1", document_id: "DOC-PLHUT-001", sheet_id: "S-49", page_number: 49, title: "Detail Kolom", evidence_ids: ["EV-P049-121"] },
      ],
      data_status: "grounded",
      confidence: 0.91,
      missing_data: [],
      conflicts: [],
      retrieval_trace: { intent: "ELEMENT_LOOKUP", seed_node_ids: ["ELTYPE-COLUMN-K1"], node_count: 8, edge_count: 11, context_token_estimate: 1120 },
    });

    expect(answer.data_status).toBe("grounded");
    expect(answer.citations[0].page_number).toBe(49);
  });
});
```

- [ ] **Step 7: Run jest to verify it fails**

Run: `cd packages/schemas && pnpm test`
Expected: FAIL — `GraphQueryPlanSchema`/`GroundedAnswerSchema` not exported

- [ ] **Step 8: Add the Zod schemas**

Append to `packages/schemas/src/index.ts` (after `ProjectGraphSnapshotSchema`'s `export type` line):

```typescript
export const QueryIntentEnum = z.enum([
  "GENERAL_CHAT", "PROJECT_OVERVIEW", "DIRECT_FACT", "LIST_FILTER", "NODE_EXPLAIN",
  "RELATIONSHIP", "PATH_QUERY", "SHEET_LOOKUP", "SPACE_LOOKUP", "ELEMENT_LOOKUP",
  "MATERIAL_LOOKUP", "CONFLICT_LOOKUP", "MISSING_DATA", "NUMERIC_STORED_FACT",
  "CALCULATION_REQUIRED", "RAB_QUERY", "SCHEDULE_QUERY",
]);

export const QueryEntitySchema = z.object({
  type: z.string(),
  value: z.string(),
});

export const GraphQueryPlanSchema = z.object({
  intent: QueryIntentEnum,
  project_id: z.string(),
  entities: z.array(QueryEntitySchema).default([]),
  filters: z.record(z.string().nullable()).default({}),
  relations: z.array(z.string()).default([]),
  traversal_mode: z.enum(["bfs", "dfs", "shortest_path", "direct_lookup"]).default("bfs"),
  traversal_depth: z.number().int().nonnegative().default(2),
  budget_tokens: z.number().int().positive().default(1400),
});
export type GraphQueryPlan = z.infer<typeof GraphQueryPlanSchema>;

export const CitationSchema = z.object({
  citation_id: z.string(),
  document_id: z.string(),
  sheet_id: z.string(),
  page_number: z.number().int().positive(),
  title: z.string(),
  evidence_ids: z.array(z.string()).default([]),
});

export const RetrievalTraceSchema = z.object({
  intent: QueryIntentEnum,
  seed_node_ids: z.array(z.string()).default([]),
  node_count: z.number().int().nonnegative().default(0),
  edge_count: z.number().int().nonnegative().default(0),
  context_token_estimate: z.number().int().nonnegative().default(0),
});

export const GroundedAnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(CitationSchema).default([]),
  data_status: z.enum(["grounded", "partial", "ungrounded", "not_ready"]).default("grounded"),
  confidence: z.number().min(0).max(1),
  missing_data: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
  retrieval_trace: RetrievalTraceSchema,
});
export type GroundedAnswer = z.infer<typeof GroundedAnswerSchema>;
```

- [ ] **Step 9: Run jest to verify it passes**

Run: `cd packages/schemas && pnpm test`
Expected: PASS (all tests)

- [ ] **Step 10: Run the full schemas package build to confirm no TypeScript errors**

Run: `cd packages/schemas && pnpm run typecheck`
Expected: PASS, zero errors — confirms every new export is correctly typed and doesn't break `dist/index.d.ts` generation.

- [ ] **Step 11: Commit**

```bash
git add services/document-intelligence/app/project_graph/models.py services/document-intelligence/tests/test_project_graph_models.py packages/schemas/src/index.ts packages/schemas/src/__tests__/schemas.test.ts
git commit -m "feat(schemas): add Command Room query plan + grounded answer schema (Pydantic + Zod parity)"
```

---

### Task 8: Full-suite verification and root test wiring

**Files:**
- Modify: `package.json` (root)

**Interfaces:**
- Consumes: everything from Tasks 1-7
- Produces: nothing — this is the plan's final verification gate

The root `pnpm test` script currently only runs `test:core` (core-engine) and
`test:schemas` (packages/schemas) — it never runs `services/document-intelligence`'s
pytest suite, even though this plan added tests there. This gap already existed before
this plan (document-intelligence tests are run manually per the `dev:doc-intel` script
convention), but Phase 1 is exactly the moment to close it, since Phase 2 (DEM job
orchestrator, next plan) will add many more document-intelligence tests that also need
to run in CI/on every `pnpm test`.

- [ ] **Step 1: Add document-intelligence to the root test script**

In `package.json`, change:

```json
    "test": "pnpm run test:core && pnpm run test:schemas",
```

to:

```json
    "test": "pnpm run test:core && pnpm run test:doc-intel && pnpm run test:schemas",
```

and add a new script entry immediately after `"test:core"`:

```json
    "test:doc-intel": "cd services/document-intelligence && python -m pytest -q",
```

- [ ] **Step 2: Run the full root test suite**

Run: `pnpm test`
Expected: PASS — `test:core` (core-engine, pre-existing, unaffected by this plan), `test:doc-intel` (document-intelligence, includes the 9 new tests from Tasks 2-7 plus all pre-existing perception tests), `test:schemas` (packages/schemas jest, includes the 12 new tests from Tasks 2-7 plus all pre-existing RAB/HSP/CPM/TKG tests) — all green, in that order.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: wire document-intelligence pytest into root pnpm test"
```

---

## Self-Review

**1. Spec coverage** — Phase 0 (§31 "Phase 0 — Architecture Freeze and Audit") is covered by Task 1 (ADR + state doc refresh; the original 3-deliverable list was trimmed to what Task 2-7's File Structure section already documents, avoiding a duplicate "schema gap report"). Phase 1 (§31 "Phase 1 — Shared Schemas", 10 sub-items) is covered: "Tambah schema DEM" → Task 2, "Tambah manifest" → Task 3, "Tambah continuation patch" → Task 3, "Tambah graph node/edge" → Tasks 4-5, "Tambah snapshot" → Task 6, "Tambah query plan/result" → Task 7 (`GraphQueryPlan`), "Tambah grounded answer" → Task 7 (`GroundedAnswer`), "Zod/Pydantic parity" → every task's Steps 5-8, "Fixture" → the example payloads inside every test (kept byte-for-byte identical between the pytest and jest side per each task's Step 5 comment), "Tests" → every task's pytest+jest pair. Phase 1 exit criteria ("schema tests green, no provider integration yet") is Task 8's verification gate — no HTTP client, no model call, no DB write appears anywhere in Tasks 1-8.

**2. Placeholder scan** — no `TODO`/`TBD`/"implement later" strings anywhere in the code blocks. Every step shows complete, runnable code. The one field left genuinely empty per design (`ProjectGraphSnapshot.communities`/`missing_information` defaulting to `[]`) is documented in Task 6 Step 3's docstring as intentional ("belum semua diisi di Phase 1... tapi dideklarasikan sekarang supaya Phase 3 tidak perlu migrasi schema lagi"), not a vague gap.

**3. Type consistency** — cross-checked field names used across tasks: `evidence_refs` (not `evidenceRefs`/`evidence_ids` inconsistently — `Citation.evidence_ids` in Task 7 is deliberately different because it names citation-level evidence, not a general fact's evidence trail; kept distinct on purpose, not a typo), `confidence` bounded `Field(ge=0.0, le=1.0)` / `z.number().min(0).max(1)` used identically in every task, `node_id`/`edge_id`/`document_id`/`page_index` naming held constant from Task 2 through Task 7. `assert_single_located_on` (Task 5) is called by name, unchanged, in Task 6's `model_validator` — verified no signature drift between definition and call site.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-14-dem-pckm-phase0-1-schemas.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
