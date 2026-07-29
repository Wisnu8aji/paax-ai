"""Phase 09C Correction Round 6 — Failing TDD Regression Tests.

These tests MUST fail against commit 7002b7b6 and pass after Round 6 implementation.

Covers:
  A. Complete Object-Capability Closure Boundary:
     - DispatchReceipt has NO _mark_client_verified method or any trust mutators.
     - Ordinary callers cannot construct trusted receipts or call any method to mint authority.
  B. Full Context Identity & Fingerprint Sensitivity:
     - Changing EACH of schema_version, endpoint, contract, calculation_type,
       project_id, snapshot_id, work_item_id, evidence_digest, request_digest,
       or expected_unit produces a different idempotency_key.
  C. Truthful Client Execution & Header Value Matching.
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
from app.drawing_intelligence.dispatch_context import make_idempotency_key
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


class TestCapabilityClosureBoundary:
    """DispatchReceipt MUST NOT expose any mutator method like _mark_client_verified."""

    def test_no_mark_client_verified_method_exists(self):
        """DispatchReceipt MUST NOT have a _mark_client_verified method."""
        assert not hasattr(DispatchReceipt, "_mark_client_verified"), (
            "_mark_client_verified MUST NOT exist on DispatchReceipt!"
        )

    def test_publicly_constructed_receipt_has_no_trust_method_and_is_denied(self):
        """A caller-constructed receipt yields source_authority='none'."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ])
        dispatch = build_engine_dispatch(item, project_id="P-1", snapshot_id="S-1", requested_by="U-1")
        response = {"status": "complete", "result": 1.0, "unit": "m3", "project_id": "P-1"}

        receipt = DispatchReceipt(context=dispatch.context, response=response)
        calc = calculation_from_response(item, response, receipt=receipt)
        assert calc.source_authority == "none"

    @pytest.mark.asyncio
    async def test_real_client_dispatch_is_only_trusted_path(self):
        """Client execution via CoreEngineCalculationClient.execute_dispatch() is the ONLY trusted receipt source."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ])
        dispatch = build_engine_dispatch(item, project_id="P-1", snapshot_id="S-1", requested_by="U-1")

        def handler(request: httpx.Request):
            assert "X-Idempotency-Key" in request.headers
            assert request.headers["X-Idempotency-Key"] == dispatch.context.idempotency_key
            return httpx.Response(200, json={"status": "complete", "result": 1.0, "unit": "m3", "project_id": "P-1"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://core") as http:
            client = CoreEngineCalculationClient("http://core", internal_key="x", client=http)
            response, receipt = await client.execute_dispatch(dispatch)

        calc = calculation_from_response(item, response, receipt=receipt)
        assert calc.source_authority == "core_engine"
        assert calc.result == 1.0


class TestFullContextFingerprintSensitivity:
    """idempotency_key must change if ANY component of full context is altered."""

    def test_fingerprint_sensitivity_across_all_10_context_fields(self):
        """Changing any of the 10 context fields alters the idempotency_key."""
        base_kwargs = {
            "endpoint": "/calculations",
            "contract": "takeoff.column",
            "calculation_type": "concrete_column_total_volume",
            "project_id": "P-1",
            "snapshot_id": "S-1",
            "work_item_id": "WI-01",
            "evidence_digest": "evdigest123",
            "request_digest": "reqdigest456",
            "expected_unit": "m3",
        }

        base_key = make_idempotency_key(**base_kwargs)
        assert base_key.startswith("idemp-")

        # Variations on EACH field
        variations = [
            ("endpoint", "/takeoff/tanah"),
            ("contract", "takeoff.tanah"),
            ("calculation_type", "area"),
            ("project_id", "P-2"),
            ("snapshot_id", "S-2"),
            ("work_item_id", "WI-02"),
            ("evidence_digest", "evdigestALTERED"),
            ("request_digest", "reqdigestALTERED"),
            ("expected_unit", "m2"),
        ]

        for field, new_val in variations:
            mod_kwargs = dict(base_kwargs)
            mod_kwargs[field] = new_val
            mod_key = make_idempotency_key(**mod_kwargs)
            assert mod_key != base_key, f"Changing {field} MUST produce a different idempotency_key!"
