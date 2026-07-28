from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


CoordinateSpace = Literal["pdf_point", "normalized", "pixel"]
ZoneType = Literal[
    "drawing", "title_block", "legend", "schedule", "notes", "stamp", "image", "unknown"
]
Modality = Literal["vector", "hybrid", "raster"]
DetectionStatus = Literal["candidate", "needs_review", "accepted", "rejected"]
MaturityStatus = Literal[
    "observed", "classified", "geometry_ready", "review_ready",
    "system_confirmed", "human_confirmed", "ready_for_calculation",
    "calculated", "accepted", "blocked"
]
DrawingType = Literal[
    "cover", "drawing_list", "technical_note", "legend", "site_plan", "floor_plan", "roof_plan", "elevation", "section",
    "finish_plan", "ceiling_plan", "door_window_plan", "partition_plan", "detail",
    "foundation_plan", "column_plan", "beam_plan", "slab_plan", "schedule",
    "lighting_plan", "power_plan", "single_line_diagram", "lightning_protection",
    "fire_safety_plan", "hvac_plan", "plumbing_plan", "drainage_plan", "schematic",
    "general_arrangement", "bridge_plan", "road_plan_profile", "cross_section",
    "reinforcement_detail", "unknown",
]


class SheetClassificationKey(str, Enum):
    COVER = "cover"
    DRAWING_LIST = "drawing_list"
    SITE_PLAN = "site_plan"
    PLAN = "plan"
    ELEVATION = "elevation"
    SECTION = "section"
    DETAIL = "detail"
    SCHEDULE = "schedule"
    DIAGRAM = "diagram"
    TECHNICAL_NOTE = "technical_note"
    UNKNOWN = "unknown"


class SheetViewStatus(str, Enum):
    CLASSIFIED = "classified"
    NEEDS_REVIEW = "needs_review"


class SheetViewEntry(BaseModel):
    page_index: int = Field(ge=0)
    page_number: int = Field(ge=1)
    level_key: str = Field(min_length=1)
    classification_key: SheetClassificationKey
    evidence_refs: list[str] = Field(default_factory=list)
    status: SheetViewStatus
    review_reason: str | None = None

    @model_validator(mode="after")
    def require_immutable_page_number(self) -> "SheetViewEntry":
        if self.page_number != self.page_index + 1:
            raise ValueError("page_number must equal page_index plus one")
        if self.status == SheetViewStatus.NEEDS_REVIEW and not self.review_reason:
            raise ValueError("needs_review sheet entry requires review_reason")
        if self.status == SheetViewStatus.CLASSIFIED and self.review_reason is not None:
            raise ValueError("classified sheet entry cannot carry review_reason")
        return self


class SheetViews(BaseModel):
    level: list[SheetViewEntry] = Field(default_factory=list)
    classification: list[SheetViewEntry] = Field(default_factory=list)
    source: list[SheetViewEntry] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_same_immutable_pages(self) -> "SheetViews":
        views = {
            "level": self.level,
            "classification": self.classification,
            "source": self.source,
        }
        indexed: dict[str, dict[int, SheetViewEntry]] = {}
        for name, entries in views.items():
            page_map: dict[int, SheetViewEntry] = {}
            for entry in entries:
                if entry.page_index in page_map:
                    raise ValueError(f"{name} view contains duplicate page_index {entry.page_index}")
                page_map[entry.page_index] = entry
            indexed[name] = page_map

        identity_sets = {name: set(page_map) for name, page_map in indexed.items()}
        if not (identity_sets["level"] == identity_sets["classification"] == identity_sets["source"]):
            raise ValueError("level, classification, and source views must contain the same page identities")

        for page_index in identity_sets["source"]:
            canonical = indexed["source"][page_index].model_dump(mode="json")
            for name in ("level", "classification"):
                if indexed[name][page_index].model_dump(mode="json") != canonical:
                    raise ValueError(
                        f"derived views may reorder but must not rewrite page identity {page_index}"
                    )

        source_indices = [entry.page_index for entry in self.source]
        if source_indices != sorted(source_indices):
            raise ValueError("source view must preserve immutable PDF page order")
        return self


class BBox(BaseModel):
    x0: float
    y0: float
    x1: float
    y1: float
    space: CoordinateSpace = "normalized"

    @model_validator(mode="after")
    def validate_order(self) -> "BBox":
        if self.x1 < self.x0 or self.y1 < self.y0:
            raise ValueError("bbox coordinates must be ordered")
        if self.space == "normalized" and not all(-1e-6 <= v <= 1.000001 for v in self.values):
            raise ValueError("normalized bbox must be inside 0..1")
        return self

    @property
    def values(self) -> tuple[float, float, float, float]:
        return self.x0, self.y0, self.x1, self.y1

    @property
    def width(self) -> float:
        return max(0.0, self.x1 - self.x0)

    @property
    def height(self) -> float:
        return max(0.0, self.y1 - self.y0)

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def center(self) -> tuple[float, float]:
        return (self.x0 + self.x1) / 2.0, (self.y0 + self.y1) / 2.0

    def contains(self, x: float, y: float) -> bool:
        return self.x0 <= x <= self.x1 and self.y0 <= y <= self.y1


class DrawingSourceManifest(BaseModel):
    original_filename: str
    input_kind: str
    source_sha256: str
    processed_pdf_sha256: str
    source_size_bytes: int = Field(ge=0)
    processed_size_bytes: int = Field(ge=0)
    page_count: int = Field(ge=0)
    converted_to_pdf: bool = False
    encrypted: bool = False
    repaired_pdf: bool = False
    security_status: Literal["accepted", "quarantined", "rejected"] = "accepted"
    lineage_notes: list[str] = Field(default_factory=list)


class PageProfile(BaseModel):
    page_index: int
    width_pt: float
    height_pt: float
    rotation: int
    modality: Modality
    vector_text_spans: int = Field(ge=0)
    vector_paths: int = Field(ge=0)
    raster_images: int = Field(ge=0)
    confidence: float = Field(ge=0, le=1)
    routing_reason: str = ""
    quality_metrics: dict[str, float | int | bool | str] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class SheetSemanticProfile(BaseModel):
    page_index: int
    sheet_number: str | None = None
    title: str | None = None
    discipline: Literal[
        "architecture", "structure", "electrical", "mechanical", "plumbing",
        "civil", "multidiscipline", "unknown"
    ] = "unknown"
    drawing_type: DrawingType = "unknown"
    level: str | None = None
    scale_candidates: list[str] = Field(default_factory=list)
    source: Literal["native_pdf", "dem", "fused"] = "fused"
    confidence: float = Field(default=0.0, ge=0, le=1)
    evidence_refs: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class PageQuality(BaseModel):
    native_text_coverage: float = Field(default=0.0, ge=0, le=1)
    zone_coverage: float = Field(default=0.0, ge=0, le=1)
    dem_bbox_valid_ratio: float = Field(default=1.0, ge=0, le=1)
    evidence_coverage: float = Field(default=0.0, ge=0, le=1)
    readiness: Literal["ready", "review", "blocked"] = "review"
    reasons: list[str] = Field(default_factory=list)


class PlanZone(BaseModel):
    zone_id: str
    page_index: int
    type: ZoneType
    bbox: BBox
    confidence: float = Field(ge=0, le=1)
    method: Literal["deterministic", "model", "user"] = "deterministic"
    source_text: list[str] = Field(default_factory=list)
    needs_review: bool = False


class TextToken(BaseModel):
    token_id: str
    page_index: int
    text: str
    normalized: str
    bbox: BBox
    block_no: int = 0
    line_no: int = 0
    word_no: int = 0
    zone_id: str | None = None
    source: Literal["native_pdf", "ocr", "dem"] = "native_pdf"
    confidence: float = Field(default=1.0, ge=0, le=1)


class TableRecord(BaseModel):
    record_id: str
    page_index: int
    zone_id: str | None = None
    cells: list[str]
    bbox: BBox | None = None
    source: Literal["native_pdf", "dem", "user"] = "native_pdf"
    confidence: float = Field(default=1.0, ge=0, le=1)


class VocabularyEntry(BaseModel):
    entry_id: str
    key: str
    canonical_key: str
    category: str = "unknown"
    description: str | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    page_index: int
    bbox: BBox | None = None
    evidence_refs: list[str] = Field(default_factory=list)
    source: Literal["legend", "schedule", "dem", "user"]
    confidence: float = Field(default=1.0, ge=0, le=1)


class CrossReferenceMatch(BaseModel):
    match_id: str
    label: str
    canonical_key: str
    occurrence_page_index: int
    occurrence_bbox: BBox
    definition_entry_id: str | None = None
    definition_page_index: int | None = None
    definition_bbox: BBox | None = None
    confidence: float = Field(ge=0, le=1)
    excluded_zone_type: ZoneType | None = None
    evidence_refs: list[str] = Field(default_factory=list)
    source_channel: Literal["dem", "native_pdf", "ocr", "user"] = "dem"


class VectorDescriptor(BaseModel):
    width: float = Field(ge=0)
    height: float = Field(ge=0)
    aspect_ratio: float = Field(ge=0)
    segment_count: int = Field(ge=0)
    curve_count: int = Field(ge=0)
    rectangle_count: int = Field(ge=0)
    closed_path_count: int = Field(ge=0)
    fill_count: int = Field(ge=0)
    stroke_count: int = Field(ge=0)
    orientation_histogram: list[float] = Field(default_factory=list)


class DetectionCandidate(BaseModel):
    candidate_id: str
    page_index: int
    category: str
    label: str | None = None
    bbox: BBox
    confidence: float = Field(ge=0, le=1)
    status: DetectionStatus = "candidate"
    method: Literal[
        "text_exact", "text_semantic", "vector_similarity", "one_click_area", "one_click_line", "dem"
    ]
    descriptor: VectorDescriptor | None = None
    evidence_refs: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)


class InteractiveMeasurement(BaseModel):
    measurement_id: str
    page_index: int
    kind: Literal["area", "line"]
    geometry: list[tuple[float, float]]
    geometry_space: CoordinateSpace = "normalized"
    raw_value: float | None = None
    raw_unit: str | None = None
    scaled_value: float | None = None
    scaled_unit: str | None = None
    confidence: float = Field(ge=0, le=1)
    status: DetectionStatus
    evidence_refs: list[str] = Field(default_factory=list)
    review_reason: str | None = None


class ReviewTask(BaseModel):
    task_id: str
    page_index: int
    task_type: Literal[
        "zone", "classification", "symbol", "boundary", "cross_reference", "scale", "work_item"
    ]
    title: str
    reason: str
    candidate_ids: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)
    severity: Literal["info", "review", "blocking"] = "review"
    status: Literal["open", "accepted", "rejected", "resolved"] = "open"


class SourceValue(BaseModel):
    value_id: str
    field: Literal["count", "dimensions", "elevation", "height", "classification", "revision"]
    value: Any
    unit: str | None = None
    page_index: int
    sheet_title: str | None = None
    bbox: BBox | None = None
    evidence_refs: list[str] = Field(default_factory=list)
    source_channel: Literal["native_pdf", "dem", "schedule", "legend", "section", "user", "engine"]
    confidence: float = Field(default=1.0, ge=0, le=1)
    authority_rank: int = Field(default=0, ge=0)


class DrawingConflict(BaseModel):
    conflict_id: str
    work_item_id: str
    field: Literal["count", "dimensions", "elevation", "height", "classification", "revision"]
    title: str
    explanation: str
    source_values: list[SourceValue] = Field(min_length=2)
    affected_page_indices: list[int] = Field(default_factory=list)
    status: Literal["open", "system_resolved", "human_resolved", "superseded"] = "open"
    selected_value_id: str | None = None
    resolution_note: str | None = None


class PhysicalInstance(BaseModel):
    instance_id: str
    work_item_id: str
    category: str
    code: str
    level: str | None = None
    page_index: int
    bbox: BBox
    evidence_refs: list[str] = Field(default_factory=list)
    source_channel: Literal["native_pdf", "dem", "ocr", "user"]
    confidence: float = Field(default=1.0, ge=0, le=1)
    authority: Literal["candidate", "engine_confirmed", "human_confirmed", "rejected"] = "candidate"


class ElementMeasurementFact(BaseModel):
    measurement_id: str
    work_item_id: str
    field: Literal["count", "width", "depth", "height", "elevation", "area", "length", "volume"]
    value: float
    unit: str
    source_method: Literal["verified_instances", "written_dimension", "geometry_engine", "human_input", "core_engine"]
    verification_status: Literal["candidate", "engine_verified", "human_verified", "superseded"]
    evidence_refs: list[str] = Field(default_factory=list)
    source_page_indices: list[int] = Field(default_factory=list)
    formula_input: str | None = None


class WorkItemCalculation(BaseModel):
    calculation_id: str
    work_item_id: str
    calculation_type: str
    status: Literal["complete", "blocked", "needs_input", "stale"]
    formula: str | None = None
    substituted_formula: str | None = None
    result: float | None = None
    unit: str | None = None
    measurement_fact_ids: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    engine_version: str | None = None
    source_authority: Literal["core_engine", "none", "measurement_fact"] = "none"


class WorkItemCandidate(BaseModel):
    work_item_id: str
    category: str
    code: str | None = None
    label: str
    page_indices: list[int]
    maturity: MaturityStatus
    occurrence_count_observed: int = Field(default=0, ge=0)
    accepted_detection_count: int = Field(default=0, ge=0)
    geometry_kind: Literal["count", "line", "area", "object", "unknown"] = "unknown"
    evidence_refs: list[str] = Field(default_factory=list)
    source_candidate_ids: list[str] = Field(default_factory=list)
    attributes: dict[str, Any] = Field(default_factory=dict)
    missing_information: list[str] = Field(default_factory=list)
    review_task_ids: list[str] = Field(default_factory=list)
    user_accepted: bool = False
    verified_physical_count: int | None = Field(default=None, ge=0)
    count_authority: Literal["candidate", "engine_confirmed", "human_confirmed", "conflicting"] = "candidate"
    count_source_page_indices: list[int] = Field(default_factory=list)
    definition_source_page_indices: list[int] = Field(default_factory=list)
    physical_instance_ids: list[str] = Field(default_factory=list)
    conflict_ids: list[str] = Field(default_factory=list)
    measurement_facts: list[ElementMeasurementFact] = Field(default_factory=list)
    calculation_readiness: Literal["blocked", "needs_input", "ready", "calculated"] = "blocked"
    calculation: WorkItemCalculation | None = None


class PageIntelligence(BaseModel):
    profile: PageProfile
    semantics: SheetSemanticProfile | None = None
    quality: PageQuality = Field(default_factory=PageQuality)
    zones: list[PlanZone] = Field(default_factory=list)
    tokens: list[TextToken] = Field(default_factory=list)
    tables: list[TableRecord] = Field(default_factory=list)
    vocabulary: list[VocabularyEntry] = Field(default_factory=list)
    detections: list[DetectionCandidate] = Field(default_factory=list)


class DrawingPackageAnalysis(BaseModel):
    schema_version: str = "paax.drawing-intelligence.package.v1"
    package_id: str
    document_name: str
    document_sha256: str
    page_count: int
    source_manifest: DrawingSourceManifest | None = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    pages: list[PageIntelligence] = Field(default_factory=list)
    sheet_views: SheetViews = Field(default_factory=SheetViews)
    vocabulary: list[VocabularyEntry] = Field(default_factory=list)
    cross_references: list[CrossReferenceMatch] = Field(default_factory=list)
    work_items: list[WorkItemCandidate] = Field(default_factory=list)
    review_queue: list[ReviewTask] = Field(default_factory=list)
    physical_instances: list[PhysicalInstance] = Field(default_factory=list)
    conflicts: list[DrawingConflict] = Field(default_factory=list)
    construction_graph: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, Any] = Field(default_factory=dict)
    phase_status: dict[str, str] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
