"""Phase 09C Correction Round 3 — Failing TDD Regression Tests.

These tests must FAIL against f39f5313 (the existing implementation).
They prove exactly what is missing:
  A. Real typed endpoint-specific Pydantic request validation (not just key allowlist).
  B. Non-forgeable DispatchContext/receipt: authority can only come from a
     validated context bound to capability/project/snapshot/candidate/evidence/
     request-hash/expected-unit. Raw-response authority is impossible.
  C. Domain coverage matrix with explicit positive contract-gated paths
     for MEP and positive paths for every supported domain.
"""
from __future__ import annotations

import hashlib
import pytest

from app.drawing_intelligence.calculation_bridge import (
    CalculationNotReady,
    DispatchContext,
    DispatchReceipt,
    build_engine_dispatch,
    calculation_from_response,
    validate_endpoint_request,
)
from app.drawing_intelligence.models import ElementMeasurementFact, WorkItemCandidate
from app.drawing_intelligence.takeoff_capabilities import resolve_takeoff_capability


# ─── helpers ────────────────────────────────────────────────────────────────────

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
    conflict_ids: list[str] | None = None,
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
        conflict_ids=conflict_ids or [],
        calculation_readiness="ready",
    )


# ─── A. Typed Request Validation ────────────────────────────────────────────────

class TestTypedRequestValidation:
    """validate_endpoint_request() must enforce endpoint-specific Pydantic models
    with extra=forbid, nested type checking, finite values, valid ranges.
    """

    def test_validate_endpoint_request_is_importable(self):
        """validate_endpoint_request must be importable from calculation_bridge."""
        # Already imported at top of file — this will pass once implemented
        assert callable(validate_endpoint_request)

    def test_tanah_valid_payload_passes(self):
        """A valid TanahRequest-shaped payload passes strict validation."""
        payload = {
            "footplats": [{"kode": "FP1", "b_ft": 2.0, "l_ft": 2.0, "d_gali": 1.5, "n": 1}]
        }
        result = validate_endpoint_request("takeoff.tanah", payload)
        assert result is not None
        assert result["footplats"][0]["kode"] == "FP1"

    def test_tanah_rejects_precomputed_total_at_any_depth(self):
        """Precomputed totals at any nesting depth are rejected."""
        payload = {
            "footplats": [{"kode": "FP1", "b_ft": 2.0, "l_ft": 2.0, "d_gali": 1.5,
                           "volume_gali": 6.0}],  # nested precomputed field
        }
        with pytest.raises(CalculationNotReady) as exc:
            validate_endpoint_request("takeoff.tanah", payload)
        assert "extra" in str(exc.value).lower() or "not allowed" in str(exc.value).lower() or "forbidden" in str(exc.value).lower()

    def test_tanah_rejects_unknown_nested_keys(self):
        """Unknown keys in nested objects are rejected (extra=forbid propagated)."""
        payload = {
            "footplats": [{"kode": "FP1", "b_ft": 2.0, "l_ft": 2.0, "d_gali": 1.5,
                           "arbitrary_field": "hack"}],
        }
        with pytest.raises(CalculationNotReady):
            validate_endpoint_request("takeoff.tanah", payload)

    def test_tanah_rejects_negative_dimension(self):
        """Negative dimensions are rejected as impossible physical values."""
        payload = {
            "footplats": [{"kode": "FP1", "b_ft": -2.0, "l_ft": 2.0, "d_gali": 1.5}],
        }
        with pytest.raises(CalculationNotReady) as exc:
            validate_endpoint_request("takeoff.tanah", payload)
        msg = str(exc.value).lower()
        assert "positive" in msg or "negative" in msg or "greater" in msg or "invalid" in msg, (
            f"Expected error about invalid dimension, got: {exc.value}"
        )

    def test_tanah_rejects_nan_and_infinity(self):
        """NaN and Infinity are rejected as invalid numeric values."""
        import math
        payload = {
            "footplats": [{"kode": "FP1", "b_ft": math.nan, "l_ft": 2.0, "d_gali": 1.5}],
        }
        with pytest.raises(CalculationNotReady) as exc:
            validate_endpoint_request("takeoff.tanah", payload)
        assert "nan" in str(exc.value).lower() or "invalid" in str(exc.value).lower() or "finite" in str(exc.value).lower()

    def test_tanah_rejects_empty_work_items(self):
        """Empty payload with no work items is rejected."""
        payload = {}  # No footplats, galian, urugan, pemadatan
        with pytest.raises(CalculationNotReady) as exc:
            validate_endpoint_request("takeoff.tanah", payload)
        assert "empty" in str(exc.value).lower() or "no work" in str(exc.value).lower() or "required" in str(exc.value).lower()

    def test_mep_valid_payload_passes(self):
        """A valid MepRequest-shaped payload passes strict validation."""
        payload = {
            "pipe_routes": [{"kode": "PR1", "length_m": 10.0, "qty": 2}]
        }
        result = validate_endpoint_request("takeoff.mep", payload)
        assert result is not None
        assert result["pipe_routes"][0]["kode"] == "PR1"

    def test_mep_advanced_valid_payload_passes(self):
        """A valid MepRequest-shaped payload passes for takeoff.mep_advanced."""
        payload = {
            "points": [{"kode": "MP1", "jenis": "titik_lampu", "count": 5}]
        }
        result = validate_endpoint_request("takeoff.mep_advanced", payload)
        assert result is not None

    def test_dinding_valid_payload_passes(self):
        """A valid DindingRequest-shaped payload passes strict validation."""
        payload = {
            "dinding": [{"kode": "D1", "l_dinding": 5.0, "h_dinding": 3.5}]
        }
        result = validate_endpoint_request("takeoff.dinding", payload)
        assert result is not None
        assert result["dinding"][0]["kode"] == "D1"

    def test_dinding_rejects_boolean_as_dimension(self):
        """Boolean passed as numeric dimension must be rejected."""
        payload = {
            "dinding": [{"kode": "D1", "l_dinding": True, "h_dinding": 3.5}],
        }
        with pytest.raises(CalculationNotReady) as exc:
            validate_endpoint_request("takeoff.dinding", payload)
        assert "bool" in str(exc.value).lower() or "invalid" in str(exc.value).lower() or "type" in str(exc.value).lower()

    def test_unknown_contract_raises(self):
        """Unknown engine_contract raises CalculationNotReady."""
        with pytest.raises(CalculationNotReady) as exc:
            validate_endpoint_request("takeoff.UNKNOWN_CONTRACT", {"some": "data"})
        assert "unknown" in str(exc.value).lower() or "no schema" in str(exc.value).lower() or "no validator" in str(exc.value).lower()


# ─── B. DispatchContext / Non-Forgeable Authority ───────────────────────────────

class TestDispatchContext:
    """DispatchContext must be an immutable receipt created only by the bridge.
    Authority must require this context; raw-response authority is impossible.
    """

    def test_dispatch_context_is_importable(self):
        """DispatchContext and DispatchReceipt must be importable."""
        assert DispatchContext is not None
        assert DispatchReceipt is not None

    def test_dispatch_context_created_from_build_engine_dispatch(self):
        """build_engine_dispatch must return a DispatchContext (or EngineDispatch with context)."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ])
        dispatch = build_engine_dispatch(item, project_id="P-001", snapshot_id="S-001", requested_by="U")
        # DispatchContext must be present (either as dispatch.context or dispatch itself is the context)
        assert hasattr(dispatch, "context") or hasattr(dispatch, "request_digest") or hasattr(dispatch, "evidence_digest")

    def test_dispatch_context_binds_all_required_fields(self):
        """DispatchContext must bind endpoint, contract, project_id, snapshot_id,
        work_item_id, evidence_fact_ids_or_digest, request_digest, expected_unit.
        """
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ], work_item_id="WI-COL-01")
        dispatch = build_engine_dispatch(item, project_id="P-001", snapshot_id="S-001", requested_by="U")
        ctx = dispatch.context if hasattr(dispatch, "context") else dispatch
        # All binding fields must be present
        assert ctx.endpoint is not None
        assert ctx.project_id == "P-001"
        assert ctx.snapshot_id == "S-001"
        assert ctx.work_item_id == "WI-COL-01"
        assert ctx.request_digest is not None  # hash of request payload
        assert ctx.expected_unit is not None  # e.g. "m3" for column volume
        assert ctx.evidence_digest is not None  # hash of fact ids

    def test_cannot_grant_authority_from_raw_response_alone(self):
        """calculation_from_response must require a context; a raw response alone
        cannot produce source_authority=core_engine.
        """
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ])
        # Attempt to get authority from raw response with no context
        response = {"status": "complete", "result": 1.0, "unit": "m3"}
        calc = calculation_from_response(item, response)
        assert calc.source_authority != "core_engine", (
            "source_authority must not be core_engine without a validated DispatchContext"
        )

    def test_authority_requires_matching_receipt(self):
        """Authority requires a DispatchReceipt with matching context."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ], work_item_id="WI-COL-01")
        dispatch = build_engine_dispatch(item, project_id="P-001", snapshot_id="S-001", requested_by="U")
        ctx = dispatch.context if hasattr(dispatch, "context") else dispatch
        # Valid response with matching context should grant authority
        response = {"status": "complete", "result": 1.0, "unit": "m3",
                    "calculation_id": "calc-1", "calculation_type": "concrete_column_total_volume"}
        receipt = DispatchReceipt(context=ctx, response=response)
        calc = calculation_from_response(item, response, receipt=receipt)
        assert calc.source_authority == "core_engine", (
            f"Valid receipt must grant core_engine authority; got {calc.source_authority}"
        )

    def test_mismatched_project_id_in_receipt_denies_authority(self):
        """DispatchReceipt with mismatched project_id must deny authority."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ], work_item_id="WI-COL-01")
        dispatch = build_engine_dispatch(item, project_id="P-001", snapshot_id="S-001", requested_by="U")
        ctx = dispatch.context if hasattr(dispatch, "context") else dispatch
        # Forge a context with different project_id
        forged_response = {"status": "complete", "result": 1.0, "unit": "m3",
                           "project_id": "EVIL-PROJECT"}
        receipt = DispatchReceipt(context=ctx, response=forged_response)
        calc = calculation_from_response(item, forged_response, receipt=receipt)
        assert calc.source_authority != "core_engine"

    def test_wrong_unit_in_response_denies_authority(self):
        """Response with wrong unit (kg vs m3) must deny authority even with receipt."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ], work_item_id="WI-COL-01")
        dispatch = build_engine_dispatch(item, project_id="P-001", snapshot_id="S-001", requested_by="U")
        ctx = dispatch.context if hasattr(dispatch, "context") else dispatch
        wrong_unit_response = {"status": "complete", "result": 1.0, "unit": "kg"}
        receipt = DispatchReceipt(context=ctx, response=wrong_unit_response)
        calc = calculation_from_response(item, wrong_unit_response, receipt=receipt)
        assert calc.source_authority != "core_engine"

    def test_incomplete_status_denies_authority(self):
        """Non-complete status denies authority even with valid receipt."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ], work_item_id="WI-COL-01")
        dispatch = build_engine_dispatch(item, project_id="P-001", snapshot_id="S-001", requested_by="U")
        ctx = dispatch.context if hasattr(dispatch, "context") else dispatch
        for bad_status in ["blocked", "needs_input", "pending", "error"]:
            resp = {"status": bad_status, "result": 1.0, "unit": "m3"}
            receipt = DispatchReceipt(context=ctx, response=resp)
            calc = calculation_from_response(item, resp, receipt=receipt)
            assert calc.source_authority != "core_engine", f"status={bad_status} must not grant authority"

    def test_null_result_denies_authority(self):
        """Null result denies authority even with valid receipt."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ], work_item_id="WI-COL-01")
        dispatch = build_engine_dispatch(item, project_id="P-001", snapshot_id="S-001", requested_by="U")
        ctx = dispatch.context if hasattr(dispatch, "context") else dispatch
        resp = {"status": "complete", "result": None, "unit": "m3"}
        receipt = DispatchReceipt(context=ctx, response=resp)
        calc = calculation_from_response(item, resp, receipt=receipt)
        assert calc.source_authority != "core_engine"

    def test_stale_context_wrong_work_item_denies_authority(self):
        """A context bound to a different work_item_id must deny authority."""
        item_a = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ], work_item_id="WI-A")
        item_b = _candidate("column", [
            _fact("count", 2), _fact("width", 0.4), _fact("depth", 0.4), _fact("height", 3.0)
        ], work_item_id="WI-B")
        dispatch_a = build_engine_dispatch(item_a, project_id="P-001", snapshot_id="S-001", requested_by="U")
        ctx_a = dispatch_a.context if hasattr(dispatch_a, "context") else dispatch_a
        # Use item_b with context from item_a (stale/wrong candidate)
        resp = {"status": "complete", "result": 1.0, "unit": "m3"}
        receipt = DispatchReceipt(context=ctx_a, response=resp)
        calc = calculation_from_response(item_b, resp, receipt=receipt)
        assert calc.source_authority != "core_engine", (
            "Authority must not be granted when work_item_id mismatch"
        )


# ─── C. Domain Coverage Matrix ──────────────────────────────────────────────────

class TestDomainCoverageMatrix:
    """Explicit test-backed matrix: supported positive paths and blocked paths."""

    # --- column: supported positive path ---
    def test_column_positive_path_with_receipt_grants_authority(self):
        """column dispatches to /calculations; valid receipt grants authority."""
        item = _candidate("column", [
            _fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)
        ], work_item_id="WI-COL-01")
        dispatch = build_engine_dispatch(item, project_id="P-001", snapshot_id="S-001", requested_by="U")
        ctx = dispatch.context if hasattr(dispatch, "context") else dispatch
        resp = {
            "status": "complete", "result": 1.0, "unit": "m3",
            "calculation_id": "calc-col-1",
            "calculation_type": "concrete_column_total_volume",
        }
        receipt = DispatchReceipt(context=ctx, response=resp)
        calc = calculation_from_response(item, resp, receipt=receipt)
        assert calc.source_authority == "core_engine"
        assert calc.result == 1.0
        assert calc.unit == "m3"

    # --- MEP positive path with explicit contract ---
    def test_mep_with_explicit_contract_positive_path(self):
        """MEP with explicit takeoff.mep engine_contract dispatches successfully."""
        item = _candidate("mep", [], attributes={
            "engine_contract": "takeoff.mep",
            "core_engine_payload": {
                "pipe_routes": [{"kode": "PR1", "length_m": 10.0, "qty": 2}]
            },
        })
        dispatch = build_engine_dispatch(item, project_id="P-001", snapshot_id="S-001", requested_by="U")
        assert dispatch.endpoint == "/takeoff/mep"
        ctx = dispatch.context if hasattr(dispatch, "context") else dispatch
        # /takeoff/mep response: items list with quantity, unit, status=complete at receipt level
        # For domain takeoff endpoints: receipt uses items-list format;
        # is_authority_valid() must handle domain responses via extract_result()
        resp = {
            "domain": "mep",
            "status": "complete",  # some engines echo status at root
            "items": [{
                "kode": "PR1", "work": "pipa_air", "quantity": 20.0,
                "unit": "m", "formula": "F-MEP", "detail": "10m x 2",
                "needs_review": False, "rule_id": "F-MEP"
            }],
            "engine_version": "core-engine-v1",
        }
        receipt = DispatchReceipt(context=ctx, response=resp)
        calc = calculation_from_response(item, resp, receipt=receipt)
        assert calc.source_authority == "core_engine"
        assert calc.result == 20.0

    def test_mep_advanced_with_explicit_contract_positive_path(self):
        """MEP with takeoff.mep_advanced engine_contract dispatches successfully."""
        item = _candidate("mep", [], attributes={
            "engine_contract": "takeoff.mep_advanced",
            "core_engine_payload": {
                "points": [{"kode": "MP1", "jenis": "titik_lampu", "count": 5}]
            },
        })
        dispatch = build_engine_dispatch(item, project_id="P-001", snapshot_id="S-001", requested_by="U")
        assert dispatch.endpoint == "/takeoff/mep-advanced"

    # --- tanah positive path with receipt ---
    def test_tanah_with_explicit_contract_positive_path_with_receipt(self):
        """tanah with engine_contract dispatches and grants authority with receipt."""
        item = _candidate("tanah", [
            _fact("length", 2.0), _fact("width", 2.0), _fact("depth", 1.5)
        ], attributes={
            "engine_contract": "takeoff.tanah",
            "core_engine_payload": {
                "footplats": [{"kode": "FP1", "b_ft": 2.0, "l_ft": 2.0, "d_gali": 1.5, "n": 1}],
            },
        })
        dispatch = build_engine_dispatch(item, project_id="P-001", snapshot_id="S-001", requested_by="U")
        assert dispatch.endpoint == "/takeoff/tanah"
        ctx = dispatch.context if hasattr(dispatch, "context") else dispatch
        resp = {
            "domain": "tanah",
            "status": "complete",
            "items": [{
                "kode": "FP1", "work": "galian_footplat", "quantity": 6.0,
                "unit": "m3", "formula": "F-F01", "detail": "2x2x1.5",
                "needs_review": False, "rule_id": "F-F01"
            }],
            "engine_version": "core-engine-v1",
        }
        receipt = DispatchReceipt(context=ctx, response=resp)
        calc = calculation_from_response(item, resp, receipt=receipt)
        assert calc.source_authority == "core_engine"
        assert calc.result == 6.0

    # --- beam: blocked ---
    def test_beam_blocked_returns_blocked_status(self):
        """beam has no supported endpoint — always blocked."""
        for cat in ("beam", "balok"):
            item = _candidate(cat, [_fact("count", 2), _fact("width", 0.3), _fact("depth", 0.5), _fact("height", 4.0)])
            cap = resolve_takeoff_capability(item)
            assert cap.status == "blocked", f"{cat} must be blocked"
            assert cap.endpoint is None

    # --- wall: blocked without contract ---
    def test_wall_blocked_without_contract(self):
        """wall without explicit engine_contract is blocked."""
        item = _candidate("wall", [_fact("area", 10.0, "m2")])
        cap = resolve_takeoff_capability(item)
        assert cap.status == "blocked"
        assert cap.endpoint is None

    # --- foundation: blocked ---
    def test_foundation_blocked_without_contract(self):
        """foundation without explicit engine_contract is blocked."""
        for cat in ("foundation", "pondasi"):
            item = _candidate(cat, [_fact("length", 2.0), _fact("width", 2.0), _fact("depth", 1.5)])
            cap = resolve_takeoff_capability(item)
            assert cap.status == "blocked"
            assert cap.endpoint is None

    # --- MEP: blocked without contract ---
    def test_mep_blocked_without_contract(self):
        """mep without engine_contract is blocked."""
        item = _candidate("mep", [_fact("length", 20.0)])
        cap = resolve_takeoff_capability(item)
        assert cap.status == "blocked"

    # domain matrix summary test
    def test_domain_coverage_matrix_summary(self):
        """Explicit domain coverage matrix summary — each domain with expected status."""
        matrix = [
            # (category, facts, attributes, expected_status, expected_endpoint)
            ("column", [_fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)],
             {}, "supported", "/calculations"),
            ("beam", [_fact("count", 2), _fact("width", 0.3), _fact("depth", 0.5), _fact("height", 4.0)],
             {}, "blocked", None),
            ("wall", [_fact("area", 10.0, "m2")], {}, "blocked", None),
            ("foundation", [_fact("length", 2.0), _fact("width", 2.0), _fact("depth", 1.5)],
             {}, "blocked", None),
            ("mep", [_fact("length", 20.0)], {}, "blocked", None),
            ("mep", [], {
                "engine_contract": "takeoff.mep",
                "core_engine_payload": {"pipe_routes": [{"kode": "PR1", "length_m": 10.0, "qty": 1}]},
             }, "supported", "/takeoff/mep"),
        ]
        for cat, facts, attrs, exp_status, exp_endpoint in matrix:
            item = _candidate(cat, facts, attributes=attrs)
            cap = resolve_takeoff_capability(item)
            assert cap.status == exp_status, (
                f"{cat}(attrs={list(attrs.keys())}): expected status={exp_status}, got {cap.status}"
            )
            assert cap.endpoint == exp_endpoint, (
                f"{cat}(attrs={list(attrs.keys())}): expected endpoint={exp_endpoint}, got {cap.endpoint}"
            )
