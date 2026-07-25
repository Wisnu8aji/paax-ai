from __future__ import annotations

import hashlib
from collections import defaultdict
from typing import Literal

from pydantic import BaseModel, Field

from .advanced_zones import HierarchicalViewZone
from .models import BBox


class InstanceCandidateV2(BaseModel):
    candidate_id: str
    page_index: int
    code: str
    category: str
    level: str | None = None
    bbox: BBox
    confidence: float = Field(ge=0, le=1)
    source_channel: Literal["native_pdf", "vector_model", "raster_model", "dem", "user"]
    zone_id: str | None = None
    evidence_refs: list[str] = Field(default_factory=list)


class ReconstructedInstanceV2(BaseModel):
    instance_id: str
    page_index: int
    code: str
    category: str
    level: str | None = None
    bbox: BBox
    confidence: float = Field(ge=0, le=1)
    authority: Literal["candidate", "engine_verified", "human_verified", "rejected"] = "candidate"
    source_candidate_ids: list[str]
    evidence_refs: list[str]


class InstanceReconstructionResult(BaseModel):
    instances: list[ReconstructedInstanceV2]
    rejected_candidate_ids: list[str]
    duplicate_candidate_ids: list[str]
    counts: dict[str, int]
    auto_confirmed: bool
    reasons: list[str]


_DEFAULT_THRESHOLDS = {
    "column": 0.88, "beam": 0.91, "slab": 0.94, "foundation": 0.90,
    "door": 0.92, "window": 0.92, "mep": 0.95,
}


def _overlap_ratio(a: BBox, b: BBox) -> float:
    x0, y0 = max(a.x0, b.x0), max(a.y0, b.y0)
    x1, y1 = min(a.x1, b.x1), min(a.y1, b.y1)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    inter = (x1 - x0) * (y1 - y0)
    return inter / max(min(a.area, b.area), 1e-12)


def _instance_id(candidate: InstanceCandidateV2) -> str:
    raw = f"{candidate.page_index}|{candidate.code}|{candidate.level}|{','.join(f'{v:.5f}' for v in candidate.bbox.values)}"
    return "inst-v2-" + hashlib.sha1(raw.encode()).hexdigest()[:16]


def reconstruct_instances_v2(
    candidates: list[InstanceCandidateV2], zones: list[HierarchicalViewZone], *,
    active_conflicts: list[str] | None = None, negative_example_boxes: list[BBox] | None = None,
    thresholds: dict[str, float] | None = None,
) -> InstanceReconstructionResult:
    threshold_map = {**_DEFAULT_THRESHOLDS, **(thresholds or {})}
    active_conflicts = active_conflicts or []
    negative_example_boxes = negative_example_boxes or []
    exclusion_zones = [z for z in zones if z.exclusion_for_physical_count]
    rejected: list[str] = []
    duplicates: list[str] = []
    accepted: list[InstanceCandidateV2] = []

    for candidate in sorted(candidates, key=lambda c: (-c.confidence, c.candidate_id)):
        if any(z.page_index == candidate.page_index and _overlap_ratio(candidate.bbox, z.bbox) >= 0.25 for z in exclusion_zones):
            rejected.append(candidate.candidate_id)
            continue
        if any(_overlap_ratio(candidate.bbox, neg) >= 0.50 for neg in negative_example_boxes):
            rejected.append(candidate.candidate_id)
            continue
        duplicate = next((a for a in accepted if a.page_index == candidate.page_index and a.code == candidate.code
                          and a.level == candidate.level and _overlap_ratio(a.bbox, candidate.bbox) >= 0.65), None)
        if duplicate:
            duplicates.append(candidate.candidate_id)
            continue
        accepted.append(candidate)

    instances: list[ReconstructedInstanceV2] = []
    reasons: list[str] = []
    for candidate in accepted:
        threshold = threshold_map.get(candidate.category, 0.95)
        authority: Literal["candidate", "engine_verified", "human_verified", "rejected"] = "candidate"
        if candidate.confidence >= threshold and not active_conflicts:
            authority = "engine_verified"
        instances.append(ReconstructedInstanceV2(
            instance_id=_instance_id(candidate), page_index=candidate.page_index, code=candidate.code,
            category=candidate.category, level=candidate.level, bbox=candidate.bbox,
            confidence=candidate.confidence, authority=authority,
            source_candidate_ids=[candidate.candidate_id], evidence_refs=candidate.evidence_refs,
        ))

    if active_conflicts:
        reasons.append("active conflicts cancel automatic confirmation")
    if rejected:
        reasons.append(f"{len(rejected)} candidates excluded by semantic zones or negative examples")
    if duplicates:
        reasons.append(f"{len(duplicates)} duplicate source-channel candidates removed")
    counts: dict[str, int] = defaultdict(int)
    for instance in instances:
        if instance.authority in {"engine_verified", "human_verified"}:
            counts[f"{instance.level or 'UNSCOPED'}:{instance.code}"] += 1
    auto_confirmed = bool(instances) and all(i.authority == "engine_verified" for i in instances) and not active_conflicts
    return InstanceReconstructionResult(
        instances=instances, rejected_candidate_ids=rejected, duplicate_candidate_ids=duplicates,
        counts=dict(counts), auto_confirmed=auto_confirmed, reasons=reasons,
    )
