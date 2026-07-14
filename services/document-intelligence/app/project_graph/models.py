"""
PAAX Document Intelligence - Project Construction Knowledge Model (PCKM) graph.

Skema per docs/plans/drawing intelligence/
PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md Section 11 (node/edge contract).
Paritas Zod di packages/schemas/src/index.ts (blok "PCKM - Project Construction
Knowledge Model graph").

PCKM adalah model kanonik PROYEK (bukan per-halaman seperti DEM) - dibangun
dengan MENORMALISASI dan MENGHUBUNGKAN DEM records, bukan menyimpan hasil
kalkulasi baru. Setiap node/edge tetap membawa evidence_refs balik ke DEM
asalnya (Aturan Emas, CLAUDE.md Section 1 - PCKM tidak pernah menghitung).

Taksonomi node_type/edge relation divalidasi terhadap skema industri IFC
(IfcOpenShell, dipelajari sbg referensi taksonomi, bukan dependency) - pola
Type-vs-Occurrence PCKM (element_type vs element_occurrence, dihubungkan
INSTANCE_OF) selaras IfcTypeObject vs IfcObject/IfcRelDefinesByType.
"""
from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel, Field, model_validator

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
    """Satu properti bernilai dari node (Section 11.5 contoh `b_mm`/`h_mm`). value_source
    membedakan apakah nilai ini tertulis langsung atau hasil interpretasi AI -
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


EdgeRelation = Literal[
    "CONTAINS", "PART_OF", "LOCATED_ON", "LOCATED_IN", "ALIGNED_TO", "DEFINED_BY",
    "DEPICTED_IN", "REFERENCES", "SAME_AS", "POSSIBLY_SAME_AS", "USES_MATERIAL",
    "HAS_FINISH", "HAS_DIMENSION", "HAS_TYPE", "INSTANCE_OF", "SERVES",
    "CONNECTED_TO", "SUPPORTED_BY", "SUPPORTS", "ADJACENT_TO", "OPENS_TO",
    "CONFLICTS_WITH", "HAS_EVIDENCE", "DERIVED_FROM", "SUPERSEDES",
    # Pola opening dua-langkah (IFC IfcRelVoidsElement/IfcRelFillsElement,
    # Section 11.4 validasi IFC) - dinding punya opening, opening diisi pintu/jendela.
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
    """Invariant IFC-informed (Section 11.4 validasi standar industri, poin 2):
    setiap element_occurrence hanya boleh punya SATU edge LOCATED_ON aktif,
    mirip IfcRelContainedInSpatialStructure ("setiap elemen hanya di SATU
    level struktur spasial"). Tanpa aturan ini, query "elemen apa di lantai
    2" berisiko ambigu. Raises ValueError kalau invariant dilanggar - dipanggil
    snapshot validator (Task 6), bukan divalidasi per-edge saat construction,
    karena butuh melihat seluruh daftar edge sekaligus."""
    located_on_count: dict[str, int] = {}
    for edge in edges:
        if edge.relation == "LOCATED_ON":
            located_on_count[edge.source] = located_on_count.get(edge.source, 0) + 1

    for node_id, count in located_on_count.items():
        if count > 1:
            raise ValueError(f"{node_id} has {count} active LOCATED_ON edges")


class ProjectGraphSnapshot(BaseModel):
    """Top-level PCKM (Section 11.2 schema utama). project_summary/communities/aliases/
    conflicts/missing_information/indexes/quality tetap sebagai field-field
    terpisah (belum semua diisi di Phase 1 - schema-only, lihat exit criteria
    plan Phase 1: 'no provider integration yet'), tapi dideklarasikan sekarang
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
    """Section 16.4 structured query plan. traversal_mode/depth diisi query expansion
    (Phase 4, belum dibangun) - Phase 1 hanya mendefinisikan bentuknya."""
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
    """Section 18 answer contract. Command Room (Phase 5, belum dibangun) mengisi ini
    dari hasil retrieval - LLM tidak pernah menulis angka RAB/volume ke sini,
    hanya teks jawaban + citation + confidence tentang KUALITAS RETRIEVAL-nya
    sendiri (bukan kepastian angka teknis)."""
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    data_status: Literal["grounded", "partial", "ungrounded", "not_ready"] = "grounded"
    confidence: float = Field(ge=0.0, le=1.0)
    missing_data: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    retrieval_trace: RetrievalTrace
