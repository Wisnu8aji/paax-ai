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

        # ─── Explicitly supported: concrete column ─────────────────────────────
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

        # ─── Explicitly supported: concrete beam (C2 contract) ────────────────
        # Span length comes from written table/bentang evidence via K3 joiner;
        # when absent the item carries missing_information=["span_length"] and
        # the dispatch layer reports needs_input instead of a fabricated volume.
        if category in {"beam", "balok"}:
            return TakeoffCapability(
                key="concrete_beam_total_volume",
                endpoint="/calculations",
                required_fields=["count", "width", "depth", "span_length"],
                source_authority="core_engine",
                status="supported",
                calculation_type="concrete_beam_total_volume",
                category=category,
            )

        # ─── Explicitly blocked: wall without explicit engine_contract ─────────
        if category in {"wall"}:
            return _BLOCKED.model_copy(update={
                "key": category,
                "reason": "wall requires a verified area/length basis and explicit takeoff.dinding contract",
                "category": category,
            })

        # ─── Explicitly blocked: foundation without explicit subtype ──────────
        if category in {"foundation", "pondasi"}:
            return _BLOCKED.model_copy(update={
                "key": category,
                "reason": "foundation subtype and an existing engine contract are required",
                "category": category,
            })

        # ─── Explicitly blocked: MEP without explicit contract ─────────────────
        # If engine_contract is explicitly declared, fall through to the manual_contracts check.
        if category == "mep":
            contract_check = str(item.attributes.get("engine_contract") or "").strip()
            if not contract_check:
                return _BLOCKED.model_copy(update={
                    "key": "mep",
                    "reason": "explicit takeoff.mep or takeoff.mep_advanced engine_contract is required",
                    "category": category,
                })
            # Has contract → fall through to preferred/manual_contracts check below

        # ─── preferred basis (area/length/count) via /calculations ────────────
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

        # ─── Explicit engine_contract + payload path ───────────────────────────
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

        # ─── TKG measurement-fact dispatch ────────────────────────────────────
        if category in {"beton", "bekisting", "besi"}:
            reqs = (
                ["panjang_m", "lebar_m", "tinggi_m"] if category == "beton"
                else (["panjang_m", "tinggi_m"] if category == "bekisting"
                      else ["diameter_mm", "panjang_m"])
            )
            return TakeoffCapability(
                key=f"tkg_{category}",
                endpoint="/tkg/takeoff",
                required_fields=reqs,
                source_authority="none",
                status="ready",
                category=category,
            )

        # ─── Named-endpoint categories ─────────────────────────────────────────
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
            "foundation": "foundation subtype and an existing engine contract are required",
            "pondasi": "foundation subtype and an existing engine contract are required",
            "wall": "verified area/length basis or takeoff.dinding contract is required",
            "dinding": "verified area/length basis or takeoff.dinding payload is required",
            "mep": "explicit takeoff.mep or takeoff.mep_advanced payload is required",
        }
        return _BLOCKED.model_copy(update={
            "key": category or "unknown",
            "reason": category_reason.get(category, _BLOCKED.reason),
            "category": category,
        })

    # ─── String-based registry (for coverage queries and reporting) ────────────
    # Phase 09C Correction: wall/foundation/MEP are explicitly blocked; beam is
    # supported via the C2 concrete_beam_total_volume contract.
    # No aliasing of structurally distinct domains to shared concrete endpoints.
    category_str = item_or_category.strip().lower().replace("-", "_").replace(" ", "_")

    # Explicitly blocked domains — returned immediately without aliasing
    _EXPLICITLY_BLOCKED: dict[str, str] = {
        "wall": "wall requires a verified area/length basis and explicit takeoff.dinding contract",
        "foundation": "foundation subtype and an existing engine contract are required",
        "pondasi": "foundation subtype and an existing engine contract are required",
        "mep": "explicit takeoff.mep or takeoff.mep_advanced engine_contract is required",
    }
    if category_str in _EXPLICITLY_BLOCKED:
        return _BLOCKED.model_copy(update={
            "key": category_str,
            "reason": _EXPLICITLY_BLOCKED[category_str],
            "category": category_str,
        })

    # Concrete column: supported in string-based registry
    if category_str in {"column", "kolom", "concrete_column"}:
        return TakeoffCapability(
            key="concrete_column_total_volume",
            endpoint="/calculations",
            required_fields=["count", "width", "depth", "height"],
            source_authority="core_engine",
            status="supported",
            calculation_type="concrete_column_total_volume",
            category=category_str,
        )

    # Concrete beam: supported in string-based registry (C2)
    if category_str in {"beam", "balok"}:
        return TakeoffCapability(
            key="concrete_beam_total_volume",
            endpoint="/calculations",
            required_fields=["count", "width", "depth", "span_length"],
            source_authority="core_engine",
            status="supported",
            calculation_type="concrete_beam_total_volume",
            category=category_str,
        )

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
        "mep_advanced": ["panjang_m", "spesifikasi"],
        "mep-advanced": ["panjang_m", "spesifikasi"],
        "smkk": ["jumlah_ls"],
    }
    if category_str in req_map_str:
        endpoint = (
            "/tkg/takeoff" if category_str in {"beton", "bekisting", "besi"}
            else f"/takeoff/{category_str.replace('_', '-')}"
        )
        return TakeoffCapability(
            key=f"cap_{category_str}",
            endpoint=endpoint,
            required_fields=req_map_str[category_str],
            source_authority="none",
            status="ready",
            category=category_str,
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
