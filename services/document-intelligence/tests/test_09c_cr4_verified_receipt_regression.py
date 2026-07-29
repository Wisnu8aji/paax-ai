"""Phase 09C Correction Round 4 — Failing TDD Regression Tests.

These tests MUST fail against commit 343ed505 and pass after Round 4 implementation.

Covers:
  A. Verified Client Receipt (Ordinary caller-constructed DispatchReceipt is DENIED authority).
  B. Idempotency & Full Context Correlation (idempotency_key, X-Idempotency-Key header, evidence re-check).
  C. Endpoint-Specific Response Pydantic Validation & Anti-Forgery.
"""
from __future__ import annotations

import httpx
import pytest

from app.drawing_intelligence.calculation_bridge import (
    CalculationNotReady,
    CoreEngineCalculationClient,
    DispatchContext,
    DispatchReceipt,
    build_engine_dispatch,
    calculation_from_response,
)
from app.drawing_intelligence.models import ElementMeasurementFact, WorkItemCandidate


def _fact(field: str, value: float = 1.0, unit: str | None = None, *, work_item_id: str = "WI-01") -> ElementMeasurementFact:
    unit_defaults = {
        "count": "unit", "area": "m2", "volume": "m3",
        "length": "m", "width": "m", "height": "m",
        "depth": "m", "elevation": "m",
    }
    resolved_unit = unit or unit_defaults.get(field, "m")
    return ElementMeasurementFact(
        measurement_id=f"M-{field}",
        work_item_id=work_item_id,
        field=field,  # type: ignore[arg-type]
        value=value,
        unit=resolved_unit,
        source_method="written_dimension",
        verification_status="human_verified",
        evidence_refs=["EV-1"],
        source_page_indices=[0],
    )


def _candidate(
    category: str,
    facts: list[ElementMeasurementFact],
    *,
    attributes: dict | None = None,
    work_item_id: str = "WI-01",
) -> WorkItemCandidate:
    return WorkItemCandidate(
        work_item_id=work_item_id,
        category=category,
        label=category,
        page_indices=[0],
        maturity="review_ready",
        physical_instance_ids=["I-1"],
        measurement_facts=facts,
        attributes=attributes or {},
        conflict_ids=[],
        calculation_readiness="ready",
    )


class TestVerifiedClientReceipt:
    """Ordinary caller-constructed DispatchReceipt MUST NOT grant core_engine authority."""

    def test_publicly_constructed_receipt_is_denied_authority(self):
        """A manually constructed DispatchReceipt must NOT yield source_authority='core_engine'."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ])
        dispatch = build_engine_dispatch(item, project_id="P-1", snapshot_id="S-1", requested_by="U-1")
        response = {"status": "complete", "result": 1.0, "unit": "m3", "project_id": "P-1"}

        # Caller manually constructs a receipt
        unverified_receipt = DispatchReceipt(context=dispatch.context, response=response)
        calc = calculation_from_response(item, response, receipt=unverified_receipt)

        assert calc.source_authority == "none", (
            "Unverified/caller-constructed DispatchReceipt must NOT grant core_engine authority!"
        )

    @pytest.mark.asyncio
    async def test_client_dispatch_produces_verified_receipt_and_grants_authority(self):
        """Only dispatch execution via CoreEngineCalculationClient creates a verified receipt."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ])
        dispatch = build_engine_dispatch(item, project_id="P-1", snapshot_id="S-1", requested_by="U-1")

        def handler(request: httpx.Request):
            # Check idempotency header
            assert "X-Idempotency-Key" in request.headers
            assert request.headers["X-Idempotency-Key"] == dispatch.context.idempotency_key
            return httpx.Response(200, json={
                "status": "complete", "result": 1.0, "unit": "m3", "project_id": "P-1"
            })

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://core") as http:
            client = CoreEngineCalculationClient("http://core", internal_key="x", client=http)
            # execute_dispatch returns (response_json, verified_receipt)
            response, verified_receipt = await client.execute_dispatch(dispatch)

        calc = calculation_from_response(item, response, receipt=verified_receipt)
        assert calc.source_authority == "core_engine"
        assert calc.result == 1.0


class TestIdempotencyAndContextCorrelation:
    """DispatchContext must include idempotency_key and verify full identity & evidence lineage."""

    def test_dispatch_context_has_non_empty_idempotency_key(self):
        """DispatchContext must include a non-empty idempotency_key."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ])
        dispatch = build_engine_dispatch(item, project_id="P-1", snapshot_id="S-1", requested_by="U-1")
        assert hasattr(dispatch.context, "idempotency_key")
        assert dispatch.context.idempotency_key.startswith("idemp-")

    @pytest.mark.asyncio
    async def test_evidence_lineage_tampering_denies_authority(self):
        """If work item facts change between dispatch and response evaluation, authority is denied."""
        item_before = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ])
        dispatch = build_engine_dispatch(item_before, project_id="P-1", snapshot_id="S-1", requested_by="U-1")

        def handler(request: httpx.Request):
            return httpx.Response(200, json={"status": "complete", "result": 1.0, "unit": "m3"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://core") as http:
            client = CoreEngineCalculationClient("http://core", internal_key="x", client=http)
            response, verified_receipt = await client.execute_dispatch(dispatch)

        # Tampered item with modified evidence refs (evidence lineage changed)
        tampered_fact = ElementMeasurementFact(
            measurement_id="M-count", work_item_id="WI-01", field="count", value=4.0, unit="unit",
            source_method="written_dimension", verification_status="human_verified",
            evidence_refs=["EV-FORGED-99"], source_page_indices=[0],
        )
        item_tampered = _candidate("column", [tampered_fact])
        calc = calculation_from_response(item_tampered, response, receipt=verified_receipt)
        assert calc.source_authority == "none"

    @pytest.mark.asyncio
    async def test_stale_receipt_for_different_context_denied(self):
        """Receipt from request A used for request B must be denied."""
        item_a = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ], work_item_id="WI-A")
        item_b = _candidate("column", [
            _fact("count", 2), _fact("width", 0.4), _fact("depth", 0.4), _fact("height", 3.0)
        ], work_item_id="WI-B")

        dispatch_a = build_engine_dispatch(item_a, project_id="P-1", snapshot_id="S-1", requested_by="U-1")

        def handler(request: httpx.Request):
            return httpx.Response(200, json={"status": "complete", "result": 1.0, "unit": "m3"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://core") as http:
            client = CoreEngineCalculationClient("http://core", internal_key="x", client=http)
            response_a, receipt_a = await client.execute_dispatch(dispatch_a)

        # Attempt to pass receipt_a for item_b
        calc = calculation_from_response(item_b, response_a, receipt=receipt_a)
        assert calc.source_authority == "none"


class TestStrictEndpointResponseValidation:
    """Response boundary schemas must enforce endpoint-specific Pydantic validation."""

    @pytest.mark.asyncio
    async def test_malformed_response_shape_denies_authority(self):
        """A response with invalid data types (e.g. string result where float required) denies authority."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ])
        dispatch = build_engine_dispatch(item, project_id="P-1", snapshot_id="S-1", requested_by="U-1")

        def handler(request: httpx.Request):
            return httpx.Response(200, json={"status": "complete", "result": "NOT_A_NUMBER", "unit": "m3"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://core") as http:
            client = CoreEngineCalculationClient("http://core", internal_key="x", client=http)
            response, receipt = await client.execute_dispatch(dispatch)

        calc = calculation_from_response(item, response, receipt=receipt)
        assert calc.source_authority == "none"
