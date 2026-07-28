from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


ArtifactKind = Literal[
    "original_document",
    "json1_raw",
    "dem_page",
    "extracted_text",
    "extracted_vector",
]

BboxSpace = Literal["pdf_points", "normalized_page", "pixel", "none"]

EvidencePointerRole = Literal["source", "corroborating", "contradicting", "decision"]

CanonicalFactStatus = Literal["candidate", "human_verified", "superseded", "stale"]

ResolutionDecisionStatus = Literal["proposed", "approved", "rejected", "stale", "superseded"]


def _validate_timezone_aware(dt: datetime) -> datetime:
    if isinstance(dt, datetime) and dt.tzinfo is None:
        raise ValueError("created_at must be an RFC 3339 timestamp with an explicit timezone offset (e.g. 'Z' or '+07:00')")
    return dt


class RawEvidenceArtifact(BaseModel):
    schema_version: Literal["paax.contextual-evidence.v1"] = "paax.contextual-evidence.v1"
    artifact_id: str = Field(min_length=1)
    project_id: str = Field(min_length=1)
    document_id: str = Field(min_length=1)
    document_revision_id: Optional[str] = None
    artifact_kind: ArtifactKind
    content_sha256: str = Field(pattern=r"^[0-9a-fA-F]{64}$")
    storage_ref: str = Field(min_length=1)
    media_type: str = Field(min_length=1)
    byte_size: int = Field(ge=0)
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def validate_tz(cls, v: datetime) -> datetime:
        return _validate_timezone_aware(v)


class EvidenceRegion(BaseModel):
    region_id: str = Field(min_length=1)
    artifact_id: str = Field(min_length=1)
    project_id: str = Field(min_length=1)
    page_index: int = Field(ge=0)
    sheet_id: Optional[str] = None
    sheet_revision_id: Optional[str] = None
    view_id: Optional[str] = None
    zone_id: Optional[str] = None
    bbox_space: BboxSpace = "none"
    bbox: Optional[List[float]] = None
    project_graph_snapshot_id: Optional[str] = None
    project_graph_evidence_id: Optional[str] = None
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def validate_tz(cls, v: datetime) -> datetime:
        return _validate_timezone_aware(v)

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, v: Optional[List[float]]) -> Optional[List[float]]:
        if v is not None and len(v) != 4:
            raise ValueError("bbox must contain exactly 4 numbers [x, y, w, h]")
        return v

    @model_validator(mode="after")
    def validate_region_invariants(self) -> "EvidenceRegion":
        snap = self.project_graph_snapshot_id
        ev = self.project_graph_evidence_id
        if (snap is not None and ev is None) or (snap is None and ev is not None):
            raise ValueError("project_graph_snapshot_id and project_graph_evidence_id must appear together")

        if self.bbox_space == "none" and self.bbox is not None:
            raise ValueError("bbox must be None when bbox_space is 'none'")

        if self.bbox_space == "normalized_page" and self.bbox is not None:
            for coord in self.bbox:
                if coord < 0.0 or coord > 1.0:
                    raise ValueError("normalized_page bbox coordinates must be within [0.0, 1.0]")

        return self


class EvidencePointer(BaseModel):
    artifact_id: str = Field(min_length=1)
    region_id: Optional[str] = None
    project_graph_snapshot_id: Optional[str] = None
    project_graph_evidence_id: Optional[str] = None
    role: EvidencePointerRole = "source"

    @model_validator(mode="after")
    def validate_graph_evidence_pair(self) -> "EvidencePointer":
        snap = self.project_graph_snapshot_id
        ev = self.project_graph_evidence_id
        if (snap is not None and ev is None) or (snap is None and ev is not None):
            raise ValueError("project_graph_snapshot_id and project_graph_evidence_id must appear together")
        return self


class SourceAuthorityEntry(BaseModel):
    authority_id: str = Field(min_length=1)
    project_id: str = Field(min_length=1)
    source_kind: str = Field(min_length=1)
    source_ref: str = Field(min_length=1)
    version: str = Field(min_length=1)
    scope: Dict[str, Any] = Field(default_factory=dict)
    evidence_refs: List[str] = Field(min_length=1)
    supersedes_authority_id: Optional[str] = None
    created_by: str = Field(min_length=1)
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def validate_tz(cls, v: datetime) -> datetime:
        return _validate_timezone_aware(v)


class CanonicalFact(BaseModel):
    fact_id: str = Field(min_length=1)
    project_id: str = Field(min_length=1)
    snapshot_id: str = Field(min_length=1)
    fact_type: str = Field(min_length=1)
    subject_ref: str = Field(min_length=1)
    predicate: str = Field(min_length=1)
    value: Any
    status: CanonicalFactStatus = "candidate"
    evidence_refs: List[str] = Field(min_length=1)
    source_authority_id: Optional[str] = None
    supersedes_fact_id: Optional[str] = None
    calculation_authority: Literal["none"] = "none"
    created_by: str = Field(min_length=1)
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def validate_tz(cls, v: datetime) -> datetime:
        return _validate_timezone_aware(v)


class PropagationScope(BaseModel):
    project_id: str = Field(min_length=1)
    document_ids: Optional[List[str]] = None
    sheet_ids: Optional[List[str]] = None
    view_ids: Optional[List[str]] = None
    zone_ids: Optional[List[str]] = None
    revision_ids: Optional[List[str]] = None
    occurrence_ids: Optional[List[str]] = None
    match_mode: Literal["exact"] = "exact"


class ResolutionDecision(BaseModel):
    decision_id: str = Field(min_length=1)
    project_id: str = Field(min_length=1)
    snapshot_id: str = Field(min_length=1)
    target_fact_ids: List[str] = Field(min_length=1)
    selected_fact_id: Optional[str] = None
    status: ResolutionDecisionStatus = "proposed"
    scope: PropagationScope
    rationale: str = Field(min_length=1)
    decided_by: Optional[str] = None
    supersedes_decision_id: Optional[str] = None
    calculation_authority: Literal["none"] = "none"
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def validate_tz(cls, v: datetime) -> datetime:
        return _validate_timezone_aware(v)

    @model_validator(mode="after")
    def validate_decision_invariants(self) -> "ResolutionDecision":
        if self.scope.project_id != self.project_id:
            raise ValueError(f"scope.project_id '{self.scope.project_id}' must equal decision project_id '{self.project_id}'")

        if self.status == "approved":
            if not self.selected_fact_id:
                raise ValueError("selected_fact_id is required when status is approved")
            if not self.decided_by:
                raise ValueError("decided_by is required when status is approved")
            if self.selected_fact_id not in self.target_fact_ids:
                raise ValueError(f"selected_fact_id '{self.selected_fact_id}' must be included in target_fact_ids")
        return self
