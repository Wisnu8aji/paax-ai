"""
PAAX Document Intelligence - Drawing Evidence Model (DEM).

Skema per docs/plans/drawing intelligence/
PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md §6 (Drawing Evidence Model).
Paritas Zod di packages/schemas/src/index.ts (blok "DEM - Drawing Evidence Model").

DEM adalah transkrip evidence PER HALAMAN. Tidak menyimpulkan bentuk bangunan
global, tidak menggabungkan kode antar halaman, tidak menghitung volume/BOQ/RAB.
Setiap fakta penting WAJIB punya evidence_refs + confidence + status - angka
hasil kalkulasi (mis. luas dari dimensi) TIDAK PERNAH muncul di sini, itu
tugas services/core-engine (Aturan Emas proyek).
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
    """Fakta hasil klasifikasi AI (bukan tertulis langsung) - punya status, bukan raw text (§6.4 discipline)."""
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
    tables/materials/notes/references/patterns/geometry_descriptions) -
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


class PageManifestEntry(BaseModel):
    """Status satu halaman dalam page-loop (§7.3 state machine spec).
    input_hash membuat idempotency key (§7.6) - kalau document_hash+page_index+
    input_hash+prompt_version+model_alias sama dan result valid sudah ada,
    jangan panggil model ulang."""
    page_index: int
    status: Literal["queued", "rendering", "calling_model", "complete", "retry_wait", "failed"]
    attempt_count: int = 0
    input_hash: Optional[str] = None
    error: Optional[str] = None


class DocumentManifest(BaseModel):
    """Manifest per-dokumen untuk resume (§7.7) - page 1-46 complete, page 47
    failed/interrupted, page 48-88 queued: resume mulai dari task non-terminal,
    TIDAK mengulang halaman complete."""
    document_id: str
    document_hash: str
    total_pages: int
    pages: list[PageManifestEntry] = Field(default_factory=list)


class ContinuationPatch(BaseModel):
    """Hasil continuation ketika satu halaman kehabisan token di tengah section
    (§8.3). base_result_hash mencegah patch diterapkan ke versi salah - server
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
