import httpx
import pytest

from app.drawing_intelligence.calculation_bridge import (
    CalculationNotReady, CoreEngineCalculationClient, DispatchReceipt, build_engine_dispatch, calculation_from_response,
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


def test_wall_without_contract_is_blocked_and_column_dispatches_normally():
    """wall (without engine_contract) is blocked per domain coverage matrix.
    column with full required facts dispatches to /calculations.
    """
    # wall without engine_contract is blocked
    with pytest.raises(CalculationNotReady):
        build_engine_dispatch(item("wall", ["area"], {"quantity_basis": "area"}), project_id="P", snapshot_id="S", requested_by="U")
    # column is supported
    dispatch = build_engine_dispatch(item("column", ["count", "width", "depth", "height"]), project_id="P", snapshot_id="S", requested_by="U")
    assert dispatch.endpoint == "/calculations"
    assert dispatch.payload["calculation_type"] == "concrete_column_total_volume"


def test_unsupported_or_conflicting_item_never_dispatches():
    with pytest.raises(CalculationNotReady):
        build_engine_dispatch(item("beam", ["count", "width", "depth", "height"]), project_id="P", snapshot_id="S", requested_by="U")
    with pytest.raises(CalculationNotReady):
        # conflict_ids block dispatch regardless of capability
        build_engine_dispatch(item("column", ["count", "width", "depth", "height"], conflicts=["C"]), project_id="P", snapshot_id="S", requested_by="U")


@pytest.mark.asyncio
async def test_client_posts_to_capability_selected_endpoint():
    """CoreEngineCalculationClient dispatches to /calculations for column."""
    seen = {}
    def handler(request: httpx.Request):
        seen["path"] = request.url.path
        return httpx.Response(200, json={"status": "complete", "result": 2, "unit": "m3", "calculation_id": "calc-1"})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://core") as http:
        client = CoreEngineCalculationClient("http://core", internal_key="x", client=http)
        dispatch = build_engine_dispatch(item("column", ["count", "width", "depth", "height"]), project_id="P", snapshot_id="S", requested_by="U")
        await client.dispatch(dispatch)
    assert seen["path"] == "/calculations"


def test_engine_authority_is_assigned_only_after_complete_result():
    """source_authority=core_engine only after complete+non-null result with DispatchReceipt."""
    work = item("column", ["count", "width", "depth", "height"])
    dispatch = build_engine_dispatch(work, project_id="P", snapshot_id="S", requested_by="U")
    comp_resp = {"status": "complete", "result": 4.2, "unit": "m3", "project_id": "P"}
    comp_receipt = DispatchReceipt(context=dispatch.context, response=comp_resp)
    complete = calculation_from_response(work, comp_resp, receipt=comp_receipt)
    
    blocked_resp = {"status": "needs_input", "result": None}
    blocked_receipt = DispatchReceipt(context=dispatch.context, response=blocked_resp)
    blocked = calculation_from_response(work, blocked_resp, receipt=blocked_receipt)
    assert complete.source_authority == "core_engine"
    assert blocked.source_authority == "none"
