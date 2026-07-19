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
