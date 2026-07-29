from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field

from .models import WorkItemCandidate

Authority = Literal["core_engine", "none", "review"]
ReadinessStatus = Literal["ready", "needs_review", "blocked", "supported"]


class TakeoffCapability(BaseModel):
    key: str = ""
    endpoint: str | None = None
    required_fields: list[str] = Field(default_factory=list)
    source_authority: Authority = "none"
    status: ReadinessStatus = "ready"
    calculation_type: str | None = None
    category: str | None = None
    work_type: str | None = None
    reason: str | None = None
    request_attribute: str | None = None
    notes: str | None = None


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


def resolve_takeoff_capability(
    item_or_category: WorkItemCandidate | str,
    work_type: str | None = None,
) -> TakeoffCapability:
    if isinstance(item_or_category, WorkItemCandidate):
        item = item_or_category
        category = item.category.strip().lower().replace("-", "_").replace(" ", "_")
        fields = _verified_fields(item)

        if category in {"column", "kolom", "concrete_column"}:
            return TakeoffCapability(
                key="concrete_column_total_volume",
                endpoint="/calculations",
                required_fields=["count", "width", "depth", "height"],
                source_authority="core_engine",
                status="supported",
                calculation_type="concrete_column_total_volume",
                category=category,
            )

        preferred = str(item.attributes.get("quantity_basis") or "").lower()
        if preferred in {"area", "length", "count"} and preferred in fields:
            return TakeoffCapability(
                key=f"typed_{preferred}",
                endpoint="/calculations",
                required_fields=[preferred],
                source_authority="core_engine",
                status="supported",
                calculation_type=preferred,
                category=category,
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
                required_fields=["core_engine_payload"],
                source_authority="core_engine",
                status="supported",
                request_attribute="core_engine_payload",
                category=category,
            )

        if category in {"beton", "bekisting", "besi"}:
            reqs = ["panjang_m", "lebar_m", "tinggi_m"] if category == "beton" else (["panjang_m", "tinggi_m"] if category == "bekisting" else ["diameter_mm", "panjang_m"])
            return TakeoffCapability(
                key=f"tkg_{category}",
                endpoint="/tkg/takeoff",
                required_fields=reqs,
                source_authority="none",
                status="ready",
                category=category,
            )

        if category in {"tanah", "dinding", "arsitektur", "baja", "atap", "kusen", "mep_advanced", "smkk"}:
            req_map = {
                "tanah": ["panjang_m", "lebar_m", "dalam_m"],
                "dinding": ["panjang_m", "tinggi_m"],
                "arsitektur": ["luas_m2"],
                "baja": ["berat_kg"],
                "atap": ["luas_m2"],
                "kusen": ["panjang_m"],
                "mep": ["panjang_m"],
                "mep-advanced": ["panjang_m", "spesifikasi"],
                "smkk": ["jumlah_ls"],
            }
            return TakeoffCapability(
                key=f"takeoff_{category}",
                endpoint=f"/takeoff/{category}",
                required_fields=req_map.get(category, ["luas_m2"]),
                source_authority="none",
                status="ready",
                category=category,
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
            "category": category,
        })

    category_str = item_or_category.strip().lower().replace("-", "_").replace(" ", "_")
    cat_alias_map = {
        "column": "beton",
        "kolom": "beton",
        "beam": "beton",
        "balok": "beton",
        "wall": "dinding",
        "foundation": "tanah",
    }
    target_cat = cat_alias_map.get(category_str, category_str)

    req_map_str = {
        "beton": ["panjang_m", "lebar_m", "tinggi_m"],
        "bekisting": ["panjang_m", "tinggi_m"],
        "besi": ["diameter_mm", "panjang_m"],
        "tanah": ["panjang_m", "lebar_m", "dalam_m"],
        "dinding": ["panjang_m", "tinggi_m"],
        "arsitektur": ["luas_m2"],
        "baja": ["berat_kg"],
        "atap": ["luas_m2"],
        "kusen": ["panjang_m"],
        "mep": ["panjang_m"],
        "mep_advanced": ["panjang_m", "spesifikasi"],
        "mep-advanced": ["panjang_m", "spesifikasi"],
        "smkk": ["jumlah_ls"],
    }
    if target_cat in req_map_str:
        endpoint = "/tkg/takeoff" if target_cat in {"beton", "bekisting", "besi"} else f"/takeoff/{target_cat.replace('_', '-')}"
        return TakeoffCapability(
            key=f"cap_{target_cat}",
            endpoint=endpoint,
            required_fields=req_map_str[target_cat],
            source_authority="none",
            status="ready",
            category=target_cat,
            work_type=work_type,
        )

    return _BLOCKED.model_copy(update={"key": category_str, "category": category_str})


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
        "ready": capability.status in {"supported", "ready"} and not missing and not item.conflict_ids,
    }
