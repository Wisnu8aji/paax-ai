from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
from typing import Optional, Any, Dict, List, Literal, Union
from datetime import datetime
import uuid


class QueryIntentEnum(str, Enum):
    GENERAL_CHAT = "GENERAL_CHAT"
    PROJECT_OVERVIEW = "PROJECT_OVERVIEW"
    DIRECT_FACT = "DIRECT_FACT"
    LIST_FILTER = "LIST_FILTER"
    NODE_EXPLAIN = "NODE_EXPLAIN"
    RELATIONSHIP = "RELATIONSHIP"
    PATH_QUERY = "PATH_QUERY"
    SHEET_LOOKUP = "SHEET_LOOKUP"
    SPACE_LOOKUP = "SPACE_LOOKUP"
    ELEMENT_LOOKUP = "ELEMENT_LOOKUP"
    MATERIAL_LOOKUP = "MATERIAL_LOOKUP"
    CONFLICT_LOOKUP = "CONFLICT_LOOKUP"
    MISSING_INFORMATION = "MISSING_INFORMATION"
    NUMERIC_STORED_FACT = "NUMERIC_STORED_FACT"
    CALCULATION_REQUIRED = "CALCULATION_REQUIRED"
    RAB_QUERY = "RAB_QUERY"
    SCHEDULE_QUERY = "SCHEDULE_QUERY"


class EdgeRelationEnum(str, Enum):
    CONTAINS = "CONTAINS"
    PART_OF = "PART_OF"
    LOCATED_ON = "LOCATED_ON"
    LOCATED_IN = "LOCATED_IN"
    ALIGNED_TO = "ALIGNED_TO"
    DEFINED_BY = "DEFINED_BY"
    DEPICTED_IN = "DEPICTED_IN"
    REFERENCES = "REFERENCES"
    SAME_AS = "SAME_AS"
    POSSIBLY_SAME_AS = "POSSIBLY_SAME_AS"
    USES_MATERIAL = "USES_MATERIAL"
    HAS_FINISH = "HAS_FINISH"
    HAS_DIMENSION = "HAS_DIMENSION"
    HAS_TYPE = "HAS_TYPE"
    INSTANCE_OF = "INSTANCE_OF"
    SERVES = "SERVES"
    CONNECTED_TO = "CONNECTED_TO"
    SUPPORTED_BY = "SUPPORTED_BY"
    SUPPORTS = "SUPPORTS"
    ADJACENT_TO = "ADJACENT_TO"
    OPENS_TO = "OPENS_TO"
    CONFLICTS_WITH = "CONFLICTS_WITH"
    HAS_EVIDENCE = "HAS_EVIDENCE"
    DERIVED_FROM = "DERIVED_FROM"
    SUPERSEDES = "SUPERSEDES"
    HAS_OPENING = "HAS_OPENING"
    FILLED_BY = "FILLED_BY"


class QueryEntity(BaseModel):
    type: str
    value: str


class GraphQueryPlan(BaseModel):
    intent: QueryIntentEnum
    project_id: str
    entities: List[QueryEntity] = Field(default_factory=list)
    filters: Dict[str, Optional[str]] = Field(default_factory=dict)
    relations: List[EdgeRelationEnum] = Field(default_factory=list)
    traversal_mode: Literal["bfs", "dfs", "shortest_path", "direct_lookup"] = "bfs"
    traversal_depth: int = Field(default=2, ge=0)
    budget_tokens: int = Field(default=1400, gt=0)


QueryPlan = GraphQueryPlan

class ProjectBase(BaseModel):
    owner_id: str
    name: str
    location: Optional[str] = None
    client: Optional[str] = None
    type: Optional[str] = None
    status: str = "active"
    description: Optional[str] = None
    rab_value: Optional[float] = None
    progress: int = 0
    warnings: int = 0
    health: int = 100
    last_activity: Optional[str] = None

class ProjectCreate(ProjectBase):
    id: str

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    client: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None
    rab_value: Optional[float] = None
    progress: Optional[int] = None
    warnings: Optional[int] = None
    health: Optional[int] = None
    last_activity: Optional[str] = None

class ProjectResponse(ProjectBase):
    id: str
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class RabPayload(BaseModel):
    payload: Dict[str, Any]

class TkgPayload(BaseModel):
    payload: Dict[str, Any]

class ToolCallAuditCreate(BaseModel):
    id: str
    conversation_id: Optional[str] = None
    project_id: Optional[str] = None
    tool_name: str
    input_json: Dict[str, Any]
    output_json: Optional[Dict[str, Any]] = None
    model: Optional[str] = None
    latency_ms: Optional[int] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None

class ToolCallAuditResponse(ToolCallAuditCreate):
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AiUsageLogCreate(BaseModel):
    id: Optional[uuid.UUID] = None
    tenant_id: Optional[str] = None
    service: str
    operation: str
    cache_hit: bool = False
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    latency_ms: Optional[int] = None
    success: bool

class AiUsageLogResponse(AiUsageLogCreate):
    id: uuid.UUID
    created_at: datetime
    
    class Config:
        from_attributes = True

class MorningReportCreate(BaseModel):
    project_id: str
    summary: str
    highlights: List[str]
    concerns: List[str]
    metrics_snapshot: Dict[str, Any]
    narrative_source: str

class MorningReportResponse(MorningReportCreate):
    id: str
    generated_at: datetime
    
    class Config:
        from_attributes = True

class UsageSummaryResponse(BaseModel):
    total_tokens_in: int
    total_tokens_out: int
    operations_count: Dict[str, int]
    cache_hit_ratio: float

class QuotaCheckResponse(BaseModel):
    tenant_id: str
    plan: str
    limit: int
    used: int
    remaining: int
    reset_at: datetime
    quota_exceeded: bool

class KnowledgeChunkCreate(BaseModel):
    id: str
    source_type: str
    source_ref: str
    content: str
    embedding: List[float]
    metadata_json: Optional[Dict[str, Any]] = None

class KnowledgeChunkResponse(BaseModel):
    id: str
    source_type: str
    source_ref: str
    content: str
    metadata_json: Optional[Dict[str, Any]] = None
    similarity_score: Optional[float] = None
    
    model_config = ConfigDict(from_attributes=True)

class KnowledgeSearchRequest(BaseModel):
    query_embedding: List[float]
    source_type: Optional[str] = None
    project_id: Optional[str] = None
    top_k: int = 5

class ProjectMemberBase(BaseModel):
    role: str

class ProjectMemberCreate(ProjectMemberBase):
    project_id: str
    user_id: str

class ProjectMemberResponse(ProjectMemberCreate):
    added_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ─── Command Room memory layer (Fase 4, PLAN.md §5/§9) ─────────────────────

class ConversationCreate(BaseModel):
    project_id: Optional[str] = None
    model_alias: str
    title: Optional[str] = None

class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    archived: Optional[bool] = None
    pinned: Optional[bool] = None
    model_alias: Optional[str] = None

class ConversationResponse(BaseModel):
    id: uuid.UUID
    project_id: Optional[str] = None
    user_id: str
    model_alias: str
    title: Optional[str] = None
    archived: bool
    pinned: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class MessageCreate(BaseModel):
    role: str
    content: str
    sequence: int

class MessageResponse(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    sequence: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

DURABLE_MEMORY_SCOPES = {"global_user", "organization", "project", "module", "conversation", "temporary_run"}
DURABLE_MEMORY_TYPES = {"decision", "preference", "constraint", "correction", "fact", "open_task", "artifact_reference", "summary"}

class DurableMemoryCreate(BaseModel):
    scope: str
    scope_ref_id: Optional[str] = None
    type: str
    content: str
    entities: List[str] = Field(default_factory=list)
    importance: float = 0.5
    confidence: float = 1.0
    source_type: str
    source_id: Optional[str] = None
    supersedes: Optional[uuid.UUID] = None

class DurableMemoryResponse(BaseModel):
    id: uuid.UUID
    scope: str
    scope_ref_id: Optional[str] = None
    type: str
    content: str
    entities: List[str]
    importance: float
    confidence: float
    status: str
    source_type: str
    source_id: Optional[str] = None
    supersedes: Optional[uuid.UUID] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DemRunCreate(BaseModel):
    project_id: Optional[str] = None
    document_id: str
    document_hash: str
    file_name: str
    total_pages: int
    provider: str
    prompt_version: str
    pdf_path: Optional[str] = None


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
    pdf_path: Optional[str] = None

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


class ProjectDemSheetResponse(BaseModel):
    run_id: str
    page_index: int
    file_name: str
    status: str
    sheet_title: Optional[str] = None
    thumbnail_url: str


class ProjectGraphSnapshotBuildRequest(BaseModel):
    snapshot_id: str
    schema_version: str
    source_manifest_hash: str
    generation_metadata: Dict[str, Any]
    effective_sheet_revision_ids: List[str] = Field(default_factory=list)
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)
    evidence: List[Dict[str, Any]] = Field(default_factory=list)
    node_evidence: List[Dict[str, Any]] = Field(default_factory=list)
    edge_evidence: List[Dict[str, Any]] = Field(default_factory=list)
    aliases: List[Dict[str, Any]] = Field(default_factory=list)
    communities: List[Dict[str, Any]] = Field(default_factory=list)
    summary_views: List[Dict[str, Any]] = Field(default_factory=list)



class ProjectGraphSnapshotResponse(BaseModel):
    snapshot_id: str
    project_id: str
    schema_version: str
    status: str
    source_manifest_hash: str
    effective_sheet_revision_ids: List[str] = Field(default_factory=list)


class ProjectGraphRetrievalRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    use_intent: bool = True
    depth: int = Field(default=2, ge=0, le=5)
    budget_tokens: int = Field(default=1400, ge=100, le=5000)
    relations: List[str] = Field(default_factory=list)
    traversal_mode: str = Field(default="bfs", pattern="^(bfs|dfs|shortest_path|direct_lookup)$")
    target_node_id: Optional[str] = None


class ProjectGraphRetrievalResponse(BaseModel):
    status: str
    snapshot_id: Optional[str] = None
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)
    evidence: List[Dict[str, Any]] = Field(default_factory=list)
    context_token_estimate: int = 0
    intent: Optional[QueryIntentEnum] = None
    applied_filters: Dict[str, Optional[str]] = Field(default_factory=dict)
    data_status: Optional[Literal["grounded", "empty", "calculation_required", "unknown_level", "not_ready", "corrected"]] = None
    notes: List[str] = Field(default_factory=list)
    summary_view: Optional["ProjectGraphSummaryView"] = None
    guidance: Optional[str] = None
    rab_bridge_available: Optional[bool] = None
    missing_information: List[str] = Field(default_factory=list)
    facts: List[Dict[str, Any]] = Field(default_factory=list)
    relationships: List[Dict[str, Any]] = Field(default_factory=list)
    conflicts: List[Dict[str, Any]] = Field(default_factory=list)
    citations: List[Dict[str, Any]] = Field(default_factory=list)
    allowed_claims: List[str] = Field(default_factory=list)
    forbidden_claims: List[str] = Field(default_factory=list)
    quantity_authority: str = "none"


class ProjectGraphMetricsResponse(BaseModel):
    project_id: str
    query_count: int
    success_count: int
    not_ready_count: int
    average_context_tokens: float


CORRECTION_TYPES = {"rename", "reclassify", "relocate", "change-dimension", "merge", "split", "reject-candidate", "verify-physical", "add-relation", "mark-superseded"}

class ProjectGraphCorrectionCreate(BaseModel):
    id: str
    snapshot_id: str
    target_type: str
    target_id: str
    correction_type: str
    proposed_value: Dict[str, Any]
    rationale: str = Field(min_length=1, max_length=4000)


class ProjectGraphCorrectionResolve(BaseModel):
    status: Literal["accepted", "resolved", "rejected"]
    resolution_note: str = Field(min_length=1, max_length=4000)


class ProjectGraphCorrectionResponse(ProjectGraphCorrectionCreate):
    project_id: str
    status: str
    resolution_note: Optional[str] = None
    created_by: Optional[str] = None
    resolved_by: Optional[str] = None
    carried_from: Optional[str] = None
    created_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ReviewReason(BaseModel):
    code: str
    message: str
    target_type: Literal["node", "edge"]
    target_id: str
    evidence_refs: List[str] = Field(default_factory=list)


class ReviewQueueItem(BaseModel):
    id: str
    category: Literal["conflict", "missing_dimension", "ambiguous_level", "possibly_same", "needs_review"]
    target_type: Literal["node", "edge"]
    target_id: str
    node_id: Optional[str] = None
    edge_id: Optional[str] = None
    reason_codes: List[str] = Field(default_factory=list)
    reasons: List[ReviewReason] = Field(default_factory=list)
    priority: float = Field(ge=0)
    weight: float = Field(ge=0)
    occurrence_count: int = Field(default=0, ge=0)
    evidence_refs: List[str] = Field(default_factory=list)


class ReviewQueueSummary(BaseModel):
    total: int = Field(ge=0)
    by_reason: Dict[str, int] = Field(default_factory=dict)


class ProjectGraphReviewQueueResponse(BaseModel):
    project_id: str
    snapshot_id: str
    items: List[ReviewQueueItem] = Field(default_factory=list)
    summary: ReviewQueueSummary


class QuantityReadinessItem(BaseModel):
    element_type_id: str
    name: str
    readiness: Literal["ready", "needs_review", "blocked"]
    has_canonical_type: bool
    has_occurrence: bool
    has_written_dimension: bool
    no_open_conflict: bool
    level_binding_confirmed: bool
    occurrence_count: int = Field(ge=0)
    reason_codes: List[str] = Field(default_factory=list)
    reasons: List[ReviewReason] = Field(default_factory=list)


class QuantityReadinessSummary(BaseModel):
    total: int = Field(ge=0)
    ready: int = Field(ge=0)
    needs_review: int = Field(ge=0)
    blocked: int = Field(ge=0)


class QuantityReadinessResponse(BaseModel):
    project_id: str
    snapshot_id: str
    items: List[QuantityReadinessItem] = Field(default_factory=list)
    summary: QuantityReadinessSummary


class RabBridgeRequest(BaseModel):
    node_ids: List[str]


class RabBridgeResponse(BaseModel):
    status: str
    snapshot_id: Optional[str] = None
    proposal_id: Optional[str] = None
    items: List[Dict[str, Any]] = Field(default_factory=list)


class RabBridgeProposalResolve(BaseModel):
    status: Literal["approved", "rejected"]


class RabBridgeProposalSummary(BaseModel):
    """SS5.2.1 — Ringkasan proposal RAB Bridge untuk ditampilkan di UI RAB page."""
    proposal_id: str
    snapshot_id: str
    status: str
    item_count: int
    created_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None


class SkippedItem(BaseModel):
    node_id: str
    reason: str


class RabBridgeMaterializeResponse(BaseModel):
    materialized_count: int
    skipped_items: List[SkippedItem] = Field(default_factory=list)
    rab_draft_updated: bool


class QuantityAssumptionCreate(BaseModel):
    id: str
    project_id: str
    element_type_id: Optional[str] = None
    text: str = Field(min_length=1, max_length=4000)
    source_role: str
    status: str = "active"


class QuantityAssumptionResponse(QuantityAssumptionCreate):
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class QuantityAssumptionResolve(BaseModel):
    status: Literal["accepted", "rejected"]


class SummaryViewGrain(BaseModel):
    building_id: Optional[str] = None
    level_id: Optional[str] = None
    discipline: Optional[str] = None
    zone_id: Optional[str] = None


class ElementTypeIndexEntry(BaseModel):
    element_type_id: str
    name: str
    occurrence_count: int = Field(ge=0)
    data_status: Optional[Literal["corrected"]] = None
    correction: Optional[Dict[str, Any]] = None


class DisciplineCountEntry(BaseModel):
    discipline: str
    occurrence_count: int = Field(ge=0)


class StoredMeasurementFact(BaseModel):
    name: str
    value: Union[str, int, float]
    unit: str
    evidence_refs: List[str] = Field(default_factory=list)


class SummaryPayload(BaseModel):
    level_name: str
    element_type_index: List[ElementTypeIndexEntry] = Field(default_factory=list)
    discipline_counts: List[DisciplineCountEntry] = Field(default_factory=list)
    stored_measurement_facts: List[StoredMeasurementFact] = Field(default_factory=list)
    label_observation_count: int = Field(default=0, ge=0)
    context_group_count: int = Field(default=0, ge=0)
    physical_candidate_count: int = Field(default=0, ge=0)
    verified_physical_count: int = Field(default=0, ge=0)
    data_status: Optional[Literal["corrected"]] = None
    corrections: List[Dict[str, Any]] = Field(default_factory=list)


class QualityPayload(BaseModel):
    confirmed_count: int = Field(ge=0)
    ambiguous_binding_count: int = Field(ge=0)
    conflict_count: int = Field(ge=0)
    ambiguous_binding_ids: List[str] = Field(default_factory=list)
    conflict_ids: List[str] = Field(default_factory=list)


class ProvenancePayload(BaseModel):
    source_document_ids: List[str] = Field(default_factory=list)
    evidence_ids: List[str] = Field(default_factory=list)
    summary_builder_version: str


class ProjectGraphSummaryView(BaseModel):
    schema_version: Literal["paax.pckm.summary-view.v1"] = "paax.pckm.summary-view.v1"
    project_id: str
    snapshot_id: str
    view_kind: Literal["LEVEL_OVERVIEW"] = "LEVEL_OVERVIEW"
    grain: SummaryViewGrain
    summary: SummaryPayload
    quality: QualityPayload
    provenance: ProvenancePayload
    notes: List[str] = Field(default_factory=list)
    data_status: Optional[Literal["corrected"]] = None


class ProjectGraphSummaryViewResponse(BaseModel):
    snapshot_id: str
    view_id: str
    project_id: str
    view_kind: str
    level_id: Optional[str] = None
    payload: ProjectGraphSummaryView
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
