from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class WbsDivision(BaseModel):
    code: str
    title: str


class WorkItem(BaseModel):
    work_id: str
    divisi: str
    work_type: str
    uraian_kanonik: str
    satuan: str
    asal: Literal["expanded", "implied", "derived"] = "expanded"
    rule_id: str
    rationale: str
    element_refs: List[str] = Field(default_factory=list)
    needs_review: bool = False


class WorkItemsResult(BaseModel):
    workitems: List[WorkItem]
    warnings: List[str] = Field(default_factory=list)


class ElementSeed(BaseModel):
    element_id: str
    kind: Literal["beton", "dinding", "lantai", "atap"]
    code: str
    length_m: Optional[float] = None
    height_m: Optional[float] = None
    wet_area: bool = False


class WbsCompletenessRequest(BaseModel):
    existing_divisions: List[str] = Field(default_factory=list)
    not_applicable: List[str] = Field(default_factory=list)


class WbsCompletenessResult(BaseModel):
    present_divisions: List[str]
    missing_relevant: List[str]
    not_applicable: List[str]
    warnings: List[str] = Field(default_factory=list)


class ImpliedRequest(BaseModel):
    prj_id: str
    government_project: bool = False
    concrete_pour_volume_m3: Optional[float] = None
    V_pompa_min: float = 30.0
