from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Any, Dict, List
from datetime import datetime

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
