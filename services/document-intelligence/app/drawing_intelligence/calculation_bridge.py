from __future__ import annotations

"""Typed, formula-free boundary from verified drawing facts to Python Core Engine.

Phase 09C Correction Round 3 — DispatchContext and typed request validation:
  - validate_endpoint_request(): endpoint-specific strict Pydantic validation
    (extra=forbid recursive, finite values, positive dimensions, no empty payloads,
     no precomputed totals/formula/boolean-as-number)
  - DispatchContext: immutable receipt bound to endpoint/project/snapshot/candidate/
    evidence/request SHA-256/expected-unit; created only by build_engine_dispatch()
  - DispatchReceipt: pairs context with response; the ONLY path to source_authority=core_engine
  - calculation_from_response(): requires receipt kwarg; without receipt, authority
    is always "none" (raw-response authority is architecturally impossible)
  - Corrections from Round 2 preserved:
    - FIELD_ALIAS_MAP: volume removed from berat_kg (dimensional violation)
    - Domain coverage matrix: column (supported), beam/wall/foundation/MEP blocked
"""

import os
from typing import Any, Optional

import httpx
from pydantic import BaseModel, ValidationError

from .dispatch_context import (
    DispatchContext,
    DispatchReceipt,
    expected_unit_for,
    make_evidence_digest,
    make_request_digest,
)
from .dispatch_schemas import get_request_model
from .models import ElementMeasurementFact, WorkItemCalculation, WorkItemCandidate
from app.perception.takeoff_capability_registry import TakeoffCapability, resolve_takeoff_capability


# Re-export so tests can import from calculation_bridge directly
__all__ = [
    "CalculationNotReady",
    "DispatchContext",
    "DispatchReceipt",
    "EngineDispatch",
    "CoreEngineCalculationClient",
    "build_engine_dispatch",
    "build_calculation_request",
    "calculation_from_response",
    "validate_endpoint_request",
]


class CalculationNotReady(ValueError):
    pass


class EngineDispatch(BaseModel):
    endpoint: str
    payload: dict[str, Any]
    capability: TakeoffCapability
    context: DispatchContext

    model_config = {"arbitrary_types_allowed": True}


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
# Round 2 correction: volume removed from berat_kg aliases (m3 ≠ kg).
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


# ─── validate_endpoint_request ────────────────────────────────────────────────

def validate_endpoint_request(contract: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Validate a raw core_engine_payload dict against the strict DI boundary model
    for the given engine_contract.

    Returns the validated payload as a serializable dict (model.model_dump()).
    Raises CalculationNotReady with a descriptive message on any validation failure.

    Guarantees:
      - extra=forbid (recursive): unknown keys rejected
      - Positive/finite dimensions: negative, NaN, Infinity rejected
      - No boolean-as-number
      - No empty payload when work items are required
      - No precomputed totals/formula/result keys (blocked by strict schema)
    """
    model_cls = get_request_model(contract)
    if model_cls is None:
        raise CalculationNotReady(
            f"no schema registered for engine_contract='{contract}'; "
            "unknown or unsupported contract — dispatch blocked"
        )
    try:
        validated = model_cls.model_validate(payload)
        return validated.model_dump()
    except ValidationError as exc:
        # Flatten validation errors to a readable message
        errors = exc.errors(include_url=False)
        msgs = "; ".join(
            f"{'.'.join(str(l) for l in e['loc'])}: {e['msg']}" if e.get("loc") else e["msg"]
            for e in errors[:5]  # cap at 5 to avoid huge messages
        )
        raise CalculationNotReady(
            f"payload for '{contract}' failed strict validation: {msgs}"
        ) from exc


# ─── Expected response units per calculation type ─────────────────────────────
_CALCULATION_TYPE_EXPECTED_UNITS: dict[str, frozenset[str]] = {
    "concrete_column_total_volume": frozenset({"m3", "m³"}),
    "area": frozenset({"m2", "m²"}),
    "length": frozenset({"m"}),
    "count": frozenset({"unit", "buah", "bh", "pcs"}),
    "volume": frozenset({"m3", "m³"}),
}


def _unit_matches_capability(capability: TakeoffCapability | None, unit: str) -> bool:
    if capability is None:
        return True
    expected = _CALCULATION_TYPE_EXPECTED_UNITS.get(capability.calculation_type or "")
    if not expected:
        return True
    return unit.strip().lower() in expected


# ─── build_engine_dispatch ────────────────────────────────────────────────────

def build_engine_dispatch(
    item: WorkItemCandidate,
    *,
    project_id: str,
    snapshot_id: str,
    requested_by: str,
) -> EngineDispatch:
    """Build a validated EngineDispatch with an immutable DispatchContext.

    The returned EngineDispatch.context binds:
      endpoint, contract, calculation_type, project_id, snapshot_id,
      work_item_id, evidence_digest (SHA-256 of sorted evidence refs),
      request_digest (SHA-256 of payload), expected_unit.
    """
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

    # Collect all evidence refs for digest
    all_evidence_refs: list[str] = []
    for fact_list in facts.values():
        for fact in fact_list:
            all_evidence_refs.extend(fact.evidence_refs)
    evidence_digest = make_evidence_digest(all_evidence_refs)

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
        exp_unit = expected_unit_for(capability.calculation_type, fallback="unit")
        ctx = DispatchContext(
            endpoint=capability.endpoint,
            contract=None,
            calculation_type=capability.calculation_type,
            project_id=project_id,
            snapshot_id=snapshot_id,
            work_item_id=item.work_item_id,
            evidence_digest=evidence_digest,
            request_digest=make_request_digest(payload),
            expected_unit=exp_unit,
        )
        return EngineDispatch(endpoint=capability.endpoint, payload=payload, capability=capability, context=ctx)

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
        tkg_units = {"beton": "m3", "bekisting": "m2", "besi": "kg"}
        exp_unit = tkg_units.get(item.category.lower(), "unit")
        ctx = DispatchContext(
            endpoint=capability.endpoint,
            contract="tkg.takeoff",
            calculation_type=None,
            project_id=project_id,
            snapshot_id=snapshot_id,
            work_item_id=item.work_item_id,
            evidence_digest=evidence_digest,
            request_digest=make_request_digest(payload),
            expected_unit=exp_unit,
        )
        return EngineDispatch(endpoint=capability.endpoint, payload=payload, capability=capability, context=ctx)

    # ─── Manual takeoff domain endpoints (/takeoff/*) ─────────────────────────
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

    # Typed Pydantic validation (strict, extra=forbid) — raises CalculationNotReady
    validated_payload = validate_endpoint_request(contract, raw_payload)

    # Build final payload: project/snapshot provenance added by bridge (not from raw payload)
    payload = {
        "project_id": project_id,
        "snapshot_id": snapshot_id,
        "work_item_id": item.work_item_id,
        "category": item.category,
        **validated_payload,
    }

    # Determine expected unit from domain
    _DOMAIN_EXPECTED_UNITS: dict[str, str] = {
        "takeoff.tanah": "m3",
        "takeoff.dinding": "m2",
        "takeoff.arsitektur": "m2",
        "takeoff.baja": "kg",
        "takeoff.atap": "m2",
        "takeoff.kusen": "m",
        "takeoff.mep": "m",
        "takeoff.mep_advanced": "unit",
        "takeoff.smkk": "unit",
    }
    exp_unit = _DOMAIN_EXPECTED_UNITS.get(contract, "unit")

    ctx = DispatchContext(
        endpoint=capability.endpoint,
        contract=contract,
        calculation_type=None,
        project_id=project_id,
        snapshot_id=snapshot_id,
        work_item_id=item.work_item_id,
        evidence_digest=evidence_digest,
        request_digest=make_request_digest(validated_payload),
        expected_unit=exp_unit,
    )
    return EngineDispatch(endpoint=capability.endpoint, payload=payload, capability=capability, context=ctx)


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
        # Build a minimal context for legacy callers
        ctx = DispatchContext(
            endpoint="/calculations",
            contract=None,
            calculation_type=payload.get("calculation_type"),
            project_id=str(payload.get("project_id") or "unknown"),
            snapshot_id=str(payload.get("snapshot_id") or "unknown"),
            work_item_id=str(payload.get("work_item_id") or "unknown"),
            evidence_digest="none",
            request_digest=make_request_digest(payload),
            expected_unit=expected_unit_for(payload.get("calculation_type"), fallback="unit"),
        )
        return await self.dispatch(EngineDispatch(endpoint="/calculations", payload=payload, capability=capability, context=ctx))


def calculation_from_response(
    item: WorkItemCandidate,
    response: dict[str, Any],
    *,
    capability: TakeoffCapability | None = None,
    # Legacy kwargs kept for backward compat but ignored when receipt present
    project_id: str | None = None,
    snapshot_id: str | None = None,
    # Round 3: primary authority path requires a DispatchReceipt
    receipt: DispatchReceipt | None = None,
) -> WorkItemCalculation:
    """Convert a Core Engine HTTP response to a WorkItemCalculation.

    Round 3: source_authority='core_engine' REQUIRES a DispatchReceipt.
    Without a receipt, authority is always 'none' regardless of response content.
    This makes raw-response authority architecturally impossible.

    With a receipt, authority is granted only if ALL gates pass:
      1. receipt.is_authority_valid() returns True
      2. work_item_id in context matches item.work_item_id
      3. Response unit is dimensionally compatible with context.expected_unit
    """
    cap = capability or resolve_takeoff_capability(item)

    def _deny(reason: str) -> WorkItemCalculation:
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

    # ─── Receipt-required path ───────────────────────────────────────────────
    if receipt is not None:
        ctx = receipt.context

        # Gate 1: work_item_id binding
        if ctx.work_item_id != item.work_item_id:
            return _deny(
                f"DispatchContext work_item_id mismatch: "
                f"context={ctx.work_item_id!r}, item={item.work_item_id!r}; authority denied"
            )

        # Gate 2: receipt identity/quality checks
        ok, reason = receipt.is_authority_valid()
        if not ok:
            return _deny(f"DispatchReceipt validity check failed: {reason}")

        # All gates passed — grant authority
        result = receipt.extract_result()
        unit = receipt.extract_unit()
        return WorkItemCalculation(
            calculation_id=str(response.get("calculation_id") or f"calc-{item.work_item_id}"),
            work_item_id=item.work_item_id,
            calculation_type=str(
                ctx.calculation_type
                or (cap.calculation_type if cap else None)
                or response.get("calculation_type")
                or item.category
            ),
            status="complete",
            result=result,
            unit=unit or None,
            formula=response.get("formula"),
            substituted_formula=response.get("substituted_formula") or response.get("detail"),
            measurement_fact_ids=[fact.measurement_id for fact in item.measurement_facts],
            warnings=[str(w) for w in response.get("warnings", [])],
            engine_version=str(response.get("engine_version") or "core-engine"),
            source_authority="core_engine",
        )

    # ─── No receipt: authority is always "none" ──────────────────────────────
    # Raw-response authority is architecturally forbidden. Return a non-authoritative
    # calculation that can be used for informational display but never as ground truth.

    # For /calculations endpoint: extract result info but deny authority
    if cap and cap.endpoint == "/calculations":
        status = str(response.get("status") or "blocked")
        result = response.get("result")
        unit = str(response.get("unit") or "")
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
            warnings=[str(w) for w in response.get("warnings", [])],
            engine_version=response.get("engine_version"),
            source_authority="none",  # No receipt → no authority
        )

    # /takeoff/* domain endpoints
    lines = response.get("items") if isinstance(response.get("items"), list) else []
    warnings = [str(w) for w in response.get("warnings", [])]
    calc_type = cap.category if cap else item.category
    complete = [
        line for line in lines
        if isinstance(line, dict) and line.get("quantity") is not None and not line.get("needs_review")
    ]
    if not complete:
        return WorkItemCalculation(
            calculation_id=f"calc-{item.work_item_id}", work_item_id=item.work_item_id,
            calculation_type=calc_type, status="needs_input",
            measurement_fact_ids=[fact.measurement_id for fact in item.measurement_facts],
            warnings=warnings, source_authority="none",
        )
    line = complete[0]
    return WorkItemCalculation(
        calculation_id=f"calc-{item.work_item_id}", work_item_id=item.work_item_id,
        calculation_type=calc_type, status="complete",
        result=float(line["quantity"]), unit=str(line.get("unit") or ""),
        formula=str(line.get("formula") or "") or None,
        substituted_formula=str(line.get("detail") or "") or None,
        measurement_fact_ids=[fact.measurement_id for fact in item.measurement_facts],
        warnings=warnings, engine_version=str(response.get("engine_version") or "core-engine"),
        source_authority="none",  # No receipt → no authority
    )
