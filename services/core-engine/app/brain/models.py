from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ProjectContext(BaseModel):
    prj_id: str
    mode: str
    tipe_bangunan: str = ""
    wilayah: str = ""
    periode_harga: str = ""
    ahsp_edisi: str = ""
    precedence_order: List[str] = Field(default_factory=list)
    param_snapshot: Dict[str, Any] = Field(default_factory=dict)
    disclaimer_flags: List[str] = Field(default_factory=list)


class BrainParamSnapshot(BaseModel):
    values: Dict[str, Any] = Field(default_factory=dict)
    sources: Dict[str, str] = Field(default_factory=dict)


class BrainAssumption(BaseModel):
    id: str
    kategori: str
    deskripsi: str
    param_ref: Optional[str] = None
    sumber: str = ""
    dampak: str = ""
    objek_ref: Optional[str] = None


class BrainWarning(BaseModel):
    kode: str
    pesan: str
    objek_ref: Optional[str] = None
    severity: str = "warning"


class BrainReviewTask(BaseModel):
    id: str
    target_ref: str
    alasan: List[str]
    prioritas: float
    status: str = "open"


class ConfidenceResult(BaseModel):
    method: str
    s_source: float
    s_corrob: float
    s_quality: float
    confidence: float
    needs_review: bool
    reasons: List[str] = Field(default_factory=list)


class QaIssue(BaseModel):
    code: str
    message: str
    severity: str = "error"
    objek_ref: Optional[str] = None


class QaRequest(BaseModel):
    weights_pct: List[float] = Field(default_factory=list)
    tol_bobot: float = 0.1
    price_coverage_ratio: Optional[float] = None
    work_ids: List[str] = Field(default_factory=list)
    unit_pairs: List[Dict[str, str]] = Field(default_factory=list)
    revision_ids: List[str] = Field(default_factory=list)
    sanity_checks: List[Dict[str, Any]] = Field(default_factory=list)
    boe_exists: bool = True


class QaResult(BaseModel):
    passed: bool
    issues: List[QaIssue] = Field(default_factory=list)


class BrainBoeRequest(BaseModel):
    project_context: ProjectContext
    param_snapshot: BrainParamSnapshot = Field(default_factory=BrainParamSnapshot)
    assumptions: List[BrainAssumption] = Field(default_factory=list)
    missing: List[str] = Field(default_factory=list)
    warnings: List[BrainWarning] = Field(default_factory=list)
    data_coverage_summary: Dict[str, Any] = Field(default_factory=dict)


class BrainBoe(BaseModel):
    project_context: ProjectContext
    assumptions: List[BrainAssumption]
    missing: List[str]
    warnings: List[BrainWarning]
    param_snapshot: BrainParamSnapshot
    data_coverage_summary: Dict[str, Any] = Field(default_factory=dict)
