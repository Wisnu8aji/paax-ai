from __future__ import annotations

"""Typed, formula-free boundary from verified drawing facts to Python Core Engine."""

import os
from typing import Any

import httpx
from pydantic import BaseModel

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


FIELD_ALIAS_MAP: dict[str, set[str]] = {
    "panjang_m": {"length", "panjang_m"},
    "lebar_m": {"width", "lebar_m"},
    "tinggi_m": {"height", "tinggi_m"},
    "dalam_m": {"depth", "dalam_m", "height"},
    "luas_m2": {"area", "luas_m2"},
    "volume_m3": {"volume", "volume_m3"},
    "jumlah_unit": {"count", "jumlah_unit"},
    "spesifikasi": {"spesifikasi"},
    "berat_kg": {"weight", "berat_kg", "volume"},
    "jumlah_ls": {"count", "jumlah_ls"},
}


def _has_fact_for_field(field_name: str, approved_facts_by_field: dict[str, list[ElementMeasurementFact]]) -> bool:
    aliases = FIELD_ALIAS_MAP.get(field_name, {field_name})
    for alias in aliases:
        if approved_facts_by_field.get(alias):
            return True
    return False


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
        raise CalculationNotReady("no compatible Python Core Engine contract is registered")

    facts = _approved_facts(item)
    missing = [field for field in capability.required_fields if not _has_fact_for_field(field, facts)]
    if missing:
        raise CalculationNotReady(f"missing approved measurement facts: {', '.join(sorted(missing))}")

    if capability.endpoint == "/calculations":
        inputs: list[dict[str, Any]] = []
        for fact_list in facts.values():
            for fact in fact_list:
                formula_input = fact.field if capability.calculation_type not in {"area", "length", "count"} else str(capability.calculation_type)
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

    # For manual takeoff domain endpoints (/takeoff/*)
    payload = item.attributes.get("core_engine_payload")
    if not isinstance(payload, dict):
        payload = {
            "project_id": project_id,
            "snapshot_id": snapshot_id,
            "work_item_id": item.work_item_id,
            "category": item.category,
        }
    return EngineDispatch(endpoint=capability.endpoint, payload=dict(payload), capability=capability)


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
) -> WorkItemCalculation:
    cap = capability or resolve_takeoff_capability(item.category)
    if cap and cap.endpoint == "/calculations":
        status = str(response.get("status") or "blocked")
        return WorkItemCalculation(
            calculation_id=str(response.get("calculation_id") or f"calc-{item.work_item_id}"),
            work_item_id=item.work_item_id,
            calculation_type=str(cap.calculation_type or response.get("calculation_type") or "unknown"),
            status=status,
            formula=response.get("formula"),
            substituted_formula=response.get("substituted_formula"),
            result=response.get("result"),
            unit=response.get("unit"),
            measurement_fact_ids=[fact.measurement_id for fact in item.measurement_facts],
            warnings=[str(value) for value in response.get("warnings", [])],
            engine_version=response.get("engine_version"),
            source_authority="core_engine" if status == "complete" and response.get("result") is not None else "none",
        )

    lines = response.get("items") if isinstance(response.get("items"), list) else []
    complete = [line for line in lines if isinstance(line, dict) and line.get("quantity") is not None and not line.get("needs_review")]
    warnings = [str(value) for value in response.get("warnings", [])]
    warnings.extend(str(line.get("review_reason")) for line in lines if isinstance(line, dict) and line.get("needs_review") and line.get("review_reason"))
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
    return WorkItemCalculation(
        calculation_id=f"calc-{item.work_item_id}", work_item_id=item.work_item_id,
        calculation_type=calc_type, status="complete", result=float(line["quantity"]),
        unit=str(line.get("unit") or ""), formula=str(line.get("formula") or "") or None,
        substituted_formula=str(line.get("detail") or "") or None,
        measurement_fact_ids=[fact.measurement_id for fact in item.measurement_facts],
        warnings=warnings, engine_version=str(response.get("engine_version") or "core-engine"),
        source_authority="core_engine",
    )
