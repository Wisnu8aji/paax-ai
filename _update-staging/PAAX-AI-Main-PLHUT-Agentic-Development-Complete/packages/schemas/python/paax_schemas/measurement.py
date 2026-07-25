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
