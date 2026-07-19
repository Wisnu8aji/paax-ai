from sqlalchemy import CHAR, Column, String, Integer, Numeric, Boolean, DateTime, ForeignKey, JSON, Text, UniqueConstraint, ForeignKeyConstraint, CheckConstraint, Index, event
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.types import TypeDecorator
from .database import Base
import uuid


class GUID(TypeDecorator):
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


JSON_DOCUMENT = JSON().with_variant(JSONB, "postgresql")

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(String, primary_key=True)
    owner_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    location = Column(String)
    client = Column(String)
    type = Column(String)
    status = Column(String, nullable=False, default="active")
    description = Column(String)
    rab_value = Column(Numeric)
    progress = Column(Integer, nullable=False, default=0)
    warnings = Column(Integer, nullable=False, default=0)
    health = Column(Integer, nullable=False, default=100)
    last_activity = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class RabDraft(Base):
    __tablename__ = "rab_drafts"
    
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    payload = Column(JSON_DOCUMENT, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class TkgRecord(Base):
    __tablename__ = "tkg_records"
    
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    payload = Column(JSON_DOCUMENT, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class ToolCallAudit(Base):
    __tablename__ = "tool_call_audit"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    session_id = Column(String, index=True)
    project_id = Column(String, index=True)
    tool_name = Column(String, nullable=False)
    tool_args = Column(JSON, nullable=False)
    result_payload = Column(JSON, nullable=True)
    tokens_in = Column(Integer, default=0)
    tokens_out = Column(Integer, default=0)
    latency_ms = Column(Integer, default=0)
    success = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AiUsageLog(Base):
    __tablename__ = "ai_usage_log"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(String, index=True, nullable=True)
    service = Column(String, nullable=False)
    operation = Column(String, nullable=False)
    cache_hit = Column(Boolean, default=False, nullable=False)
    tokens_in = Column(Integer, nullable=True)
    tokens_out = Column(Integer, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    success = Column(Boolean, nullable=False, default=True)
    # F18: observability stores bounded identifiers and numeric metadata only.
    correlation_id = Column(String(128), index=True, nullable=True)
    run_id = Column(String(128), index=True, nullable=True)
    project_id = Column(String(128), index=True, nullable=True)
    snapshot_id = Column(String(128), index=True, nullable=True)
    calculation_id = Column(String(128), index=True, nullable=True)
    event_type = Column(String(120), nullable=False, default="usage")
    status = Column(String(64), nullable=False, default="completed")
    metric_count = Column(Integer, nullable=False, default=1)
    cost_microunits = Column(Integer, nullable=True)
    metadata_json = Column(JSON_DOCUMENT, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class MorningReport(Base):
    __tablename__ = "morning_reports"
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id = Column(String, index=True, nullable=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now(), index=True, nullable=False)
    summary = Column(String, nullable=False)
    highlights = Column(JSON_DOCUMENT, nullable=False)
    concerns = Column(JSON_DOCUMENT, nullable=False)
    metrics_snapshot = Column(JSON_DOCUMENT, nullable=False)
    narrative_source = Column(String, nullable=False)

class TenantQuota(Base):
    __tablename__ = "tenant_quota"
    
    tenant_id = Column(String, primary_key=True)
    plan = Column(String, nullable=False)
    monthly_ai_calls_limit = Column(Integer, nullable=False)
    monthly_ai_calls_used = Column(Integer, nullable=False, default=0)
    reset_at = Column(DateTime(timezone=True), nullable=False)

try:
    from pgvector.sqlalchemy import Vector
    HAS_VECTOR = True
except ImportError:
    HAS_VECTOR = False

class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    
    id = Column(String, primary_key=True) # UUID
    source_type = Column(String, nullable=False)
    source_ref = Column(String, nullable=False)
    content = Column(String, nullable=False)
    # PostgreSQL uses pgvector; lightweight tests can use JSON on SQLite.
    embedding = Column((Vector(768) if HAS_VECTOR else JSON()).with_variant(JSON(), "sqlite"))
    metadata_json = Column("metadata", JSON_DOCUMENT)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class ProjectMember(Base):
    __tablename__ = "project_members"

    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(String, primary_key=True)
    role = Column(String, nullable=False) # 'estimator' | 'pm' | 'lapangan' | 'owner'
    added_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

# ─── Command Room memory layer (Fase 4, PLAN.md §5/§9) ─────────────────────
# Source of truth server-side untuk chat Command Room. localStorage
# (apps/web/src/lib/chat/chat-history.ts) tetap ada sbg cache/offline fallback
# selama migrasi dua-arah (PLAN.md §8.3) -- tabel ini TIDAK menggantikannya
# secara langsung/otomatis.

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id = Column(String, index=True, nullable=True)
    user_id = Column(String, index=True, nullable=False)
    model_alias = Column(String, nullable=False)  # 'lucent' | 'arete' | 'noir'
    title = Column(String, nullable=True)
    archived = Column(Boolean, default=False, nullable=False)
    pinned = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class Message(Base):
    __tablename__ = "messages"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(GUID(), ForeignKey("conversations.id", ondelete="CASCADE"), index=True, nullable=False)
    role = Column(String, nullable=False)  # 'user' | 'assistant' | 'system'
    content = Column(String, nullable=False)
    sequence = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

# scope/type: enum blueprint §9.2/§9.3 disimpan sbg String (bukan Postgres ENUM)
# -- lihat catatan yg sama di alembic/versions/0007_command_room_memory.py.
class DurableMemory(Base):
    __tablename__ = "durable_memories"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    scope = Column(String, index=True, nullable=False)  # global_user|organization|project|module|conversation|temporary_run
    scope_ref_id = Column(String, index=True, nullable=True)
    type = Column(String, nullable=False)  # decision|preference|constraint|correction|fact|open_task|artifact_reference
    content = Column(String, nullable=False)
    entities = Column(JSON_DOCUMENT, nullable=False, default=list)
    importance = Column(Numeric, nullable=False, default=0.5)
    confidence = Column(Numeric, nullable=False, default=1.0)
    status = Column(String, index=True, nullable=False, default="active")
    source_type = Column(String, nullable=False)
    source_id = Column(String, nullable=True)
    supersedes = Column(GUID(), ForeignKey("durable_memories.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class MemoryGraphMap(Base):
    __tablename__ = "memory_graph_map"

    memory_id = Column(GUID(), ForeignKey("durable_memories.id", ondelete="CASCADE"), primary_key=True)
    graph_node_id = Column(String, primary_key=True)
    graph_version = Column(String, nullable=True)
    indexed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# DEM Phase 2 job orchestrator. Status remains String rather than a database
# enum so new lifecycle variants do not require a separate enum migration.
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
    # Object key is portable across workers; never persist a host filesystem path.
    artifact_key = Column(String, nullable=True)
    artifact_deleted_at = Column(DateTime(timezone=True), nullable=True)
    artifact_deleted_by = Column(String, nullable=True)


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


class DurableJob(Base):
    """Portable durable queue record; external queues lease this canonical state."""
    __tablename__ = "durable_jobs"

    id = Column(String, primary_key=True)
    job_type = Column(String, nullable=False, index=True)
    payload = Column(JSON_DOCUMENT, nullable=False)
    idempotency_key = Column(String, nullable=False, unique=True)
    status = Column(String, nullable=False, default="queued", index=True)
    lease_owner = Column(String, nullable=True, index=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    last_error = Column(Text, nullable=True)
    lease_expires_at = Column(DateTime(timezone=True), nullable=True, index=True)
    next_attempt_at = Column(DateTime(timezone=True), nullable=True, index=True)
    cancel_requested_at = Column(DateTime(timezone=True), nullable=True)
    poisoned_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



class ProjectGraphSnapshot(Base):
    __tablename__ = "project_graph_snapshots"

    snapshot_id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    schema_version = Column(String, nullable=False)
    source_manifest_hash = Column(String, nullable=False)
    status = Column(String, nullable=False, index=True, default="building")
    generation_metadata = Column(JSON_DOCUMENT, nullable=False)
    effective_sheet_revision_ids = Column(JSON_DOCUMENT, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    activated_at = Column(DateTime(timezone=True), nullable=True)
    superseded_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint('snapshot_id', 'project_id', name='uq_project_graph_snapshots_id_project'),
    )


@event.listens_for(ProjectGraphSnapshot, "before_update")
def prevent_snapshot_core_update(mapper, connection, target):
    """Snapshots are immutable except for status/timestamp transitions.

    Allowed updates: status, activated_at, superseded_at (status workflow fields)
    Blocked updates: snapshot_id, project_id, schema_version, source_manifest_hash, generation_metadata, effective_sheet_revision_ids
    """
    from sqlalchemy import inspect
    state = inspect(target)
    # Immutable core fields that should never change
    immutable_fields = {
        'snapshot_id', 'project_id', 'schema_version', 'source_manifest_hash',
        'generation_metadata', 'effective_sheet_revision_ids', 'created_at'
    }
    for attr in state.attrs:
        if attr.key in immutable_fields and attr.history.has_changes():
            raise ValueError(
                f"ProjectGraphSnapshot field '{attr.key}' is immutable. "
                f"History: {attr.history}. "
                "Only status/activated_at/superseded_at can be updated via status transitions."
            )


class DocumentRevision(Base):
    """Auditable revision lineage for a source document."""
    __tablename__ = "document_revisions"

    revision_id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(String, nullable=False, index=True)
    issue_date = Column(DateTime(timezone=True), nullable=True)
    issue_purpose = Column(String, nullable=True)
    status = Column(String, nullable=False, default="draft", index=True)
    supersedes_revision_id = Column(String, ForeignKey("document_revisions.revision_id", ondelete="SET NULL"), nullable=True, index=True)
    superseded_by_revision_id = Column(String, ForeignKey("document_revisions.revision_id", ondelete="SET NULL"), nullable=True, index=True)
    effective_date = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SheetRevision(Base):
    """Effective revision state for one sheet within a document revision."""
    __tablename__ = "sheet_revisions"

    revision_id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(String, nullable=False, index=True)
    document_revision_id = Column(String, ForeignKey("document_revisions.revision_id", ondelete="CASCADE"), nullable=False, index=True)
    sheet_id = Column(String, nullable=False, index=True)
    issue_date = Column(DateTime(timezone=True), nullable=True)
    issue_purpose = Column(String, nullable=True)
    status = Column(String, nullable=False, default="draft", index=True)
    supersedes_revision_id = Column(String, ForeignKey("sheet_revisions.revision_id", ondelete="SET NULL"), nullable=True, index=True)
    superseded_by_revision_id = Column(String, ForeignKey("sheet_revisions.revision_id", ondelete="SET NULL"), nullable=True, index=True)
    revision_cloud_regions = Column(JSON_DOCUMENT, nullable=False, default=list)
    effective_date = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProjectGraphNode(Base):
    __tablename__ = "project_graph_nodes"

    snapshot_id = Column(String, ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), primary_key=True)
    node_id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    node_type = Column(String, nullable=False, index=True)
    canonical_name = Column(String, nullable=False)
    normalized_name = Column(String, nullable=False, index=True)
    discipline = Column(String, nullable=False, index=True)
    level_id = Column(String, nullable=True, index=True)
    verification_status = Column(String, nullable=False)
    confidence = Column(Numeric, nullable=False)
    properties_json = Column("properties", JSON_DOCUMENT, nullable=False, default=dict)
    search_text = Column(Text, nullable=False, default="")

    __table_args__ = (
        ForeignKeyConstraint(
            ['snapshot_id', 'project_id'],
            ['project_graph_snapshots.snapshot_id', 'project_graph_snapshots.project_id'],
            ondelete='CASCADE',
            name='fk_project_graph_nodes_snapshot_project'
        ),
        Index(
            "ix_project_graph_nodes_normalized_name_trgm",
            "normalized_name",
            postgresql_using="gin",
            postgresql_ops={"normalized_name": "gin_trgm_ops"}
        ),
        Index(
            "ix_project_graph_nodes_search_text_trgm",
            "search_text",
            postgresql_using="gin",
            postgresql_ops={"search_text": "gin_trgm_ops"}
        ),
    )



class ProjectGraphEdge(Base):
    __tablename__ = "project_graph_edges"

    snapshot_id = Column(String, ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), primary_key=True)
    edge_id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    source_node_id = Column(String, nullable=False, index=True)
    target_node_id = Column(String, nullable=False, index=True)
    relation = Column(String, nullable=False, index=True)
    confidence_class = Column(String, nullable=False)
    confidence = Column(Numeric, nullable=False)
    properties_json = Column("properties", JSON_DOCUMENT, nullable=False, default=dict)

    __table_args__ = (
        ForeignKeyConstraint(
            ['snapshot_id', 'project_id'],
            ['project_graph_snapshots.snapshot_id', 'project_graph_snapshots.project_id'],
            ondelete='CASCADE',
            name='fk_project_graph_edges_snapshot_project'
        ),
    )


class ProjectGraphEvidence(Base):
    __tablename__ = "project_graph_evidence"

    snapshot_id = Column(String, primary_key=True)
    evidence_id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(String, nullable=False)
    page_index = Column(Integer, nullable=False)
    sheet_id = Column(String, nullable=False)
    kind = Column(String, nullable=False)
    raw_text = Column(Text, nullable=False)
    bbox_json = Column("bbox", JSON_DOCUMENT, nullable=True)
    source_dem_id = Column(String, nullable=True)

    # Version 2 fields
    revision_id = Column(String, nullable=True)
    run_id = Column(String, nullable=True)
    dem_page_id = Column(String, nullable=True)
    view_id = Column(String, nullable=True)
    zone_id = Column(String, nullable=True)
    modality = Column(String, nullable=True)
    raw_content = Column(Text, nullable=True)
    normalized_content = Column(Text, nullable=True)
    bbox_source = Column(JSON_DOCUMENT, nullable=True)
    bbox_normalized = Column(JSON_DOCUMENT, nullable=True)
    # Explicit coordinate-space provenance (Target 4, final remediation wave)
    # -- see app/perception/bbox_canonicalize.py (document-intelligence).
    bbox_space = Column(String, nullable=True)
    bbox_quarantine_reason = Column(Text, nullable=True)
    coordinate_schema_version = Column(String, nullable=True)
    transform_version = Column(String, nullable=True)
    polygon_source = Column(JSON_DOCUMENT, nullable=True)
    polygon_normalized = Column(JSON_DOCUMENT, nullable=True)
    confidence = Column(Numeric, nullable=True)
    extractor = Column(JSON_DOCUMENT, nullable=True)
    source_document_hash = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        ForeignKeyConstraint(
            ['snapshot_id', 'project_id'],
            ['project_graph_snapshots.snapshot_id', 'project_graph_snapshots.project_id'],
            ondelete='CASCADE',
            name='fk_project_graph_evidence_snapshot_project'
        ),
    )


@event.listens_for(ProjectGraphEvidence, "before_update")
def prevent_evidence_update(mapper, connection, target):
    raise ValueError("ProjectGraphEvidence records are immutable and cannot be updated.")


class ProjectGraphNodeEvidence(Base):
    __tablename__ = "project_graph_node_evidence"

    snapshot_id = Column(String, primary_key=True)
    node_id = Column(String, primary_key=True)
    evidence_id = Column(String, primary_key=True)
    role = Column(String, nullable=False)

    __table_args__ = (
        ForeignKeyConstraint(
            ['snapshot_id', 'node_id'],
            ['project_graph_nodes.snapshot_id', 'project_graph_nodes.node_id'],
            ondelete='CASCADE',
            name='fk_node_evidence_node'
        ),
        ForeignKeyConstraint(
            ['snapshot_id', 'evidence_id'],
            ['project_graph_evidence.snapshot_id', 'project_graph_evidence.evidence_id'],
            ondelete='CASCADE',
            name='fk_node_evidence_evidence'
        ),
    )


class ProjectGraphEdgeEvidence(Base):
    __tablename__ = "project_graph_edge_evidence"

    snapshot_id = Column(String, primary_key=True)
    edge_id = Column(String, primary_key=True)
    evidence_id = Column(String, primary_key=True)
    role = Column(String, nullable=False)

    __table_args__ = (
        ForeignKeyConstraint(
            ['snapshot_id', 'edge_id'],
            ['project_graph_edges.snapshot_id', 'project_graph_edges.edge_id'],
            ondelete='CASCADE',
            name='fk_edge_evidence_edge'
        ),
        ForeignKeyConstraint(
            ['snapshot_id', 'evidence_id'],
            ['project_graph_evidence.snapshot_id', 'project_graph_evidence.evidence_id'],
            ondelete='CASCADE',
            name='fk_edge_evidence_evidence'
        ),
    )


class ProjectGraphAlias(Base):
    __tablename__ = "project_graph_aliases"

    snapshot_id = Column(String, ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), primary_key=True)
    alias_normalized = Column(String, primary_key=True)
    alias_raw = Column(String, primary_key=True)
    node_id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    alias_type = Column(String, nullable=False)
    confidence = Column(Numeric, nullable=False)


class ProjectGraphCommunity(Base):
    __tablename__ = "project_graph_communities"

    snapshot_id = Column(String, ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), primary_key=True)
    community_id = Column(String, primary_key=True)
    community_type = Column(String, nullable=False)
    name = Column(String, nullable=False)
    summary = Column(Text, nullable=False, default="")
    member_count = Column(Integer, nullable=False)


class ProjectGraphQueryLog(Base):
    __tablename__ = "project_graph_query_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_id = Column(String, ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(String, nullable=True)
    user_query = Column(Text, nullable=False)
    query_plan = Column(JSON_DOCUMENT, nullable=False)
    selected_seed_ids = Column(JSON_DOCUMENT, nullable=False, default=list)
    traversed_node_ids = Column(JSON_DOCUMENT, nullable=False, default=list)
    traversed_edge_ids = Column(JSON_DOCUMENT, nullable=False, default=list)
    context_token_estimate = Column(Integer, nullable=False)
    answer_model = Column(String, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    outcome = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProjectGraphCorrection(Base):
    __tablename__ = "project_graph_corrections"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_id = Column(String, ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), nullable=False, index=True)
    target_type = Column(String, nullable=False)
    target_id = Column(String, nullable=False)
    correction_type = Column(String, nullable=False)
    proposed_value = Column(JSON_DOCUMENT, nullable=False)
    rationale = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="pending", index=True)
    resolution_note = Column(Text, nullable=True)
    created_by = Column(String, nullable=True)
    resolved_by = Column(String, nullable=True)
    carried_from = Column(String, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)


class ProjectGraphCorrectionAudit(Base):
    __tablename__ = "project_graph_correction_audits"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    correction_id = Column(String, ForeignKey("project_graph_corrections.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    source_snapshot_id = Column(String, nullable=False)
    target_snapshot_id = Column(String, nullable=False)
    decision = Column(String, nullable=False)  # carried_forward|stale
    reason = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MeasurementFact(Base):
    """Immutable, typed quantity input scoped to one project graph snapshot."""
    __tablename__ = "measurement_facts"

    measurement_id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_id = Column(String, ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), nullable=False, index=True)
    measurement_type = Column(String, nullable=False, index=True)
    value = Column(Numeric(24, 9), nullable=False)
    unit = Column(String, nullable=False)
    source_method = Column(String, nullable=False)
    element_ids = Column(JSON_DOCUMENT, nullable=False, default=list)
    evidence_refs = Column(JSON_DOCUMENT, nullable=False, default=list)
    formula_inputs = Column(JSON_DOCUMENT, nullable=False, default=list)
    verification_status = Column(String, nullable=False, default="candidate", index=True)
    created_by = Column(String, nullable=True)
    audit_metadata = Column(JSON_DOCUMENT, nullable=False, default=dict)
    supersedes_measurement_id = Column(String, ForeignKey("measurement_facts.measurement_id", ondelete="SET NULL"), nullable=True, index=True)
    superseded_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("value >= 0", name="ck_measurement_facts_value_nonnegative"),
    )


@event.listens_for(MeasurementFact, "before_update")
def prevent_measurement_fact_core_update(mapper, connection, target):
    """Measurement facts are append-only except for the supersession status
    transition (see measurement_repository.supersede_measurement_fact).

    Allowed updates: verification_status, superseded_at (supersession workflow)
    Blocked updates: value, unit, measurement_type, source_method, element_ids,
    evidence_refs, formula_inputs, supersedes_measurement_id, and all identity/
    scope fields. A docstring saying "immutable" is not an invariant on its
    own -- this makes it one at the ORM layer.
    """
    from sqlalchemy import inspect
    state = inspect(target)
    immutable_fields = {
        'measurement_id', 'project_id', 'snapshot_id', 'measurement_type',
        'value', 'unit', 'source_method', 'element_ids', 'evidence_refs',
        'formula_inputs', 'created_by', 'audit_metadata',
        'supersedes_measurement_id', 'created_at',
    }
    for attr in state.attrs:
        if attr.key in immutable_fields and attr.history.has_changes():
            raise ValueError(
                f"MeasurementFact field '{attr.key}' is immutable. "
                f"History: {attr.history}. "
                "Only verification_status/superseded_at can change, via supersession."
            )


class MeasurementFactAudit(Base):
    __tablename__ = "measurement_fact_audits"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    measurement_id = Column(String, ForeignKey("measurement_facts.measurement_id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String, nullable=False)
    actor = Column(String, nullable=True)
    metadata_json = Column("metadata", JSON_DOCUMENT, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProjectGraphRetrievalCache(Base):
    __tablename__ = "project_graph_retrieval_cache"

    cache_key = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_id = Column(String, ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), nullable=False, index=True)
    payload = Column(JSON_DOCUMENT, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)


class ProjectGraphSummaryView(Base):
    __tablename__ = "project_graph_summary_views"

    snapshot_id = Column(String, ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), primary_key=True)
    view_id = Column(String, primary_key=True)  # stable id per (snapshot_id, view_kind, level_id)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    view_kind = Column(String, nullable=False, index=True)
    level_id = Column(String, nullable=True, index=True)
    payload = Column(JSON_DOCUMENT, nullable=False)  # full ProjectGraphSummaryView dict
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RabBridgeProposal(Base):
    __tablename__ = "rab_bridge_proposals"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_id = Column(String, ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), nullable=False, index=True)
    node_ids = Column(JSON_DOCUMENT, nullable=False)
    payload = Column(JSON_DOCUMENT, nullable=False)
    status = Column(String, nullable=False, default="pending", index=True)
    created_by = Column(String, nullable=True)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    revision = Column(Integer, nullable=False, default=1)
    materialization_key = Column(String, nullable=True, unique=True)
    materialization_result = Column(JSON_DOCUMENT, nullable=True)
    materialized_by = Column(String, nullable=True)
    materialized_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RabMaterializationMapping(Base):
    """Approved, snapshot-scoped authority linking one RAB work item to typed facts."""
    __tablename__ = "rab_materialization_mappings"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_id = Column(String, ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), nullable=False, index=True)
    work_item_node_id = Column(String, nullable=False)
    measurement_fact_ids = Column(JSON_DOCUMENT, nullable=False, default=list)
    calculation_type = Column(String, nullable=False)
    evidence_refs = Column(JSON_DOCUMENT, nullable=False, default=list)
    approval_status = Column(String, nullable=False, default="pending_approval", index=True)
    created_by = Column(String, nullable=True)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("project_id", "snapshot_id", "work_item_node_id", name="uq_rab_materialization_mapping_work_item"),
    )


class RabMaterializationMappingAudit(Base):
    __tablename__ = "rab_materialization_mapping_audits"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    mapping_id = Column(String, ForeignKey("rab_materialization_mappings.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String, nullable=False)
    actor = Column(String, nullable=True)
    metadata_json = Column("metadata", JSON_DOCUMENT, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RabBridgeCandidateSet(Base):
    """Immutable review payload for V2 work-item and AHSP candidate generation."""
    __tablename__ = "rab_bridge_candidate_sets"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_id = Column(String, ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), nullable=False, index=True)
    physical_element_id = Column(String, nullable=False)
    status = Column(String, nullable=False, default="candidate_ready", index=True)
    payload = Column(JSON_DOCUMENT, nullable=False)
    provenance = Column(JSON_DOCUMENT, nullable=False)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("project_id", "snapshot_id", "physical_element_id", name="uq_rab_bridge_candidate_set_element"),
    )


class QuantityAssumption(Base):
    __tablename__ = "quantity_assumptions"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    element_type_id = Column(String, nullable=True, index=True)
    text = Column(Text, nullable=True)  # legacy rationale only; never a calculation input
    source_role = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending_approval", index=True)
    snapshot_id = Column(String, nullable=True, index=True)
    value = Column(Numeric(24, 9), nullable=True)
    unit = Column(String, nullable=True)
    scope = Column(JSON_DOCUMENT, nullable=True)
    rationale = Column(Text, nullable=True)
    owner = Column(String, nullable=True)
    approval_status = Column(String, nullable=False, default="pending_approval", index=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    stale_reason = Column(Text, nullable=True)
    evidence_refs = Column(JSON_DOCUMENT, nullable=True)
    explicit_human_source = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

