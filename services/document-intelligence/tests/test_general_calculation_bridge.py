import httpx
import pytest

from app.drawing_intelligence.calculation_bridge import (
    CalculationNotReady, CoreEngineCalculationClient, build_engine_dispatch, calculation_from_response,
)
from app.drawing_intelligence.models import ElementMeasurementFact, WorkItemCandidate


def fact(field, value=1, unit="m"):
    if field == "count": unit = "unit"
    if field == "area": unit = "m2"
    return ElementMeasurementFact(
        measurement_id=f"M-{field}", work_item_id="WI", field=field, value=value, unit=unit,
        source_method="written_dimension", verification_status="human_verified",
        evidence_refs=[f"EV-{field}"], source_page_indices=[0],
    )


def item(category, fields, attributes=None, conflicts=None):
    return WorkItemCandidate(
        work_item_id="WI", category=category, label=category, page_indices=[0], maturity="review_ready",
        physical_instance_ids=["I-1"], measurement_facts=[fact(f) for f in fields],
        attributes=attributes or {}, conflict_ids=conflicts or [], calculation_readiness="ready",
    )


def test_column_dispatch_is_formula_free_and_uses_verified_facts_only():
    dispatch = build_engine_dispatch(item("column", ["count", "width", "depth", "height"]), project_id="P", snapshot_id="S", requested_by="U")
    assert dispatch.endpoint == "/calculations"
    assert dispatch.payload["calculation_type"] == "concrete_column_total_volume"
    assert "formula" not in dispatch.payload
    assert {row["formula_inputs"][0] for row in dispatch.payload["inputs"]} == {"count", "width", "depth", "height"}


def test_generic_wall_area_routes_to_typed_engine_boundary():
    dispatch = build_engine_dispatch(item("wall", ["area"], {"quantity_basis": "area"}), project_id="P", snapshot_id="S", requested_by="U")
    assert dispatch.payload["calculation_type"] == "area"
    assert dispatch.payload["inputs"][0]["formula_inputs"] == ["area"]


def test_unsupported_or_conflicting_item_never_dispatches():
    with pytest.raises(CalculationNotReady):
        build_engine_dispatch(item("beam", ["count", "width", "depth", "height"]), project_id="P", snapshot_id="S", requested_by="U")
    with pytest.raises(CalculationNotReady):
        build_engine_dispatch(item("wall", ["area"], {"quantity_basis": "area"}, ["C"]), project_id="P", snapshot_id="S", requested_by="U")


@pytest.mark.asyncio
async def test_client_posts_to_capability_selected_endpoint():
    seen = {}
    def handler(request: httpx.Request):
        seen["path"] = request.url.path
        return httpx.Response(200, json={"status": "complete", "result": 2, "unit": "m2"})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://core") as http:
        client = CoreEngineCalculationClient("http://core", internal_key="x", client=http)
        dispatch = build_engine_dispatch(item("wall", ["area"], {"quantity_basis": "area"}), project_id="P", snapshot_id="S", requested_by="U")
        await client.dispatch(dispatch)
    assert seen["path"] == "/calculations"


def test_engine_authority_is_assigned_only_after_complete_result():
    work = item("wall", ["area"], {"quantity_basis": "area"})
    cap = build_engine_dispatch(work, project_id="P", snapshot_id="S", requested_by="U").capability
    complete = calculation_from_response(work, {"status": "complete", "result": 4.2, "unit": "m2"}, capability=cap)
    blocked = calculation_from_response(work, {"status": "needs_input", "result": None}, capability=cap)
    assert complete.source_authority == "core_engine"
    assert blocked.source_authority == "none"
