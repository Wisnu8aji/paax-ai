from app.drawing_intelligence.models import ElementMeasurementFact, WorkItemCandidate
from app.drawing_intelligence.takeoff_capabilities import capability_coverage, resolve_takeoff_capability


def fact(field: str, *, value: float = 1, unit: str = "m") -> ElementMeasurementFact:
    if field == "count": unit = "unit"
    return ElementMeasurementFact(
        measurement_id=f"M-{field}", work_item_id="WI", field=field, value=value, unit=unit,
        source_method="written_dimension", verification_status="human_verified",
        evidence_refs=[f"EV-{field}"], source_page_indices=[0],
    )


def item(category: str, fields=(), attributes=None, conflicts=None):
    return WorkItemCandidate(
        work_item_id="WI", category=category, label=category, page_indices=[0], maturity="review_ready",
        evidence_refs=["EV"], measurement_facts=[fact(field) for field in fields],
        attributes=attributes or {}, conflict_ids=conflicts or [], calculation_readiness="ready",
    )


def test_column_uses_existing_typed_core_engine_contract():
    cap = resolve_takeoff_capability(item("column", ("count", "width", "depth", "height")))
    assert cap.endpoint == "/calculations"
    assert cap.calculation_type == "concrete_column_total_volume"
    assert cap.source_authority == "core_engine"


def test_beam_uses_typed_span_length_core_engine_contract():
    """C2 — beam/balok resolves to concrete_beam_total_volume (span_length contract)."""
    coverage = capability_coverage(item("beam", ("count", "width", "depth", "span_length")))
    assert coverage["capability"]["status"] == "supported"
    assert coverage["capability"]["endpoint"] == "/calculations"
    assert coverage["capability"]["calculation_type"] == "concrete_beam_total_volume"
    assert coverage["ready"] is True
    # Missing span evidence is a readiness gap, not a blocked category.
    missing = capability_coverage(item("beam", ("count", "width", "depth")))
    assert missing["capability"]["status"] == "supported"
    assert missing["ready"] is False
    assert "span_length" in missing["missing_fields"]


def test_wall_blocked_without_explicit_dinding_contract():
    """wall without explicit engine_contract (takeoff.dinding) is blocked per domain coverage matrix."""
    cap = resolve_takeoff_capability(item("wall", ("area",), {"quantity_basis": "area"}))
    assert cap.status == "blocked", f"wall must be blocked; got {cap.status}"
    assert cap.endpoint is None


def test_mep_requires_explicit_engine_contract_not_category_only():
    """mep without engine_contract is blocked; with valid contract+payload it resolves."""
    assert resolve_takeoff_capability(item("mep", ("count",))).status == "blocked"
    # mep with valid engine_contract + core_engine_payload resolves to /takeoff/mep
    cap = resolve_takeoff_capability(item("mep", ("count",), {
        "engine_contract": "takeoff.mep", "core_engine_payload": {"pipa": []},
    }))
    assert cap.endpoint == "/takeoff/mep"


def test_open_conflict_keeps_coverage_not_ready():
    coverage = capability_coverage(item("wall", ("area",), {"quantity_basis": "area"}, ["C-1"]))
    assert coverage["ready"] is False
