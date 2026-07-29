"""Regression tests for Phase 09C Correction Round 2.

These tests MUST fail against the current (defective) implementation and
PASS after the corrections are applied.  They cover:
  A. Dimensional-safe mapping – volume/m3 must NOT bind to berat_kg/kg.
  B. Manual-payload anti-bypass – core_engine_payload must be validated
     against an allowlisted endpoint-specific schema.
  C. Response/correlation safety – source_authority=core_engine requires
     endpoint-specific validation and request/project/candidate correlation.
  D. Domain coverage matrix – column (supported), beam (blocked), wall
     (requires explicit contract, blocked without one), foundation (blocked),
     MEP (blocked without explicit contract).
"""
from __future__ import annotations

import pytest

from app.drawing_intelligence.calculation_bridge import (
    CalculationNotReady,
    DispatchReceipt,
    build_engine_dispatch,
    calculation_from_response,
)
from app.drawing_intelligence.models import ElementMeasurementFact, WorkItemCandidate
from app.drawing_intelligence.takeoff_capabilities import resolve_takeoff_capability


# ─── helpers ───────────────────────────────────────────────────────────────────

def _fact(field: str, value: float = 1.0, unit: str | None = None, *, work_item_id: str = "WI-01") -> ElementMeasurementFact:
    unit_defaults = {
        "count": "unit", "area": "m2", "volume": "m3",
        "length": "m", "width": "m", "height": "m",
        "depth": "m", "weight": "kg", "elevation": "m",
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


# ─── A. Dimensional safety ─────────────────────────────────────────────────────

class TestDimensionalSafety:
    """volume/m3 must NEVER bind to berat_kg (which is kg).

    The 'baja' (steel) domain accepts berat_kg.  A work item with only a
    volume/m3 fact must NOT be dispatched to /takeoff/baja because that would
    silently reinterpret m3 as kg – a dimensional violation.
    """

    def test_volume_m3_fact_rejected_for_berat_kg_required_field(self):
        """volume (m3) must not satisfy berat_kg (kg) required field."""
        item = _candidate("baja", [_fact("volume", 2.5, "m3")])
        with pytest.raises(CalculationNotReady) as exc_info:
            build_engine_dispatch(item, project_id="P", snapshot_id="S", requested_by="U")
        assert "berat_kg" in str(exc_info.value) or "missing" in str(exc_info.value), (
            f"Expected rejection of volume->berat_kg mapping; got: {exc_info.value}"
        )

    def test_weight_kg_fact_accepted_for_berat_kg_required_field(self):
        """baja requires berat_kg which is not a drawable measurement field.

        The correct flow is: baja must be dispatched via explicit engine_contract
        + core_engine_payload (takeoff.baja), not via a measurement fact aliased
        to weight. A volume/m3 measurement fact alone must never dispatch baja.
        """
        # volume fact alone must not satisfy berat_kg
        item = _candidate("baja", [_fact("volume", 2.5, "m3")])
        with pytest.raises(CalculationNotReady):
            build_engine_dispatch(item, project_id="P", snapshot_id="S", requested_by="U")

        # baja with valid engine_contract + core_engine_payload must be accepted
        item_ok = _candidate(
            "baja", [],
            attributes={
                "engine_contract": "takeoff.baja",
                "core_engine_payload": {"members": [{"kode": "WF200", "designation": "WF200", "length_m": 6.0, "qty": 2}]},
            },
        )
        dispatch = build_engine_dispatch(item_ok, project_id="P", snapshot_id="S", requested_by="U")
        assert dispatch.endpoint == "/takeoff/baja"

    def test_field_alias_map_does_not_map_volume_to_berat_kg(self):
        """FIELD_ALIAS_MAP must not contain volume in the berat_kg alias set."""
        from app.drawing_intelligence.calculation_bridge import FIELD_ALIAS_MAP
        berat_aliases = FIELD_ALIAS_MAP.get("berat_kg", set())
        assert "volume" not in berat_aliases, (
            f"FIELD_ALIAS_MAP['berat_kg'] must not include 'volume'; found: {berat_aliases}"
        )

    def test_cross_dimensional_m3_to_m2_rejected(self):
        """area (m2) facts must not satisfy length (m) required fields."""
        item = _candidate("dinding", [_fact("area", 10.0, "m2")])
        with pytest.raises(CalculationNotReady) as exc_info:
            build_engine_dispatch(item, project_id="P", snapshot_id="S", requested_by="U")
        assert "missing" in str(exc_info.value).lower(), (
            f"area/m2 must not satisfy panjang_m/m; got: {exc_info.value}"
        )


# ─── B. Manual payload anti-bypass ────────────────────────────────────────────

class TestManualPayloadAntiByplass:
    """core_engine_payload must be validated through allowlisted endpoint-specific
    schema – not dispatched as an arbitrary dict.
    """

    def test_arbitrary_payload_without_engine_contract_is_rejected(self):
        """An item with core_engine_payload but no valid engine_contract is blocked."""
        # No engine_contract key → passthrough must be rejected
        item = _candidate(
            "tanah",
            [_fact("length", 2.0), _fact("width", 2.0), _fact("depth", 1.5)],
            attributes={"core_engine_payload": {"galian_footplat": [{"kode": "FP1"}]}},
        )
        # With no engine_contract declaration, the payload path must not be used
        # (item has measurement facts so should go through the measurement fact path;
        #  but tanah currently has no /calculations endpoint, so if it falls through
        #  to the payload path it must be blocked without an explicit contract).
        # This test validates that a payload without an allowed engine_contract
        # does not silently bypass the registry.
        try:
            dispatch = build_engine_dispatch(item, project_id="P", snapshot_id="S", requested_by="U")
            # If dispatch succeeds (e.g. via measurement facts), verify no arbitrary payload used
            assert dispatch.payload.get("galian_footplat") is None or "engine_contract" in str(item.attributes), (
                "Arbitrary payload dispatched without engine_contract validation"
            )
        except CalculationNotReady:
            pass  # blocked is acceptable

    def test_payload_with_precomputed_quantity_field_is_rejected(self):
        """Payloads containing precomputed final quantity/total fields are blocked."""
        item = _candidate(
            "tanah",
            [_fact("length", 2.0), _fact("width", 2.0), _fact("depth", 1.5)],
            attributes={
                "engine_contract": "takeoff.tanah",
                "core_engine_payload": {
                    "galian_footplat": [{"kode": "FP1", "b_ft": 2.0, "l_ft": 2.0, "d_gali": 1.5, "n": 1}],
                    "total_volume_m3": 6.0,  # precomputed final quantity – must be rejected
                },
            },
        )
        with pytest.raises(CalculationNotReady) as exc_info:
            build_engine_dispatch(item, project_id="P", snapshot_id="S", requested_by="U")
        assert "precomputed" in str(exc_info.value).lower() or "total" in str(exc_info.value).lower() or "bypass" in str(exc_info.value).lower(), (
            f"Precomputed quantity field must be blocked; got: {exc_info.value}"
        )

    def test_payload_with_formula_expression_is_rejected(self):
        """Payloads containing formula/expression strings are blocked."""
        item = _candidate(
            "tanah",
            [_fact("length", 2.0), _fact("width", 2.0), _fact("depth", 1.5)],
            attributes={
                "engine_contract": "takeoff.tanah",
                "core_engine_payload": {
                    "galian_footplat": [{"kode": "FP1", "b_ft": 2.0, "l_ft": 2.0, "d_gali": 1.5}],
                    "formula": "b * l * d",  # formula/expression – must be rejected
                },
            },
        )
        with pytest.raises(CalculationNotReady) as exc_info:
            build_engine_dispatch(item, project_id="P", snapshot_id="S", requested_by="U")
        assert "formula" in str(exc_info.value).lower() or "bypass" in str(exc_info.value).lower(), (
            f"Formula expression in payload must be blocked; got: {exc_info.value}"
        )

    def test_payload_with_unknown_keys_is_rejected(self):
        """Payloads with unknown top-level keys not in allowlisted schema are blocked."""
        item = _candidate(
            "tanah",
            [_fact("length", 2.0), _fact("width", 2.0), _fact("depth", 1.5)],
            attributes={
                "engine_contract": "takeoff.tanah",
                "core_engine_payload": {
                    "galian_footplat": [{"kode": "FP1", "b_ft": 2.0, "l_ft": 2.0, "d_gali": 1.5, "n": 1}],
                    "arbitrary_unknown_field": "some_value",  # unknown key – must be rejected
                },
            },
        )
        with pytest.raises(CalculationNotReady) as exc_info:
            build_engine_dispatch(item, project_id="P", snapshot_id="S", requested_by="U")
        assert "unknown" in str(exc_info.value).lower() or "invalid" in str(exc_info.value).lower() or "not allowed" in str(exc_info.value).lower(), (
            f"Unknown payload key must be blocked; got: {exc_info.value}"
        )

    def test_valid_tanah_payload_with_contract_is_accepted(self):
        """A valid tanah payload with proper engine_contract is accepted."""
        item = _candidate(
            "tanah",
            [_fact("length", 2.0), _fact("width", 2.0), _fact("depth", 1.5)],
            attributes={
                "engine_contract": "takeoff.tanah",
                "core_engine_payload": {
                    "footplats": [{"kode": "FP1", "b_ft": 2.0, "l_ft": 2.0, "d_gali": 1.5, "n": 1}],
                },
            },
        )
        dispatch = build_engine_dispatch(item, project_id="P-001", snapshot_id="S-001", requested_by="U")
        assert dispatch.endpoint == "/takeoff/tanah"
        assert dispatch.payload.get("footplats") is not None


# ─── C. Response/correlation safety ───────────────────────────────────────────

class TestResponseCorrelationSafety:
    """source_authority=core_engine requires endpoint-specific typed validation
    and request/project/candidate correlation – not just non-null result.
    """

    def test_core_engine_authority_requires_matching_project_id(self):
        """Response project mismatch must not grant source_authority=core_engine."""
        item = _candidate("column", [_fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)])
        response = {
            "status": "complete",
            "result": 4.0,
            "unit": "m3",
            "project_id": "DIFFERENT-PROJECT",  # mismatched project
        }
        calc = calculation_from_response(
            item, response,
            project_id="P-001", snapshot_id="S-001",
        )
        assert calc.source_authority != "core_engine", (
            "source_authority must not be core_engine when project_id is mismatched"
        )

    def test_core_engine_authority_requires_matching_unit_dimension(self):
        """Response with wrong unit (kg instead of m3 for volume) must not grant authority."""
        item = _candidate("column", [_fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)])
        response = {
            "status": "complete",
            "result": 1.0,
            "unit": "kg",  # wrong unit for a volume calculation
        }
        calc = calculation_from_response(
            item, response,
            project_id="P-001", snapshot_id="S-001",
        )
        assert calc.source_authority != "core_engine", (
            "source_authority must not be core_engine when unit is dimensionally wrong for the capability"
        )

    def test_core_engine_authority_not_granted_for_incomplete_status(self):
        """Response with status!=complete must not grant source_authority=core_engine."""
        item = _candidate("column", [_fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)])
        for bad_status in ["blocked", "needs_input", "pending"]:
            response = {"status": bad_status, "result": 1.0, "unit": "m3"}
            calc = calculation_from_response(
                item, response,
                project_id="P-001", snapshot_id="S-001",
            )
            assert calc.source_authority != "core_engine", (
                f"source_authority must not be core_engine when status='{bad_status}'"
            )

    def test_core_engine_authority_granted_for_valid_correlated_response(self):
        """Valid correlated response grants source_authority=core_engine."""
        item = _candidate("column", [_fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)])
        dispatch = build_engine_dispatch(item, project_id="P-001", snapshot_id="S-001", requested_by="U")
        response = {
            "status": "complete",
            "result": 1.0,
            "unit": "m3",
            "project_id": "P-001",
        }
        receipt = DispatchReceipt(context=dispatch.context, response=response)
        calc = calculation_from_response(item, response, receipt=receipt)
        assert calc.source_authority == "core_engine", (
            f"Valid correlated response must grant core_engine; got {calc.source_authority}"
        )

    def test_core_engine_authority_not_granted_for_null_result(self):
        """Response with null result must not grant source_authority=core_engine."""
        item = _candidate("column", [_fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)])
        response = {"status": "complete", "result": None, "unit": "m3"}
        calc = calculation_from_response(
            item, response,
            project_id="P-001", snapshot_id="S-001",
        )
        assert calc.source_authority != "core_engine"


# ─── D. Domain coverage matrix ────────────────────────────────────────────────

class TestDomainCoverageMatrix:
    """Explicit test-backed matrix for column, beam, wall, foundation, MEP."""

    # --- column: supported ---
    def test_column_is_supported_and_dispatches_to_calculations(self):
        """column/kolom/concrete_column -> /calculations with volume required fields."""
        for cat in ("column", "kolom", "concrete_column"):
            item = _candidate(cat, [_fact("count", 4), _fact("width", 0.5), _fact("depth", 0.5), _fact("height", 4.0)])
            dispatch = build_engine_dispatch(item, project_id="P", snapshot_id="S", requested_by="U")
            assert dispatch.endpoint == "/calculations", f"{cat} must dispatch to /calculations"
            assert dispatch.payload.get("calculation_type") == "concrete_column_total_volume"

    def test_column_capability_matrix(self):
        cap = resolve_takeoff_capability("column")
        assert cap.endpoint == "/calculations"
        assert "count" in cap.required_fields
        assert "width" in cap.required_fields
        assert "depth" in cap.required_fields
        assert "height" in cap.required_fields

    # --- beam: explicitly blocked ---
    def test_beam_is_blocked_and_never_auto_dispatched(self):
        """beam (balok) has no deterministic Core Engine endpoint -> blocked."""
        for cat in ("beam", "balok"):
            item = _candidate(cat, [_fact("count", 2), _fact("width", 0.3), _fact("depth", 0.5), _fact("height", 4.0)])
            with pytest.raises(CalculationNotReady) as exc_info:
                build_engine_dispatch(item, project_id="P", snapshot_id="S", requested_by="U")
            assert "not" in str(exc_info.value).lower() or "block" in str(exc_info.value).lower() or "no compatible" in str(exc_info.value).lower(), (
                f"beam must be explicitly blocked; got: {exc_info.value}"
            )

    def test_beam_capability_is_blocked_in_registry(self):
        """beam category returns blocked capability from string-based registry."""
        cap = resolve_takeoff_capability("beam")
        assert cap.status == "blocked", f"beam must be blocked; got status={cap.status}"
        assert cap.endpoint is None, f"beam must have no endpoint; got {cap.endpoint}"

    # --- wall: blocked without explicit contract ---
    def test_wall_without_contract_is_blocked(self):
        """wall (dinding) without explicit engine_contract is blocked."""
        item = _candidate("wall", [_fact("area", 10.0, "m2")])
        with pytest.raises(CalculationNotReady):
            build_engine_dispatch(item, project_id="P", snapshot_id="S", requested_by="U")

    def test_wall_capability_without_contract_is_blocked_in_registry(self):
        cap = resolve_takeoff_capability("wall")
        assert cap.status == "blocked", f"wall without contract must be blocked; got {cap.status}"
        assert cap.endpoint is None

    # --- foundation: blocked without explicit subtype contract ---
    def test_foundation_without_contract_is_blocked(self):
        """foundation/pondasi without explicit engine_contract is blocked."""
        for cat in ("foundation", "pondasi"):
            item = _candidate(cat, [_fact("length", 2.0), _fact("width", 2.0), _fact("depth", 1.5)])
            with pytest.raises(CalculationNotReady):
                build_engine_dispatch(item, project_id="P", snapshot_id="S", requested_by="U")

    def test_foundation_capability_is_blocked_in_registry(self):
        for cat in ("foundation", "pondasi"):
            cap = resolve_takeoff_capability(cat)
            assert cap.status == "blocked", f"{cat} must be blocked; got {cap.status}"
            assert cap.endpoint is None

    # --- MEP: blocked without explicit contract ---
    def test_mep_without_contract_is_blocked(self):
        """mep without explicit engine_contract is blocked."""
        item = _candidate("mep", [_fact("length", 20.0)])
        with pytest.raises(CalculationNotReady):
            build_engine_dispatch(item, project_id="P", snapshot_id="S", requested_by="U")

    def test_mep_capability_is_blocked_in_registry(self):
        cap = resolve_takeoff_capability("mep")
        assert cap.status == "blocked", f"mep must be blocked; got {cap.status}"
        assert cap.endpoint is None
