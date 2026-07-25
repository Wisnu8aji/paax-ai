"""Typed DEM v2 observations and the compatibility adapter from DEM v1.

The v1 ``ObservationValue`` model remains the wire-compatible reader for old
fixtures and persisted sheets.  New extraction code can use these typed models
without changing the v1 contract.

Validation mode (Target 5, final remediation wave)
----------------------------------------------------
``adapt_dem_observations``/``adapt_observation`` take an explicit
``mode: TypedValidationMode``:

- ``"strict"`` -- the v2 evidence-by-status contract (see
  ``TypedObservationBase.validate_evidence_requirements``) is a hard gate.
  A validation failure is a real error the caller must treat as a
  quarantine signal (exclude from retrieval eligibility), not just an
  audit note. All NEW extraction must use this mode.
- ``"legacy_compatibility"`` -- validation failures are swallowed and
  reported for audit only; existing/legacy sheets that predate the v2
  evidence contract can still be synthesized. This mode exists ONLY to
  avoid regressing already-accepted production data captured before the
  v2 contract existed -- it must never become the permanent default for
  new extraction (see DEM_TYPED_VALIDATION_MODE in synthesis_task.py).
"""
from __future__ import annotations

from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, Field, ValidationError, model_validator

from app.transcription.models import DemObservations, DemStatus, ObservationValue

TypedValidationMode = Literal["strict", "legacy_compatibility"]


class VerificationRecord(BaseModel):
    verifier_id: str
    verified_at: str
    method: str = "manual"
    note: Optional[str] = None


class TypedObservationBase(BaseModel):
    """Fields shared by every v2 observation, including all v1 base fields."""

    schema_version: Literal["paax.dem.observation.v2"] = "paax.dem.observation.v2"
    raw: str
    normalized: Optional[str] = None
    numeric_value: Optional[float] = None
    unit: Optional[str] = None
    bbox: Optional[tuple[float, float, float, float]] = None
    confidence: float = Field(ge=0.0, le=1.0)
    status: DemStatus = "extracted"
    evidence_refs: list[str] = Field(default_factory=list)
    interpretation_method: Optional[str] = None
    verification_record: Optional[VerificationRecord] = None

    @model_validator(mode="after")
    def validate_evidence_requirements(self) -> "TypedObservationBase":
        if self.status == "missing":
            return self
        if self.status == "extracted" and not self.evidence_refs:
            raise ValueError("extracted observations require at least one evidence_ref")
        if self.status == "ai_interpreted":
            if not self.evidence_refs:
                raise ValueError("ai_interpreted observations require at least one evidence_ref")
            if not self.interpretation_method:
                raise ValueError("ai_interpreted observations require interpretation_method")
        if self.status == "conflicting" and len(self.evidence_refs) < 2:
            raise ValueError("conflicting observations require at least two evidence_refs")
        if self.status == "human_verified" and self.verification_record is None:
            raise ValueError("human_verified observations require verification_record")
        return self


class TextSpanObservation(TypedObservationBase):
    text_role: Optional[str] = None


class DimensionObservation(TypedObservationBase):
    dimension_line: Optional[tuple[float, float, float, float]] = None
    extension_points: list[tuple[float, float]] = Field(default_factory=list)
    orientation: Optional[Literal["horizontal", "vertical", "radial", "angular", "unknown"]] = None
    object_candidates: list[str] = Field(default_factory=list)
    scale_context: Optional[str] = None


class GridAxisObservation(TypedObservationBase):
    axis_label: Optional[str] = None
    axis_direction: Optional[Literal["horizontal", "vertical", "unknown"]] = None
    axis_line: Optional[tuple[float, float, float, float]] = None


class GridIntersectionObservation(TypedObservationBase):
    axis_labels: list[str] = Field(default_factory=list)
    point: Optional[tuple[float, float]] = None


class LevelMarkerObservation(TypedObservationBase):
    marker: Optional[str] = None
    elevation_text: Optional[str] = None


class SpaceLabelObservation(TypedObservationBase):
    space_name: Optional[str] = None
    space_code: Optional[str] = None


class ElementTagObservation(TypedObservationBase):
    tag: Optional[str] = None
    element_class: Optional[str] = None


class SymbolObservation(TypedObservationBase):
    polygon: list[tuple[float, float]] = Field(default_factory=list)
    visual_signature: Optional[str] = None
    rotation: Optional[float] = None
    scale: Optional[float] = None
    candidate_class: Optional[str] = None
    legend_reference: Optional[str] = None
    confidence_breakdown: dict[str, float] = Field(default_factory=dict)


class TableCellObservation(TypedObservationBase):
    row_index: int = Field(ge=0)
    column_index: int = Field(ge=0)
    cell_bbox: Optional[tuple[float, float, float, float]] = None
    is_header: bool = False
    merged_range: Optional[tuple[int, int, int, int]] = None


class TableObservation(TypedObservationBase):
    row_count: int = Field(ge=0, default=0)
    column_count: int = Field(ge=0, default=0)
    header_cells: list[TableCellObservation] = Field(default_factory=list)
    merged_cells: list[tuple[int, int, int, int]] = Field(default_factory=list)
    cells: list[TableCellObservation] = Field(default_factory=list)
    reading_order: list[str] = Field(default_factory=list)
    row_to_element_mapping_candidates: list[str] = Field(default_factory=list)


class ReferenceCalloutObservation(TypedObservationBase):
    reference_target: Optional[str] = None
    callout_kind: Optional[str] = None


class MaterialObservation(TypedObservationBase):
    material_name: Optional[str] = None
    specification: Optional[str] = None


class NoteObservation(TypedObservationBase):
    note_kind: Optional[str] = None
    note_text: Optional[str] = None


class GeometryPrimitiveObservation(TypedObservationBase):
    primitive_type: Optional[Literal["line", "polyline", "rectangle", "circle", "arc", "unknown"]] = None
    points: list[tuple[float, float]] = Field(default_factory=list)


class DrawingZoneObservation(TypedObservationBase):
    zone_type: Optional[str] = None
    zone_label: Optional[str] = None
    child_observation_refs: list[str] = Field(default_factory=list)


TypedObservation = Union[
    TextSpanObservation,
    DimensionObservation,
    GridAxisObservation,
    GridIntersectionObservation,
    LevelMarkerObservation,
    SpaceLabelObservation,
    ElementTagObservation,
    SymbolObservation,
    TableObservation,
    TableCellObservation,
    ReferenceCalloutObservation,
    MaterialObservation,
    NoteObservation,
    GeometryPrimitiveObservation,
    DrawingZoneObservation,
]


class TypedDemObservations(BaseModel):
    schema_version: Literal["paax.dem.observations.v2"] = "paax.dem.observations.v2"
    texts: list[TextSpanObservation] = Field(default_factory=list)
    dimensions: list[DimensionObservation] = Field(default_factory=list)
    grids: list[GridAxisObservation] = Field(default_factory=list)
    levels: list[LevelMarkerObservation] = Field(default_factory=list)
    spaces: list[SpaceLabelObservation] = Field(default_factory=list)
    element_labels: list[ElementTagObservation] = Field(default_factory=list)
    symbols: list[SymbolObservation] = Field(default_factory=list)
    tables: list[TableObservation] = Field(default_factory=list)
    materials: list[MaterialObservation] = Field(default_factory=list)
    notes: list[NoteObservation] = Field(default_factory=list)
    references: list[ReferenceCalloutObservation] = Field(default_factory=list)
    patterns: list[SymbolObservation] = Field(default_factory=list)
    geometry_descriptions: list[GeometryPrimitiveObservation] = Field(default_factory=list)


_CATEGORY_TYPES: dict[str, type[TypedObservationBase]] = {
    "texts": TextSpanObservation,
    "dimensions": DimensionObservation,
    "grids": GridAxisObservation,
    "levels": LevelMarkerObservation,
    "spaces": SpaceLabelObservation,
    "element_labels": ElementTagObservation,
    "symbols": SymbolObservation,
    "tables": TableObservation,
    "materials": MaterialObservation,
    "notes": NoteObservation,
    "references": ReferenceCalloutObservation,
    "patterns": SymbolObservation,
    "geometry_descriptions": GeometryPrimitiveObservation,
}


def adapt_observation(category: str, observation: ObservationValue) -> TypedObservationBase:
    """Convert one v1 observation using its original DEM array as the type hint."""
    try:
        model_type = _CATEGORY_TYPES[category]
    except KeyError as exc:
        raise ValueError(f"unsupported DEM observation category: {category}") from exc
    return model_type(**observation.model_dump())


def adapt_dem_observations(
    observations: DemObservations, *, mode: TypedValidationMode = "legacy_compatibility"
) -> TypedDemObservations:
    """Convert a complete v1 observation collection without mutating the input.

    In "strict" mode, any observation that fails the v2 evidence-by-status
    contract raises ValidationError (propagated to the caller as a hard
    failure). In "legacy_compatibility" mode, observations that fail are
    silently dropped from the returned collection rather than raising --
    callers relying on this mode for audit purposes should validate each
    observation individually (see adapt_observation) if they need to know
    which ones failed.
    """
    values: dict[str, list[TypedObservationBase]] = {}
    for category in DemObservations.model_fields:
        converted: list[TypedObservationBase] = []
        for item in getattr(observations, category):
            try:
                converted.append(adapt_observation(category, item))
            except ValidationError:
                if mode == "strict":
                    raise
                continue
        values[category] = converted
    return TypedDemObservations(**values)

