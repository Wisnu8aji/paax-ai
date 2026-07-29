from __future__ import annotations

"""Typed, formula-free boundary from verified drawing facts to Python Core Engine.

Phase 09C Correction Round 4 — Verified Client Execution Receipt & Idempotency:
  - DispatchContext: immutable receipt with idempotency_key bound to project_id,
    snapshot_id, work_item_id, evidence_digest (SHA-256), request_digest (SHA-256),
    endpoint, contract, calculation_type, and expected_unit.
  - CoreEngineCalculationClient.execute_dispatch(): ONLY path that creates a verified
    DispatchReceipt (with X-Idempotency-Key header sent to Core Engine).
  - calculation_from_response(): requires a verified DispatchReceipt (verification_token
    from execute_dispatch) AND current evidence lineage match. Caller-constructed or
    unverified receipts yield source_authority="none".
  - Strict endpoint-specific response model validation in DispatchReceipt (extra=forbid,
    finite result, unit correlation, echoed identity verification).
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
    make_idempotency_key,
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


FIELD_ALIAS_MAP: dict[str, set[str]] = {
    "panjang_m": {"length", "panjang_m"},
    "lebar_m": {"width", "lebar_m"},
    "tinggi_m": {"height", "tinggi_m"},
    "dalam_m": {"depth", "dalam_m", "height"},
    "luas_m2": {"area", "luas_m2"},
    "volume_m3": {"volume", "volume_m3"},
    "jumlah_unit": {"count", "jumlah_unit"},
    "spesifikasi": {"spesifikasi"},
    "berat_kg": {"berat_kg"},
    "jumlah_ls": {"count", "jumlah_ls"},
}


def _has_fact_for_field(field_name: str, approved_facts_by_field: dict[str, list[ElementMeasurementFact]]) -> bool:
    aliases = FIELD_ALIAS_MAP.get(field_name, {field_name})
    for alias in aliases:
        if approved_facts_by_field.get(alias):
            return True
    return False


def validate_endpoint_request(contract: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Validate a raw core_engine_payload dict against the strict DI boundary model."""
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
        errors = exc.errors(include_url=False)
        msgs = "; ".join(
            f"{'.'.join(str(l) for l in e['loc'])}: {e['msg']}" if e.get("loc") else e["msg"]
            for e in errors[:5]
        )
        raise CalculationNotReady(
            f"payload for '{contract}' failed strict validation: {msgs}"
        ) from exc


def build_engine_dispatch(
    item: WorkItemCandidate,
    *,
    project_id: str,
    snapshot_id: str,
    requested_by: str,
) -> EngineDispatch:
    """Build a validated EngineDispatch with an immutable DispatchContext."""
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
        request_digest = make_request_digest(payload)
        idemp_key = make_idempotency_key(project_id, snapshot_id, item.work_item_id, request_digest)
        ctx = DispatchContext(
            endpoint=capability.endpoint,
            contract=None,
            calculation_type=capability.calculation_type,
            project_id=project_id,
            snapshot_id=snapshot_id,
            work_item_id=item.work_item_id,
            evidence_digest=evidence_digest,
            request_digest=request_digest,
            expected_unit=exp_unit,
            idempotency_key=idemp_key,
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
        request_digest = make_request_digest(payload)
        idemp_key = make_idempotency_key(project_id, snapshot_id, item.work_item_id, request_digest)
        ctx = DispatchContext(
            endpoint=capability.endpoint,
            contract="tkg.takeoff",
            calculation_type=None,
            project_id=project_id,
            snapshot_id=snapshot_id,
            work_item_id=item.work_item_id,
            evidence_digest=evidence_digest,
            request_digest=request_digest,
            expected_unit=exp_unit,
            idempotency_key=idemp_key,
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

    validated_payload = validate_endpoint_request(contract, raw_payload)

    payload = {
        "project_id": project_id,
        "snapshot_id": snapshot_id,
        "work_item_id": item.work_item_id,
        "category": item.category,
        **validated_payload,
    }

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

    request_digest = make_request_digest(validated_payload)
    idemp_key = make_idempotency_key(project_id, snapshot_id, item.work_item_id, request_digest)
    ctx = DispatchContext(
        endpoint=capability.endpoint,
        contract=contract,
        calculation_type=None,
        project_id=project_id,
        snapshot_id=snapshot_id,
        work_item_id=item.work_item_id,
        evidence_digest=evidence_digest,
        request_digest=request_digest,
        expected_unit=exp_unit,
        idempotency_key=idemp_key,
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

    async def execute_dispatch(self, dispatch: EngineDispatch) -> tuple[dict[str, Any], DispatchReceipt]:
        """Execute a roundtrip call to Core Engine and return (response_json, verified_receipt).

        This is the ONLY path that issues a verified DispatchReceipt with verification_token!
        Sends X-Idempotency-Key header.
        """
        headers = {
            "X-Internal-Key": self.internal_key,
            "X-User-Id": "drawing-intelligence-calculation-bridge",
            "X-Idempotency-Key": dispatch.context.idempotency_key,
        }
        if self._client is not None:
            response = await self._client.post(f"{self.base_url}{dispatch.endpoint}", json=dispatch.payload, headers=headers)
        else:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(f"{self.base_url}{dispatch.endpoint}", json=dispatch.payload, headers=headers)
        response.raise_for_status()
        resp_json = response.json()
        verified_receipt = DispatchReceipt.create_verified(dispatch.context, resp_json)
        return resp_json, verified_receipt

    async def dispatch(self, dispatch: EngineDispatch) -> dict[str, Any]:
        """Execute dispatch and return response_json directly."""
        resp_json, _ = await self.execute_dispatch(dispatch)
        return resp_json

    async def calculate(self, payload: dict[str, Any]) -> dict[str, Any]:
        capability = TakeoffCapability(
            key=str(payload.get("calculation_type") or "calculation"), endpoint="/calculations",
            source_authority="core_engine", status="supported",
            calculation_type=payload.get("calculation_type"),
        )
        proj_id = str(payload.get("project_id") or "unknown")
        snap_id = str(payload.get("snapshot_id") or "unknown")
        work_id = str(payload.get("work_item_id") or "unknown")
        req_digest = make_request_digest(payload)
        idemp_key = make_idempotency_key(proj_id, snap_id, work_id, req_digest)
        ctx = DispatchContext(
            endpoint="/calculations",
            contract=None,
            calculation_type=payload.get("calculation_type"),
            project_id=proj_id,
            snapshot_id=snap_id,
            work_item_id=work_id,
            evidence_digest="none",
            request_digest=req_digest,
            expected_unit=expected_unit_for(payload.get("calculation_type"), fallback="unit"),
            idempotency_key=idemp_key,
        )
        return await self.dispatch(EngineDispatch(endpoint="/calculations", payload=payload, capability=capability, context=ctx))


def calculation_from_response(
    item: WorkItemCandidate,
    response: dict[str, Any],
    *,
    capability: TakeoffCapability | None = None,
    project_id: str | None = None,
    snapshot_id: str | None = None,
    receipt: DispatchReceipt | None = None,
) -> WorkItemCalculation:
    """Convert a Core Engine HTTP response to a WorkItemCalculation.

    Round 4: source_authority='core_engine' REQUIRES:
      1. A non-null DispatchReceipt that is CLIENT-VERIFIED (created by execute_dispatch).
      2. context.work_item_id == item.work_item_id
      3. Current evidence lineage matches context.evidence_digest exactly
      4. receipt.is_authority_valid() passes all Pydantic response & identity gates
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
        # Gate 0: Receipt MUST be client-verified
        if not receipt.is_client_verified():
            return _deny("DispatchReceipt is not client-verified; authority denied")

        ctx = receipt.context

        # Gate 1: work_item_id binding
        if ctx.work_item_id != item.work_item_id:
            return _deny(
                f"DispatchContext work_item_id mismatch: "
                f"context={ctx.work_item_id!r}, item={item.work_item_id!r}; authority denied"
            )

        # Gate 2: Current evidence lineage re-evaluation
        all_refs: list[str] = []
        for fact in item.measurement_facts:
            all_refs.extend(fact.evidence_refs)
        current_evidence_digest = make_evidence_digest(all_refs)
        if current_evidence_digest != ctx.evidence_digest:
            return _deny(
                f"evidence lineage changed since dispatch: "
                f"context={ctx.evidence_digest[:8]!r}, current={current_evidence_digest[:8]!r}; authority denied"
            )

        # Gate 3: Pydantic response & identity validity check
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
            source_authority="none",
        )

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
        source_authority="none",
    )
