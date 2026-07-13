from sqlalchemy import CHAR, Column, String, Integer, Numeric, Boolean, DateTime, ForeignKey, JSON
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
