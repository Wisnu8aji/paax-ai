from sqlalchemy import CHAR, Column, String, Integer, Numeric, Boolean, DateTime, ForeignKey, JSON, Text
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


class ProjectGraphSnapshot(Base):
    __tablename__ = "project_graph_snapshots"

    snapshot_id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    schema_version = Column(String, nullable=False)
    source_manifest_hash = Column(String, nullable=False)
    status = Column(String, nullable=False, index=True, default="building")
    generation_metadata = Column(JSON_DOCUMENT, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    activated_at = Column(DateTime(timezone=True), nullable=True)
    superseded_at = Column(DateTime(timezone=True), nullable=True)


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


class ProjectGraphEvidence(Base):
    __tablename__ = "project_graph_evidence"

    snapshot_id = Column(String, ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), primary_key=True)
    evidence_id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(String, nullable=False)
    page_index = Column(Integer, nullable=False)
    sheet_id = Column(String, nullable=False)
    kind = Column(String, nullable=False)
    raw_text = Column(Text, nullable=False)
    bbox_json = Column("bbox", JSON_DOCUMENT, nullable=True)
    source_dem_id = Column(String, nullable=True)


class ProjectGraphNodeEvidence(Base):
    __tablename__ = "project_graph_node_evidence"

    snapshot_id = Column(String, ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), primary_key=True)
    node_id = Column(String, primary_key=True)
    evidence_id = Column(String, primary_key=True)
    role = Column(String, nullable=False)


class ProjectGraphEdgeEvidence(Base):
    __tablename__ = "project_graph_edge_evidence"

    snapshot_id = Column(String, ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), primary_key=True)
    edge_id = Column(String, primary_key=True)
    evidence_id = Column(String, primary_key=True)
    role = Column(String, nullable=False)


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
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
