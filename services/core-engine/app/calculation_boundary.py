"""Typed, stateless calculation boundary for approved Measurement Facts."""
from __future__ import annotations
from decimal import Decimal
from hashlib import sha256
from typing import Literal
from pydantic import BaseModel, Field, model_validator
from paax_schemas.measurement import MeasurementFact
from .units import convert


class CalculationRequest(BaseModel):
    project_id: str
    snapshot_id: str
    measurement_fact_ids: list[str] = Field(min_length=1)
    calculation_type: Literal["concrete_column_volume", "length", "area", "count"]
    inputs: list[MeasurementFact] = Field(min_length=1)
    requested_by: str

    @model_validator(mode="after")
    def approved_and_scoped(self):
        if {item.measurement_id for item in self.inputs} != set(self.measurement_fact_ids):
            raise ValueError("measurement_fact_ids must exactly match typed inputs")
        for item in self.inputs:
            if item.project_id != self.project_id or item.snapshot_id != self.snapshot_id:
                raise ValueError("measurement facts must match project and snapshot")
            if item.verification_status.value not in {"human_verified", "engine_verified"}:
                raise ValueError("measurement facts require approval before calculation")
        return self


class CalculationResponse(BaseModel):
    calculation_id: str
    status: Literal["complete", "blocked", "needs_input"]
    formula: str | None = None
    substituted_formula: str | None = None
    result: float | None = None
    unit: str | None = None
    input_sources: list[dict[str, str]] = Field(default_factory=list)
    engine_version: str = "0.6.0"
    warnings: list[str] = Field(default_factory=list)


def calculate(request: CalculationRequest) -> CalculationResponse:
    digest = sha256((request.project_id + request.snapshot_id + request.calculation_type + ",".join(sorted(request.measurement_fact_ids))).encode()).hexdigest()[:24]
    sources = [{"measurement_id": fact.measurement_id, "source_method": fact.source_method.value, "unit": fact.unit} for fact in request.inputs]
    if request.calculation_type != "concrete_column_volume":
        return CalculationResponse(calculation_id=digest, status="blocked", input_sources=sources, warnings=["calculation type is not implemented by this boundary"])
    dimensions = {fact.formula_inputs[0]: fact for fact in request.inputs if len(fact.formula_inputs) == 1}
    if set(dimensions) != {"width", "depth", "height"}:
        return CalculationResponse(calculation_id=digest, status="needs_input", input_sources=sources, warnings=["width, depth, and height typed dimensions are required"])
    values = [convert(dimensions[key].typed_quantity, "m").value for key in ("width", "depth", "height")]
    result = values[0] * values[1] * values[2]
    return CalculationResponse(calculation_id=digest, status="complete", formula="width × depth × height", substituted_formula=f"{values[0]} × {values[1]} × {values[2]}", result=float(result), unit="m3", input_sources=sources)
