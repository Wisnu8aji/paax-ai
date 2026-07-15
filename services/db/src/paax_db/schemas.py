from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Any, Dict, List
from datetime import datetime
import uuid

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


class ProjectGraphSnapshotBuildRequest(BaseModel):
    snapshot_id: str
    schema_version: str
    source_manifest_hash: str
    generation_metadata: Dict[str, Any]
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)
    evidence: List[Dict[str, Any]] = Field(default_factory=list)
    node_evidence: List[Dict[str, Any]] = Field(default_factory=list)
    edge_evidence: List[Dict[str, Any]] = Field(default_factory=list)
    aliases: List[Dict[str, Any]] = Field(default_factory=list)
    communities: List[Dict[str, Any]] = Field(default_factory=list)


class ProjectGraphSnapshotResponse(BaseModel):
    snapshot_id: str
    project_id: str
    schema_version: str
    status: str
    source_manifest_hash: str


class ProjectGraphRetrievalRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    depth: int = Field(default=2, ge=0, le=5)
    budget_tokens: int = Field(default=1400, ge=100, le=5000)
    relations: List[str] = Field(default_factory=list)


class ProjectGraphRetrievalResponse(BaseModel):
    status: str
    snapshot_id: Optional[str] = None
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)
    evidence: List[Dict[str, Any]] = Field(default_factory=list)
    context_token_estimate: int = 0


class ProjectGraphMetricsResponse(BaseModel):
    project_id: str
    query_count: int
    success_count: int
    not_ready_count: int
    average_context_tokens: float
