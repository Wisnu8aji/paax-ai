from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field

from app.drawing_intelligence.candidate_inventory import CandidateInventoryRow

SourceAuthority = Literal["none", "review", "core_engine"]
ReadinessStatus = Literal["ready", "needs_review", "blocked"]


class TakeoffCapability(BaseModel):
    endpoint: str
    required_fields: list[str]
    source_authority: SourceAuthority = "none"
    status: ReadinessStatus = "ready"
    category: str
    work_type: str | None = None
    notes: str | None = None


class CoverageRow(BaseModel):
    work_id: str
    category: str
    evidence_refs: list[str] = Field(default_factory=list)
    required_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    endpoint: str | None = None
    readiness: ReadinessStatus = "blocked"
    source_authority: SourceAuthority = "none"
    reason: str | None = None


# Deterministic Takeoff Registry mapping categories/work_types to existing Core Engine routes
_TAKEOFF_CAPABILITY_REGISTRY: dict[str, dict[str, Any]] = {
    "beton": {
        "endpoint": "/tkg/takeoff",
        "required_fields": ["panjang_m", "lebar_m", "tinggi_m"],
        "notes": "Core Engine TKG beton contract",
    },
    "bekisting": {
        "endpoint": "/tkg/takeoff",
        "required_fields": ["panjang_m", "tinggi_m"],
        "notes": "Core Engine TKG bekisting contract",
    },
    "besi": {
        "endpoint": "/tkg/takeoff",
        "required_fields": ["diameter_mm", "panjang_m"],
        "notes": "Core Engine TKG besi/tulangan contract",
    },
    "tanah": {
        "endpoint": "/takeoff/tanah",
        "required_fields": ["panjang_m", "lebar_m", "dalam_m"],
        "notes": "Core Engine takeoff tanah contract (bank/gembur/padat)",
    },
    "dinding": {
        "endpoint": "/takeoff/dinding",
        "required_fields": ["panjang_m", "tinggi_m"],
        "notes": "Core Engine takeoff dinding contract (pasangan/plester/acian/cat)",
    },
    "arsitektur": {
        "endpoint": "/takeoff/arsitektur",
        "required_fields": ["luas_m2"],
        "notes": "Core Engine takeoff arsitektur contract (lantai/plin/atap)",
    },
    "baja": {
        "endpoint": "/takeoff/baja",
        "required_fields": ["berat_kg"],
        "notes": "Core Engine takeoff baja contract (profil/cat)",
    },
    "atap": {
        "endpoint": "/takeoff/atap",
        "required_fields": ["luas_m2"],
        "notes": "Core Engine takeoff atap contract",
    },
    "kusen": {
        "endpoint": "/takeoff/kusen",
        "required_fields": ["panjang_m"],
        "notes": "Core Engine takeoff kusen contract",
    },
    "mep": {
        "endpoint": "/takeoff/mep",
        "required_fields": ["panjang_m"],
        "notes": "Core Engine takeoff mep contract",
    },
    "mep-advanced": {
        "endpoint": "/takeoff/mep-advanced",
        "required_fields": ["panjang_m", "spesifikasi"],
        "notes": "Core Engine takeoff mep-advanced contract",
    },
    "smkk": {
        "endpoint": "/takeoff/smkk",
        "required_fields": ["jumlah_ls"],
        "notes": "Core Engine takeoff smkk contract",
    },
}


def resolve_takeoff_capability(
    category: str,
    work_type: str | None = None,
) -> TakeoffCapability | None:
    norm_cat = (category or "").strip().lower()
    entry = _TAKEOFF_CAPABILITY_REGISTRY.get(norm_cat)
    if not entry:
        return None

    return TakeoffCapability(
        endpoint=entry["endpoint"],
        required_fields=list(entry["required_fields"]),
        source_authority="none",
        status="ready",
        category=norm_cat,
        work_type=work_type,
        notes=entry.get("notes"),
    )


def build_coverage_report(
    inventory: list[CandidateInventoryRow],
    provided_evidence_fields: dict[str, list[str]] | None = None,
) -> list[CoverageRow]:
    provided_fields_map = provided_evidence_fields or {}
    report: list[CoverageRow] = []

    for item in inventory:
        cand_id = item.candidate_id
        cat = item.category
        capability = resolve_takeoff_capability(cat)

        # Base properties
        evidence_refs = list(item.evidence_refs or [])

        # If endpoint is absent or capability is None -> explicit blocked
        if capability is None:
            report.append(
                CoverageRow(
                    work_id=cand_id,
                    category=cat,
                    evidence_refs=evidence_refs,
                    required_fields=[],
                    missing_fields=[],
                    endpoint=None,
                    readiness="blocked",
                    source_authority="none",
                    reason=item.reason or "unsupported_category_or_missing_endpoint",
                )
            )
            continue

        # Derived required fields & check missing fields
        req_fields = capability.required_fields
        given_fields = set(provided_fields_map.get(cand_id, []))
        missing = [f for f in req_fields if f not in given_fields]

        # Authority is NEVER core_engine at registry coverage stage
        auth: SourceAuthority = "review" if item.coverage_status == "needs_review" else "none"

        # Determine readiness
        readiness: ReadinessStatus = "ready"
        reason: str | None = item.reason

        if item.coverage_status == "blocked":
            readiness = "blocked"
            reason = reason or "candidate_inventory_blocked"
        elif missing:
            readiness = "needs_review"
            reason = f"missing_required_fields: {', '.join(missing)}"
        elif item.coverage_status == "needs_review":
            readiness = "needs_review"
            reason = reason or "candidate_flagged_for_review"

        report.append(
            CoverageRow(
                work_id=cand_id,
                category=cat,
                evidence_refs=evidence_refs,
                required_fields=req_fields,
                missing_fields=missing,
                endpoint=capability.endpoint,
                readiness=readiness,
                source_authority=auth,
                reason=reason,
            )
        )

    return report
