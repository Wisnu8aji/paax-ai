from __future__ import annotations

"""Typed boundary from mature Drawing Intelligence facts to Core Engine."""

import os
from typing import Any

import httpx

from .models import ElementMeasurementFact, WorkItemCalculation, WorkItemCandidate


class CalculationNotReady(ValueError):
    pass


def build_calculation_request(
    item: WorkItemCandidate,
    *,
    project_id: str,
    snapshot_id: str,
    requested_by: str,
) -> dict[str, Any]:
    if item.category != "column":
        raise CalculationNotReady("only concrete column total volume is currently implemented")
    facts = {
        fact.field: fact for fact in item.measurement_facts
        if fact.verification_status in {"engine_verified", "human_verified"}
    }
    required = {"count", "width", "depth", "height"}
    missing = sorted(required - set(facts))
    if item.conflict_ids:
        raise CalculationNotReady("open drawing conflicts must be resolved before calculation")
    if missing:
        raise CalculationNotReady(f"missing approved measurement facts: {', '.join(missing)}")
    inputs = []
    for field in ("width", "depth", "height", "count"):
        fact: ElementMeasurementFact = facts[field]
        inputs.append({
            "measurement_id": fact.measurement_id,
            "project_id": project_id,
            "snapshot_id": snapshot_id,
            "measurement_type": "count" if field == "count" else "length",
            "value": fact.value,
            "unit": fact.unit,
            "source_method": fact.source_method,
            "element_ids": item.physical_instance_ids,
            "evidence_refs": fact.evidence_refs,
            "formula_inputs": [field],
            "verification_status": fact.verification_status,
            "created_by": "drawing-intelligence",
            "audit_metadata": {
                "work_item_id": item.work_item_id,
                "source_page_indices": fact.source_page_indices,
                "count_authority": item.count_authority,
            },
        })
    return {
        "project_id": project_id,
        "snapshot_id": snapshot_id,
        "measurement_fact_ids": [value["measurement_id"] for value in inputs],
        "calculation_type": "concrete_column_total_volume",
        "inputs": inputs,
        "requested_by": requested_by,
    }


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

    async def calculate(self, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {"X-Internal-Key": self.internal_key, "X-User-Id": "drawing-intelligence-calculation-bridge"}
        if self._client is not None:
            response = await self._client.post(f"{self.base_url}/calculations", json=payload, headers=headers)
        else:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(f"{self.base_url}/calculations", json=payload, headers=headers)
        response.raise_for_status()
        return response.json()


def calculation_from_response(item: WorkItemCandidate, response: dict[str, Any]) -> WorkItemCalculation:
    return WorkItemCalculation(
        calculation_id=str(response.get("calculation_id") or f"calc-{item.work_item_id}"),
        work_item_id=item.work_item_id,
        calculation_type="concrete_column_total_volume",
        status=str(response.get("status") or "blocked"),
        formula=response.get("formula"),
        substituted_formula=response.get("substituted_formula"),
        result=response.get("result"),
        unit=response.get("unit"),
        measurement_fact_ids=[fact.measurement_id for fact in item.measurement_facts],
        warnings=[str(value) for value in response.get("warnings", [])],
        engine_version=response.get("engine_version"),
    )
