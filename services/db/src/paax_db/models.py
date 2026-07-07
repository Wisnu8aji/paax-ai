from sqlalchemy import Column, String, Integer, Numeric, Boolean, DateTime, ForeignKey, Index, JSON
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
import uuid

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
    payload = Column(JSONB, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class TkgRecord(Base):
    __tablename__ = "tkg_records"
    
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    payload = Column(JSONB, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class ToolCallAudit(Base):
    __tablename__ = "tool_call_audit"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
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

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
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
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(String, index=True, nullable=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now(), index=True, nullable=False)
    summary = Column(String, nullable=False)
    highlights = Column(JSONB, nullable=False)
    concerns = Column(JSONB, nullable=False)
    metrics_snapshot = Column(JSONB, nullable=False)
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
    # Using type fallback to avoid hard crash if pgvector isn't installed yet
    embedding = Column(Vector(768) if HAS_VECTOR else String) 
    metadata_json = Column("metadata", JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class ProjectMember(Base):
    __tablename__ = "project_members"
    
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(String, primary_key=True)
    role = Column(String, nullable=False) # 'estimator' | 'pm' | 'lapangan' | 'owner'
    added_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
