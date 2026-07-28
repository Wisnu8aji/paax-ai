from __future__ import annotations

"""Deterministic Core Engine capability registry.

This module only describes contracts that already exist in Python Core Engine.
It deliberately contains no construction formula and never converts an
unsupported category into a fabricated zero or quantity.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field

from .models import WorkItemCandidate

Authority = Literal["core_engine", "none"]
CapabilityStatus = Literal["supported", "blocked"]


class TakeoffCapability(BaseModel):
    key: str
    endpoint: str | None
    required_fields: tuple[str, ...] = ()
    source_authority: Authority
    status: CapabilityStatus
    calculation_type: str | None = None
    reason: str | None = None
    request_attribute: str | None = None


_BLOCKED = TakeoffCapability(
    key="unsupported",
    endpoint=None,
    source_authority="none",
    status="blocked",
    reason="no compatible Python Core Engine contract is registered",
)


def _verified_fields(item: WorkItemCandidate) -> set[str]:
    return {
        fact.field
        for fact in item.measurement_facts
        if fact.verification_status in {"engine_verified", "human_verified"}
    }


def resolve_takeoff_capability(item: WorkItemCandidate) -> TakeoffCapability:
    """Resolve one truthful capability from category, verified facts and metadata.

    Explicit manual-domain payloads are accepted only when the producer records
    the exact existing Core Engine contract in ``attributes.engine_contract``.
    This prevents category labels alone from implying formula support.
    """

    category = item.category.strip().lower().replace("-", "_").replace(" ", "_")
    fields = _verified_fields(item)

    if category in {"column", "kolom", "concrete_column"}:
        return TakeoffCapability(
            key="concrete_column_total_volume",
            endpoint="/calculations",
            required_fields=("count", "width", "depth", "height"),
            source_authority="core_engine",
            status="supported",
            calculation_type="concrete_column_total_volume",
        )

    # Existing generic typed boundaries are useful for already-verified area,
    # length and count facts. They sum typed facts; they do not infer geometry.
    preferred = str(item.attributes.get("quantity_basis") or "").lower()
    if preferred in {"area", "length", "count"} and preferred in fields:
        return TakeoffCapability(
            key=f"typed_{preferred}",
            endpoint="/calculations",
            required_fields=(preferred,),
            source_authority="core_engine",
            status="supported",
            calculation_type=preferred,
        )

    contract = str(item.attributes.get("engine_contract") or "").strip()
    request_payload = item.attributes.get("core_engine_payload")
    manual_contracts: dict[str, str] = {
        "takeoff.tanah": "/takeoff/tanah",
        "takeoff.dinding": "/takeoff/dinding",
        "takeoff.arsitektur": "/takeoff/arsitektur",
        "takeoff.baja": "/takeoff/baja",
        "takeoff.atap": "/takeoff/atap",
        "takeoff.kusen": "/takeoff/kusen",
        "takeoff.mep": "/takeoff/mep",
        "takeoff.mep_advanced": "/takeoff/mep-advanced",
        "takeoff.smkk": "/takeoff/smkk",
        "tkg.takeoff": "/tkg/takeoff",
    }
    if contract in manual_contracts and isinstance(request_payload, dict):
        return TakeoffCapability(
            key=contract,
            endpoint=manual_contracts[contract],
            required_fields=("core_engine_payload",),
            source_authority="core_engine",
            status="supported",
            request_attribute="core_engine_payload",
        )

    category_reason: dict[str, str] = {
        "beam": "beam volume contract is not yet available at the typed measurement boundary",
        "balok": "beam volume contract is not yet available at the typed measurement boundary",
        "foundation": "foundation subtype and an existing engine contract are required",
        "pondasi": "foundation subtype and an existing engine contract are required",
        "wall": "verified area/length basis or takeoff.dinding payload is required",
        "dinding": "verified area/length basis or takeoff.dinding payload is required",
        "mep": "explicit takeoff.mep or takeoff.mep_advanced payload is required",
    }
    return _BLOCKED.model_copy(update={
        "key": category or "unknown",
        "reason": category_reason.get(category, _BLOCKED.reason),
    })


def capability_coverage(item: WorkItemCandidate) -> dict[str, Any]:
    capability = resolve_takeoff_capability(item)
    fields = _verified_fields(item)
    missing = [field for field in capability.required_fields if field not in fields and field != "core_engine_payload"]
    if "core_engine_payload" in capability.required_fields and not isinstance(item.attributes.get("core_engine_payload"), dict):
        missing.append("core_engine_payload")
    return {
        "work_item_id": item.work_item_id,
        "category": item.category,
        "capability": capability.model_dump(mode="json"),
        "missing_fields": missing,
        "evidence_refs": sorted(dict.fromkeys(item.evidence_refs)),
        "ready": capability.status == "supported" and not missing and not item.conflict_ids,
    }
