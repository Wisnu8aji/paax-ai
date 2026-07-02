from __future__ import annotations

from typing import List
from pydantic import BaseModel, Field


class AhspSearchRequest(BaseModel):
    query: str
    unit: str | None = None
    top_k: int = 5


class AhspCandidate(BaseModel):
    ahsp_code: str
    name: str
    unit: str
    score: float
    unit_ok: bool
    reason: str


class AhspSearchResult(BaseModel):
    candidates: List[AhspCandidate]


class WorkItemForMapping(BaseModel):
    work_id: str
    uraian: str
    unit: str
    work_type: str = ""


class AhspMapRequest(BaseModel):
    workitem: WorkItemForMapping
    sibling_work_types: List[str] = Field(default_factory=list)
    top_k: int = 5


class AhspMapResult(BaseModel):
    work_id: str
    candidates: List[AhspCandidate]
    warnings: List[str] = Field(default_factory=list)


class PriceBindRequest(BaseModel):
    ahsp_code: str
    region_code: str


class PriceBindingLine(BaseModel):
    resource_code: str
    coefficient: float
    has_price: bool
    unit_price: float | None = None


class PriceBindingResult(BaseModel):
    ahsp_code: str
    region_code: str
    lines: List[PriceBindingLine]
    missing_resources: List[str]
    coverage_ratio: float
