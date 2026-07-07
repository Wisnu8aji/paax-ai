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
