"""Deterministic eligibility gates for authoritative Measurement Facts."""
from __future__ import annotations

from typing import Any


class MeasurementEligibilityError(ValueError):
    pass


def require_measurement_eligibility(
    *, measurement_type: str, source_method: str, element_kind: str,
    verification_status: str, is_contextual_reference: bool = False,
    valid_unit: bool = True, binding_valid: bool = True,
    engine_calculation_id: str | None = None,
) -> None:
    verified_physical = element_kind == "physical_element" and verification_status in {"confirmed", "human_verified", "engine_verified"}
    if measurement_type == "count":
        if is_contextual_reference or not verified_physical:
            raise MeasurementEligibilityError("count requires a verified physical element; contextual references are ineligible")
        return
    if measurement_type in {"length", "area"}:
        geometry_ok = source_method == "geometry_engine" and verified_physical
        written_ok = source_method == "written_dimension" and valid_unit and binding_valid
        if not (geometry_ok or written_ok):
            raise MeasurementEligibilityError("length/area require verified geometry or a valid bound written dimension")
        return
    if measurement_type == "volume_input":
        if source_method != "geometry_engine" or not engine_calculation_id:
            raise MeasurementEligibilityError("volume is accepted only from a Core Engine typed-dimension result")
        return
    if measurement_type == "mass_input" and source_method not in {"geometry_engine", "written_dimension", "human_input"}:
        raise MeasurementEligibilityError("mass input requires a declared deterministic source")

def assumption_is_usable(assumption: Any, *, now) -> bool:
    """Unapproved, rejected, stale, and expired assumptions never enter quantities."""
    return (
        assumption.approval_status == "approved"
        and assumption.status == "approved"
        and assumption.stale_reason is None
        and (assumption.expires_at is None or assumption.expires_at > now)
    )
