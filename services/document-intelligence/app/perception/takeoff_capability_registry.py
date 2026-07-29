from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field

from app.drawing_intelligence.candidate_inventory import CandidateInventoryRow
from app.drawing_intelligence.takeoff_capabilities import (
    TakeoffCapability,
    resolve_takeoff_capability,
)

SourceAuthority = Literal["none", "review", "core_engine"]
ReadinessStatus = Literal["ready", "needs_review", "blocked"]


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

        evidence_refs = list(item.evidence_refs or [])

        if capability is None or capability.status == "blocked" or not capability.endpoint:
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

        req_fields = capability.required_fields
        given_fields = set(provided_fields_map.get(cand_id, []))
        missing = [f for f in req_fields if f not in given_fields]

        auth: SourceAuthority = "review" if item.coverage_status == "needs_review" else "none"

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
