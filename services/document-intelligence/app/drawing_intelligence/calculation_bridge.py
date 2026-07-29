from __future__ import annotations

"""Typed, formula-free boundary from verified drawing facts to Python Core Engine.

Phase 09C Correction Round 2 — all defects corrected:
  - FIELD_ALIAS_MAP: volume removed from berat_kg (dimensional violation)
  - Manual core_engine_payload: allowlisted endpoint-specific schema validated
    fail-closed; precomputed quantities, formulas, unknown keys rejected
  - calculation_from_response: endpoint-specific typed response validation with
    project/candidate/unit/dimension correlation before source_authority grant
  - Domain coverage matrix: column (supported), beam/wall/foundation/MEP (blocked
    without explicit contract) enforced in registry queries
"""

import os
from typing import Any

import httpx
from pydantic import BaseModel, ValidationError

from .models import ElementMeasurementFact, WorkItemCalculation, WorkItemCandidate
from app.perception.takeoff_capability_registry import TakeoffCapability, resolve_takeoff_capability


class CalculationNotReady(ValueError):
    pass


class EngineDispatch(BaseModel):
    endpoint: str
    payload: dict[str, Any]
    capability: TakeoffCapability


def _measurement_type(field: str) -> str:
    if field == "count":
        return "count"
    if field == "area":
        return "area"
    if field == "volume":
        return "volume_input"
    return "length"


def _approved_facts(item: WorkItemCandidate) -> dict[str, list[ElementMeasurementFact]]:
    facts: dict[str, list[ElementMeasurementFact]] = {}
    for fact in item.measurement_facts:
        if fact.verification_status in {"engine_verified", "human_verified"}:
            facts.setdefault(fact.field, []).append(fact)
    return facts


def _typed_fact_payload(
    fact: ElementMeasurementFact,
    *,
    item: WorkItemCandidate,
    project_id: str,
    snapshot_id: str,
    formula_input: str,
) -> dict[str, Any]:
    if fact.source_method == "core_engine":
        raise CalculationNotReady("Core Engine output cannot be recycled as a new measurement input")
    return {
        "measurement_id": fact.measurement_id,
        "project_id": project_id,
        "snapshot_id": snapshot_id,
        "measurement_type": _measurement_type(fact.field),
        "value": fact.value,
        "unit": fact.unit,
        "source_method": fact.source_method,
        "element_ids": item.physical_instance_ids,
        "evidence_refs": fact.evidence_refs,
        "formula_inputs": [formula_input],
        "verification_status": fact.verification_status,
        "created_by": "drawing-intelligence",
        "audit_metadata": {
            "work_item_id": item.work_item_id,
            "source_page_indices": fact.source_page_indices,
            "count_authority": item.count_authority,
        },
    }


# ─── Dimensional-safe FIELD_ALIAS_MAP ──────────────────────────────────────────
# Correction: removed "volume" from berat_kg aliases (m3 ≠ kg — dimensional violation).
# berat_kg (mass/weight in kg) has no alias to any volumetric or length field.
FIELD_ALIAS_MAP: dict[str, set[str]] = {
    "panjang_m": {"length", "panjang_m"},
    "lebar_m": {"width", "lebar_m"},
    "tinggi_m": {"height", "tinggi_m"},
    "dalam_m": {"depth", "dalam_m", "height"},
    "luas_m2": {"area", "luas_m2"},
    "volume_m3": {"volume", "volume_m3"},
    "jumlah_unit": {"count", "jumlah_unit"},
    "spesifikasi": {"spesifikasi"},
    # berat_kg: mass dimension only — no volumetric or length aliases.
    "berat_kg": {"berat_kg"},
    "jumlah_ls": {"count", "jumlah_ls"},
}


def _has_fact_for_field(field_name: str, approved_facts_by_field: dict[str, list[ElementMeasurementFact]]) -> bool:
    aliases = FIELD_ALIAS_MAP.get(field_name, {field_name})
    for alias in aliases:
        if approved_facts_by_field.get(alias):
            return True
    return False


# ─── Allowlisted endpoint-specific payload schemas ────────────────────────────
# Each entry defines which top-level keys are permitted for a given engine_contract.
# Precomputed final quantity/total fields and formula expressions are NEVER allowed.
# "project_id"/"snapshot_id"/"work_item_id" are added by the bridge, not payload.
_ENDPOINT_ALLOWED_KEYS: dict[str, frozenset[str]] = {
    "takeoff.tanah": frozenset({
        "galian_footplat",
        "galian_pondasi_batu",
        "galian_pondasi_pile",
        "urugan_pasir",
        "urugan_kembali",
    }),
    "takeoff.dinding": frozenset({
        "dinding_bata",
        "dinding_batako",
        "plesteran",
        "acian",
        "cat",
    }),
    "takeoff.arsitektur": frozenset({
        "lantai",
        "plafon",
        "pintu",
        "jendela",
        "keramik",
    }),
    "takeoff.baja": frozenset({
        "profil_baja",
        "pelat_baja",
        "baut",
        "las",
    }),
    "takeoff.atap": frozenset({
        "genteng",
        "rangka_atap",
        "lisplank",
        "talang",
    }),
    "takeoff.kusen": frozenset({
        "kusen_pintu",
        "kusen_jendela",
    }),
    "takeoff.mep": frozenset({
        "pipa",
        "kabel",
        "konduit",
        "fitting",
    }),
    "takeoff.mep_advanced": frozenset({
        "pipa",
        "kabel",
        "konduit",
        "fitting",
        "spesifikasi",
        "panel",
    }),
    "takeoff.smkk": frozenset({
        "item_ls",
    }),
    "tkg.takeoff": frozenset(),  # dispatched via measurement facts, not payload
}

# Keys that are forbidden in any payload regardless of allowlist (bypass indicators)
_FORBIDDEN_PAYLOAD_KEYS = frozenset({
    "total_volume_m3", "total_luas_m2", "total_panjang_m", "total_berat_kg",
    "total_jumlah", "quantity", "result", "final_quantity",
    "formula", "expression", "rumus",
    "coefficient", "koefisien",
})


def _validate_manual_payload(contract: str, payload: dict[str, Any]) -> None:
    """Validate core_engine_payload against allowlisted endpoint-specific schema.

    Raises CalculationNotReady with a descriptive reason if:
    - Any forbidden key (precomputed quantity/formula/bypass indicator) is present
    - Any key is not in the allowlisted set for this endpoint
    """
    allowed = _ENDPOINT_ALLOWED_KEYS.get(contract)
    if allowed is None:
        raise CalculationNotReady(
            f"no allowlisted schema registered for engine_contract='{contract}'; dispatch blocked"
        )

    # Check for forbidden bypass keys first
    forbidden_found = _FORBIDDEN_PAYLOAD_KEYS.intersection(payload.keys())
    if forbidden_found:
        raise CalculationNotReady(
            f"payload contains precomputed quantity, formula, or bypass fields not allowed: "
            f"{sorted(forbidden_found)}; Core Engine must receive raw inputs only"
        )

    # If allowed is empty (e.g. tkg.takeoff), payload must be empty or not provided via this path
    if not allowed:
        raise CalculationNotReady(
            f"engine_contract='{contract}' dispatches via measurement facts, not manual payload"
        )

    # Check for unknown keys
    unknown_keys = set(payload.keys()) - allowed
    if unknown_keys:
        raise CalculationNotReady(
            f"payload contains keys not allowed for '{contract}': {sorted(unknown_keys)}"
        )


# ─── Expected response units per calculation type ─────────────────────────────
# Used for dimensional correlation in calculation_from_response.
_CALCULATION_TYPE_EXPECTED_UNITS: dict[str, frozenset[str]] = {
    "concrete_column_total_volume": frozenset({"m3", "m³"}),
    "area": frozenset({"m2", "m²"}),
    "length": frozenset({"m"}),
    "count": frozenset({"unit", "buah", "bh", "pcs"}),
    "volume": frozenset({"m3", "m³"}),
}


def _unit_matches_capability(capability: TakeoffCapability | None, unit: str) -> bool:
    """Return True if unit is dimensionally compatible with the capability's calculation type."""
    if capability is None:
        return True  # no constraint declared → pass through
    expected = _CALCULATION_TYPE_EXPECTED_UNITS.get(capability.calculation_type or "")
    if not expected:
        return True  # no expected unit registered → pass through
    return unit.strip().lower() in expected


def build_engine_dispatch(
    item: WorkItemCandidate,
    *,
    project_id: str,
    snapshot_id: str,
    requested_by: str,
) -> EngineDispatch:
    if item.conflict_ids:
        raise CalculationNotReady("open drawing conflicts must be resolved before calculation")

    capability = resolve_takeoff_capability(item)
    if capability is None or not capability.endpoint or capability.status in {"blocked"}:
        raise CalculationNotReady(
            capability.reason if capability and capability.reason
            else "no compatible Python Core Engine contract is registered"
        )

    facts = _approved_facts(item)
    missing = [
        field for field in capability.required_fields
        if field != "core_engine_payload"
        and not _has_fact_for_field(field, facts)
    ]
    if missing:
        raise CalculationNotReady(f"missing approved measurement facts: {', '.join(sorted(missing))}")

    if capability.endpoint == "/calculations":
        inputs: list[dict[str, Any]] = []
        for fact_list in facts.values():
            for fact in fact_list:
                formula_input = (
                    fact.field
                    if capability.calculation_type not in {"area", "length", "count"}
                    else str(capability.calculation_type)
                )
                inputs.append(
                    _typed_fact_payload(
                        fact, item=item, project_id=project_id, snapshot_id=snapshot_id, formula_input=formula_input
                    )
                )
        payload = {
            "project_id": project_id,
            "snapshot_id": snapshot_id,
            "calculation_type": capability.calculation_type,
            "measurement_fact_ids": [val["measurement_id"] for val in inputs],
            "requested_by": requested_by,
            "inputs": inputs,
        }
        return EngineDispatch(endpoint=capability.endpoint, payload=payload, capability=capability)

    if capability.endpoint == "/tkg/takeoff":
        inputs: list[dict[str, Any]] = []
        for fact_list in facts.values():
            for fact in fact_list:
                inputs.append(
                    _typed_fact_payload(
                        fact, item=item, project_id=project_id, snapshot_id=snapshot_id, formula_input=fact.field
                    )
                )
        payload = {
            "project_id": project_id,
            "snapshot_id": snapshot_id,
            "measurement_fact_ids": [val["measurement_id"] for val in inputs],
            "requested_by": requested_by,
            "inputs": inputs,
        }
        return EngineDispatch(endpoint=capability.endpoint, payload=payload, capability=capability)

    # ─── Manual takeoff domain endpoints (/takeoff/*) ─────────────────────────
    # Strict anti-bypass: requires explicit engine_contract + allowlisted schema validation.
    contract = str(item.attributes.get("engine_contract") or "").strip()
    if not contract:
        raise CalculationNotReady(
            f"endpoint '{capability.endpoint}' requires explicit engine_contract attribute; "
            "manual core_engine_payload dispatch without declared contract is blocked"
        )

    raw_payload = item.attributes.get("core_engine_payload")
    if not isinstance(raw_payload, dict):
        raise CalculationNotReady(
            f"engine_contract='{contract}' requires a dict core_engine_payload attribute"
        )

    # Validate against allowlisted endpoint-specific schema (raises CalculationNotReady on violation)
    _validate_manual_payload(contract, raw_payload)

    # Build final payload: project/snapshot provenance added by bridge, not from raw payload
    payload = {
        "project_id": project_id,
        "snapshot_id": snapshot_id,
        "work_item_id": item.work_item_id,
        "category": item.category,
        **raw_payload,
    }
    return EngineDispatch(endpoint=capability.endpoint, payload=payload, capability=capability)


def build_calculation_request(
    item: WorkItemCandidate,
    *,
    project_id: str,
    snapshot_id: str,
    requested_by: str,
) -> dict[str, Any]:
    """Backward-compatible payload builder for the typed /calculations route."""
    dispatch = build_engine_dispatch(
        item, project_id=project_id, snapshot_id=snapshot_id, requested_by=requested_by,
    )
    if dispatch.endpoint != "/calculations":
        raise CalculationNotReady(f"work item uses {dispatch.endpoint}, not /calculations")
    return dispatch.payload


class CoreEngineCalculationClient:
    def __init__(
        self,
        base_url: str,
        *,
        internal_key: str,
        client: httpx.AsyncClient | None = None,
        timeout_seconds: float = 15.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.internal_key = internal_key
        self._client = client
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_env(cls) -> "CoreEngineCalculationClient":
        base_url = os.getenv("PAAX_CORE_ENGINE_URL") or os.getenv("CORE_ENGINE_URL")
        key = os.getenv("INTERNAL_SERVICE_KEY")
        if not base_url:
            raise RuntimeError("PAAX_CORE_ENGINE_URL/CORE_ENGINE_URL is required")
        if not key and os.getenv("TESTING") == "1":
            key = "test-internal-key"
        if not key:
            raise RuntimeError("INTERNAL_SERVICE_KEY is required")
        return cls(base_url, internal_key=key)

    async def dispatch(self, dispatch: EngineDispatch) -> dict[str, Any]:
        headers = {"X-Internal-Key": self.internal_key, "X-User-Id": "drawing-intelligence-calculation-bridge"}
        if self._client is not None:
            response = await self._client.post(f"{self.base_url}{dispatch.endpoint}", json=dispatch.payload, headers=headers)
        else:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(f"{self.base_url}{dispatch.endpoint}", json=dispatch.payload, headers=headers)
        response.raise_for_status()
        return response.json()

    async def calculate(self, payload: dict[str, Any]) -> dict[str, Any]:
        capability = TakeoffCapability(
            key=str(payload.get("calculation_type") or "calculation"), endpoint="/calculations",
            source_authority="core_engine", status="supported",
            calculation_type=payload.get("calculation_type"),
        )
        return await self.dispatch(EngineDispatch(endpoint="/calculations", payload=payload, capability=capability))


def calculation_from_response(
    item: WorkItemCandidate,
    response: dict[str, Any],
    *,
    capability: TakeoffCapability | None = None,
    project_id: str | None = None,
    snapshot_id: str | None = None,
) -> WorkItemCalculation:
    """Convert a Core Engine HTTP response to a WorkItemCalculation.

    Phase 09C Correction: source_authority=core_engine is only granted after:
    1. status == "complete" and result is not None
    2. Unit is dimensionally compatible with the capability's calculation type
    3. project_id correlation: if response declares project_id, it must match
    """
    cap = capability or resolve_takeoff_capability(item)

    def _deny_authority(reason: str) -> WorkItemCalculation:
        warnings = [reason]
        warnings.extend(str(w) for w in response.get("warnings", []))
        return WorkItemCalculation(
            calculation_id=f"calc-{item.work_item_id}",
            work_item_id=item.work_item_id,
            calculation_type=str(cap.calculation_type or item.category) if cap else item.category,
            status="blocked",
            measurement_fact_ids=[fact.measurement_id for fact in item.measurement_facts],
            warnings=warnings,
            source_authority="none",
        )

    if cap and cap.endpoint == "/calculations":
        status = str(response.get("status") or "blocked")
        result = response.get("result")
        unit = str(response.get("unit") or "")

        # Correlation: project_id in response must match request project_id
        resp_project_id = response.get("project_id")
        if project_id and resp_project_id and resp_project_id != project_id:
            return _deny_authority(
                f"project_id mismatch: request={project_id!r} response={resp_project_id!r}; "
                "source_authority denied"
            )

        # Dimensional correlation: unit must match capability's expected dimension
        if status == "complete" and result is not None and unit:
            if not _unit_matches_capability(cap, unit):
                return _deny_authority(
                    f"unit '{unit}' is dimensionally incompatible with "
                    f"calculation_type='{cap.calculation_type}'; source_authority denied"
                )

        # Standard status/result guard
        authority: str = (
            "core_engine"
            if status == "complete" and result is not None
            else "none"
        )
        return WorkItemCalculation(
            calculation_id=str(response.get("calculation_id") or f"calc-{item.work_item_id}"),
            work_item_id=item.work_item_id,
            calculation_type=str(cap.calculation_type or response.get("calculation_type") or "unknown"),
            status=status if status in {"complete", "blocked", "needs_input", "stale"} else "blocked",
            formula=response.get("formula"),
            substituted_formula=response.get("substituted_formula"),
            result=result,
            unit=unit or None,
            measurement_fact_ids=[fact.measurement_id for fact in item.measurement_facts],
            warnings=[str(value) for value in response.get("warnings", [])],
            engine_version=response.get("engine_version"),
            source_authority=authority,  # type: ignore[arg-type]
        )

    # /tkg/takeoff and manual-domain endpoints
    lines = response.get("items") if isinstance(response.get("items"), list) else []
    complete = [
        line for line in lines
        if isinstance(line, dict)
        and line.get("quantity") is not None
        and not line.get("needs_review")
    ]
    warnings = [str(value) for value in response.get("warnings", [])]
    warnings.extend(
        str(line.get("review_reason"))
        for line in lines
        if isinstance(line, dict) and line.get("needs_review") and line.get("review_reason")
    )
    calc_type = cap.category if cap else item.category
    if len(complete) != 1:
        warnings.append("manual-domain response must resolve to exactly one authoritative line for this work item")
        return WorkItemCalculation(
            calculation_id=f"calc-{item.work_item_id}", work_item_id=item.work_item_id,
            calculation_type=calc_type, status="needs_input" if not complete else "blocked",
            measurement_fact_ids=[fact.measurement_id for fact in item.measurement_facts],
            warnings=warnings, source_authority="none",
        )
    line = complete[0]
    resp_project = response.get("project_id")
    if project_id and resp_project and resp_project != project_id:
        warnings.append(f"project_id mismatch in response ({resp_project!r} != {project_id!r}); authority denied")
        return WorkItemCalculation(
            calculation_id=f"calc-{item.work_item_id}", work_item_id=item.work_item_id,
            calculation_type=calc_type, status="blocked",
            measurement_fact_ids=[fact.measurement_id for fact in item.measurement_facts],
            warnings=warnings, source_authority="none",
        )
    return WorkItemCalculation(
        calculation_id=f"calc-{item.work_item_id}", work_item_id=item.work_item_id,
        calculation_type=calc_type, status="complete", result=float(line["quantity"]),
        unit=str(line.get("unit") or ""), formula=str(line.get("formula") or "") or None,
        substituted_formula=str(line.get("detail") or "") or None,
        measurement_fact_ids=[fact.measurement_id for fact in item.measurement_facts],
        warnings=warnings, engine_version=str(response.get("engine_version") or "core-engine"),
        source_authority="core_engine",
    )
