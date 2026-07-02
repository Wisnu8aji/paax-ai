from __future__ import annotations

from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field


TargetType = Literal["work_item", "element", "evidence", "boe", "tkg", "rab"]


class ReviewCandidate(BaseModel):
    target_ref: str
    target_type: TargetType = "work_item"
    impact_score: float = Field(ge=0, le=1)
    uncertainty_score: float = Field(ge=0, le=1)
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    cost_rank_pct: Optional[float] = Field(default=None, ge=0, le=1)
    p_pareto: Optional[float] = Field(default=None, ge=0, le=1)
    corroborations: int = 0
    implied_high_impact: bool = False
    precedence_conflict: bool = False


class ReviewTask(BaseModel):
    id: str
    project_id: str
    target_ref: str
    target_type: TargetType
    reasons: List[str]
    priority: float
    impact_score: float
    uncertainty_score: float
    status: Literal["open", "in_progress", "resolved", "dismissed"] = "open"


class ReviewTriageRequest(BaseModel):
    project_id: str
    ambang_conf: float = Field(default=0.7, ge=0, le=1)
    candidates: List[ReviewCandidate] = Field(default_factory=list)


class ReviewTriageResult(BaseModel):
    project_id: str
    tasks: List[ReviewTask]


class CorrectionLogRequest(BaseModel):
    project_id: str
    target_ref: str
    field: str
    old: Any = None
    new: Any = None
    reason: str
    user: str
    timestamp: Optional[str] = None


class CorrectionRecord(BaseModel):
    id: str
    project_id: str
    target_ref: str
    field: str
    old: Any = None
    new: Any = None
    reason: str
    user: str
    timestamp: str
