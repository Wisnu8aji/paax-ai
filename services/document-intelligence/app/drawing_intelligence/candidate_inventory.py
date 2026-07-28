from __future__ import annotations

"""Lossless candidate inventory for Feedback 1.

The inventory is intentionally separate from presentation filtering.  Every
source candidate is represented exactly once and unsupported/incomplete rows
remain visible as ``blocked`` or ``needs_review`` rather than disappearing.
"""

from collections.abc import Iterable, Mapping
from typing import Any, Literal

from pydantic import BaseModel, Field

from .models import DrawingPackageAnalysis, WorkItemCandidate

CandidateOrigin = Literal["dem", "pckm", "consolidated_registry"]
CoverageStatus = Literal["ready", "calculated", "needs_review", "blocked"]


class CandidateInventoryRow(BaseModel):
    candidate_id: str = Field(min_length=1)
    origin: CandidateOrigin
    work_item_id: str | None = None
    page_index: int = Field(ge=0)
    evidence_refs: list[str] = Field(default_factory=list)
    category: str = Field(min_length=1)
    coverage_status: CoverageStatus
    reason: str | None = None


def _status_for_work_item(item: WorkItemCandidate) -> tuple[CoverageStatus, str | None]:
    if item.calculation is not None and item.calculation.status == "complete":
        return "calculated", None
    if item.conflict_ids:
        return "needs_review", "open_conflict"
    if item.calculation_readiness == "ready":
        return "ready", None
    if item.calculation_readiness == "needs_input":
        return "needs_review", "missing_required_measurement_fact"
    return "blocked", "unsupported_or_incomplete_engine_contract"


def _mapping_page_index(row: Mapping[str, Any]) -> int:
    value = row.get("page_index", 0)
    return int(value) if isinstance(value, (int, float, str)) and str(value).lstrip("-").isdigit() else 0


def _mapping_id(row: Mapping[str, Any], *, prefix: str, index: int) -> str:
    for key in ("candidate_id", "id", "work_item_id", "node_id"):
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return f"{prefix}-{index}"


def build_candidate_inventory(
    analysis: DrawingPackageAnalysis,
    *,
    pckm_candidates: Iterable[Mapping[str, Any]] | None = None,
) -> list[CandidateInventoryRow]:
    rows: list[CandidateInventoryRow] = []

    for page in analysis.pages:
        for detection in page.detections:
            status: CoverageStatus
            reason: str | None = None
            if detection.status == "accepted":
                status = "ready"
            elif detection.status == "needs_review":
                status = "needs_review"
                reason = "detection_needs_review"
            elif detection.status == "rejected":
                status = "blocked"
                reason = "detection_rejected"
            else:
                status = "needs_review"
                reason = "candidate_not_resolved"
            rows.append(CandidateInventoryRow(
                candidate_id=detection.candidate_id,
                origin="dem",
                page_index=detection.page_index,
                evidence_refs=sorted(dict.fromkeys(detection.evidence_refs)),
                category=detection.category or "unknown",
                coverage_status=status,
                reason=reason,
            ))

    graph_candidates = pckm_candidates
    if graph_candidates is None:
        raw = analysis.construction_graph.get("pckm_candidates", []) if isinstance(analysis.construction_graph, dict) else []
        graph_candidates = raw if isinstance(raw, list) else []
    for index, candidate in enumerate(graph_candidates):
        candidate_id = _mapping_id(candidate, prefix="pckm", index=index)
        category = str(candidate.get("category") or candidate.get("node_type") or "unknown")
        refs = candidate.get("evidence_refs") or []
        resolved = str(candidate.get("verification_status") or candidate.get("status") or "").lower()
        status: CoverageStatus = "ready" if resolved in {"verified", "accepted", "engine_verified", "human_verified"} else "needs_review"
        rows.append(CandidateInventoryRow(
            candidate_id=candidate_id,
            origin="pckm",
            work_item_id=str(candidate.get("work_item_id") or "").strip() or None,
            page_index=max(0, _mapping_page_index(candidate)),
            evidence_refs=sorted(dict.fromkeys(str(value) for value in refs if str(value).strip())),
            category=category,
            coverage_status=status,
            reason=None if status == "ready" else "pckm_candidate_not_verified",
        ))

    for item in analysis.work_items:
        status, reason = _status_for_work_item(item)
        page_index = min(item.page_indices) if item.page_indices else 0
        rows.append(CandidateInventoryRow(
            candidate_id=item.work_item_id,
            origin="consolidated_registry",
            work_item_id=item.work_item_id,
            page_index=page_index,
            evidence_refs=sorted(dict.fromkeys(item.evidence_refs)),
            category=item.category or "unknown",
            coverage_status=status,
            reason=reason,
        ))

    identities = [(row.origin, row.candidate_id) for row in rows]
    if len(identities) != len(set(identities)):
        duplicates = sorted({identity for identity in identities if identities.count(identity) > 1})
        raise ValueError(f"duplicate candidate inventory identities: {duplicates}")
    return rows
