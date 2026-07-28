"""Typed Measurement Fact contracts shared at PAAX service boundaries.

Measurement values are always coupled with a unit and dimension.  This module
intentionally does not calculate construction quantities; the Core Engine owns
those calculations.
"""
from __future__ import annotations

from decimal import Decimal
from enum import Enum
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, field_validator, model_validator


class MeasurementType(str, Enum):
    COUNT = "count"
    LENGTH = "length"
    AREA = "area"
    VOLUME_INPUT = "volume_input"
    MASS_INPUT = "mass_input"


class SourceMethod(str, Enum):
    VERIFIED_INSTANCES = "verified_instances"
    WRITTEN_DIMENSION = "written_dimension"
    GEOMETRY_ENGINE = "geometry_engine"
    HUMAN_INPUT = "human_input"


class VerificationStatus(str, Enum):
    CANDIDATE = "candidate"
    HUMAN_VERIFIED = "human_verified"
    ENGINE_VERIFIED = "engine_verified"
    SUPERSEDED = "superseded"


class AssumptionApprovalStatus(str, Enum):
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    STALE = "stale"


class Quantity(BaseModel):
    """A dimensional input; a numeric value is never accepted without unit."""

    value: Annotated[Decimal, Field(ge=0)]
    unit: str

    @field_validator("value", mode="before")
    @classmethod
    def reject_boolean(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("quantity value must be numeric, not boolean")
        return value


class Length(Quantity):
    unit: Literal["mm", "cm", "m", "inch"]


class Area(Quantity):
    unit: Literal["mm2", "cm2", "m2", "inch2"]


class Volume(Quantity):
    unit: Literal["mm3", "cm3", "m3", "inch3"]


class Mass(Quantity):
    unit: Literal["g", "kg", "tonne"]


class Count(Quantity):
    unit: Literal["unit"] = "unit"

    @field_validator("value")
    @classmethod
    def require_whole_count(cls, value: Decimal) -> Decimal:
        if value != value.to_integral_value():
            raise ValueError("count must be a whole number")
        return value


TypedQuantity = Union[Length, Area, Volume, Mass, Count]


class MeasurementFact(BaseModel):
    measurement_id: str
    project_id: str
    snapshot_id: str
    measurement_type: MeasurementType
    value: Annotated[Decimal, Field(ge=0)]
    unit: str
    source_method: SourceMethod
    element_ids: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)
    formula_inputs: list[str] = Field(default_factory=list)
    verification_status: VerificationStatus = VerificationStatus.CANDIDATE
    created_by: str | None = None
    audit_metadata: dict[str, object] = Field(default_factory=dict)
    supersedes_measurement_id: str | None = None

    @model_validator(mode="after")
    def require_type_unit_match(self) -> "MeasurementFact":
        expected = {
            MeasurementType.COUNT: Count,
            MeasurementType.LENGTH: Length,
            MeasurementType.AREA: Area,
            MeasurementType.VOLUME_INPUT: Volume,
            MeasurementType.MASS_INPUT: Mass,
        }[self.measurement_type]
        expected(value=self.value, unit=self.unit)
        return self

    @property
    def typed_quantity(self) -> TypedQuantity:
        quantity_type = {
            MeasurementType.COUNT: Count,
            MeasurementType.LENGTH: Length,
            MeasurementType.AREA: Area,
            MeasurementType.VOLUME_INPUT: Volume,
            MeasurementType.MASS_INPUT: Mass,
        }[self.measurement_type]
        return quantity_type(value=self.value, unit=self.unit)


class SheetClassificationKey(str, Enum):
    COVER = "cover"
    DRAWING_LIST = "drawing_list"
    SITE_PLAN = "site_plan"
    PLAN = "plan"
    ELEVATION = "elevation"
    SECTION = "section"
    DETAIL = "detail"
    SCHEDULE = "schedule"
    DIAGRAM = "diagram"
    TECHNICAL_NOTE = "technical_note"
    UNKNOWN = "unknown"


class SheetViewStatus(str, Enum):
    CLASSIFIED = "classified"
    NEEDS_REVIEW = "needs_review"


class SheetViewEntry(BaseModel):
    """Immutable page identity plus derived sheet-navigation metadata."""

    page_index: Annotated[int, Field(ge=0)]
    page_number: Annotated[int, Field(ge=1)]
    level_key: str = Field(min_length=1)
    classification_key: SheetClassificationKey
    evidence_refs: list[str] = Field(default_factory=list)
    status: SheetViewStatus
    review_reason: str | None = None

    @model_validator(mode="after")
    def require_immutable_page_number(self) -> "SheetViewEntry":
        if self.page_number != self.page_index + 1:
            raise ValueError("page_number must equal page_index plus one")
        if self.status == SheetViewStatus.NEEDS_REVIEW and not self.review_reason:
            raise ValueError("needs_review sheet entry requires review_reason")
        if self.status == SheetViewStatus.CLASSIFIED and self.review_reason is not None:
            raise ValueError("classified sheet entry cannot carry review_reason")
        return self


class SheetViews(BaseModel):
    """Three immutable views over the same source-page identities.

    The arrays may differ only in order. They may never drop, duplicate, or
    rewrite a source page.
    """

    level: list[SheetViewEntry] = Field(default_factory=list)
    classification: list[SheetViewEntry] = Field(default_factory=list)
    source: list[SheetViewEntry] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_same_immutable_pages(self) -> "SheetViews":
        views = {
            "level": self.level,
            "classification": self.classification,
            "source": self.source,
        }
        indexed: dict[str, dict[int, SheetViewEntry]] = {}
        for name, entries in views.items():
            page_map: dict[int, SheetViewEntry] = {}
            for entry in entries:
                if entry.page_index in page_map:
                    raise ValueError(f"{name} view contains duplicate page_index {entry.page_index}")
                page_map[entry.page_index] = entry
            indexed[name] = page_map

        identity_sets = {name: set(page_map) for name, page_map in indexed.items()}
        if not (identity_sets["level"] == identity_sets["classification"] == identity_sets["source"]):
            raise ValueError("level, classification, and source views must contain the same page identities")

        for page_index in identity_sets["source"]:
            canonical = indexed["source"][page_index].model_dump(mode="json")
            for name in ("level", "classification"):
                if indexed[name][page_index].model_dump(mode="json") != canonical:
                    raise ValueError(
                        f"derived views may reorder but must not rewrite page identity {page_index}"
                    )

        source_indices = [entry.page_index for entry in self.source]
        if source_indices != sorted(source_indices):
            raise ValueError("source view must preserve immutable PDF page order")
        return self


class QuantityAssumption(BaseModel):
    """A human/evidence supplied typed input; approval is always explicit."""
    id: str
    project_id: str
    element_type_id: str | None = None
    snapshot_id: str | None = None
    value: Annotated[Decimal, Field(ge=0)]
    unit: str
    scope: dict[str, object]
    rationale: str = Field(min_length=1)
    owner: str = Field(min_length=1)
    approval_status: AssumptionApprovalStatus = AssumptionApprovalStatus.PENDING_APPROVAL
    expires_at: str | None = None
    stale_reason: str | None = None
    evidence_refs: list[str] = Field(default_factory=list)
    explicit_human_source: bool = False
    source_role: str = "human"
    status: AssumptionApprovalStatus = AssumptionApprovalStatus.PENDING_APPROVAL

    @model_validator(mode="after")
    def require_evidence_or_explicit_human_source(self) -> "QuantityAssumption":
        if not self.evidence_refs and not self.explicit_human_source:
            raise ValueError("assumption requires evidence or explicit human source")
        return self
