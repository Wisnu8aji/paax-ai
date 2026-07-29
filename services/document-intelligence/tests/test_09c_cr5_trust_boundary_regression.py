"""Phase 09C Correction Round 5 — Failing TDD Regression Tests.

These tests MUST fail against commit a231c2bb and pass after Round 5 implementation.

Covers:
  A. Private Object-Capability Receipt Boundary (No public create_verified or caller-constructed trust).
  B. Truthful Request Identity & Header Sanitization (idempotency fingerprint, safe header format).
  C. Endpoint-Specific Response Family Validation (reject wrong-family responses, parse distinct models).
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


class TestPrivateTrustBoundary:
    """Receipt trust MUST be an unexported object capability — no public factory or token."""

    def test_no_public_create_verified_exists(self):
        """DispatchReceipt MUST NOT expose a public create_verified classmethod."""
        assert not hasattr(DispatchReceipt, "create_verified"), (
            "Public create_verified classmethod MUST NOT exist on DispatchReceipt!"
        )

    def test_publicly_constructed_receipt_is_denied_authority(self):
        """A publicly constructed DispatchReceipt must yield source_authority='none'."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ])
        dispatch = build_engine_dispatch(item, project_id="P-1", snapshot_id="S-1", requested_by="U-1")
        response = {"status": "complete", "result": 1.0, "unit": "m3", "project_id": "P-1"}

        receipt = DispatchReceipt(context=dispatch.context, response=response)
        calc = calculation_from_response(item, response, receipt=receipt)
        assert calc.source_authority == "none"

    def test_dict_or_pydantic_deserialization_with_fake_token_is_denied(self):
        """Dict or Pydantic deserialization cannot grant authority (sentinel cannot be serialized)."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ])
        dispatch = build_engine_dispatch(item, project_id="P-1", snapshot_id="S-1", requested_by="U-1")
        response = {"status": "complete", "result": 1.0, "unit": "m3"}

        # Attempt to deserialize a fake token payload
        fake_data = {
            "context": dispatch.context.model_dump(),
            "response": response,
            "verification_token": "verified-client-fake",
        }
        receipt = DispatchReceipt.model_validate(fake_data)
        calc = calculation_from_response(item, response, receipt=receipt)
        assert calc.source_authority == "none"

    @pytest.mark.asyncio
    async def test_real_client_dispatch_grants_authority(self):
        """Client execution path is the ONLY way to obtain a trusted receipt."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ])
        dispatch = build_engine_dispatch(item, project_id="P-1", snapshot_id="S-1", requested_by="U-1")

        def handler(request: httpx.Request):
            return httpx.Response(200, json={"status": "complete", "result": 1.0, "unit": "m3", "project_id": "P-1"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://core") as http:
            client = CoreEngineCalculationClient("http://core", internal_key="x", client=http)
            response, receipt = await client.execute_dispatch(dispatch)

        calc = calculation_from_response(item, response, receipt=receipt)
        assert calc.source_authority == "core_engine"
        assert calc.result == 1.0


class TestTruthfulIdempotencyKey:
    """idempotency_key must be a safe, fixed-format SHA-256 opaque fingerprint."""

    def test_idempotency_key_is_safe_opaque_fingerprint(self):
        """idempotency_key must be an opaque hex-derived string without unescaped characters."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ])
        dispatch = build_engine_dispatch(item, project_id="P/1\r\nHeader", snapshot_id="S 1", requested_by="U")
        key = dispatch.context.idempotency_key
        assert key.startswith("idemp-")
        # Must be safe for HTTP headers (alphanumeric and dashes only)
        assert "\r" not in key and "\n" not in key and " " not in key and "/" not in key


class TestResponseFamilyValidation:
    """Validate separate response families; reject family mismatch."""

    @pytest.mark.asyncio
    async def test_calculations_response_given_to_takeoff_domain_is_denied(self):
        """A valid /calculations response presented for a /takeoff/tanah item must be denied."""
        item = _candidate("tanah", [_fact("length", 2.0), _fact("width", 2.0), _fact("depth", 1.5)], attributes={
            "engine_contract": "takeoff.tanah",
            "core_engine_payload": {"footplats": [{"kode": "FP1", "b_ft": 2.0, "l_ft": 2.0, "d_gali": 1.5, "n": 1}]},
        })
        dispatch = build_engine_dispatch(item, project_id="P-1", snapshot_id="S-1", requested_by="U")

        # Response shape from /calculations (status, result, unit), NOT domain takeoff (items list)
        wrong_family_response = {"status": "complete", "result": 6.0, "unit": "m3"}

        def handler(request: httpx.Request):
            return httpx.Response(200, json=wrong_family_response)

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://core") as http:
            client = CoreEngineCalculationClient("http://core", internal_key="x", client=http)
            response, receipt = await client.execute_dispatch(dispatch)

        calc = calculation_from_response(item, response, receipt=receipt)
        assert calc.source_authority == "none", "Response family mismatch must deny authority!"

    @pytest.mark.asyncio
    async def test_domain_response_with_extra_fields_is_denied(self):
        """Response with unknown extra fields must fail strict Pydantic validation (extra=forbid)."""
        item = _candidate("tanah", [_fact("length", 2.0), _fact("width", 2.0), _fact("depth", 1.5)], attributes={
            "engine_contract": "takeoff.tanah",
            "core_engine_payload": {"footplats": [{"kode": "FP1", "b_ft": 2.0, "l_ft": 2.0, "d_gali": 1.5, "n": 1}]},
        })
        dispatch = build_engine_dispatch(item, project_id="P-1", snapshot_id="S-1", requested_by="U")

        extra_field_response = {
            "domain": "tanah",
            "status": "complete",
            "items": [{"kode": "FP1", "work": "galian", "quantity": 6.0, "unit": "m3", "formula": "F1", "detail": "2x2x1.5", "needs_review": False, "rule_id": "R1"}],
            "unknown_extra_payload": "hack",
        }

        def handler(request: httpx.Request):
            return httpx.Response(200, json=extra_field_response)

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://core") as http:
            client = CoreEngineCalculationClient("http://core", internal_key="x", client=http)
            response, receipt = await client.execute_dispatch(dispatch)

        calc = calculation_from_response(item, response, receipt=receipt)
        assert calc.source_authority == "none"
