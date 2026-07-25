"""Deterministic evidence-integrity classification for one DEM page."""
from __future__ import annotations

from typing import Iterable

from app.transcription.models import (
    DemIntegrityCounts,
    DemIntegrityObservation,
    DemIntegrityReport,
    DemObservations,
    DrawingEvidenceSheet,
    ObservationValue,
)


_DANGLING_REASON = "integrity: dangling evidence"


def _observation_groups(
    sheet: DrawingEvidenceSheet,
) -> Iterable[tuple[str, list[ObservationValue]]]:
    for category in DemObservations.model_fields:
        yield category, getattr(sheet.observations, category)


def _bbox_values(sheet: DrawingEvidenceSheet) -> list[tuple[float, float, float, float]]:
    values = [view.bbox for view in sheet.views]
    values.extend(item.bbox for item in sheet.evidence if item.bbox is not None)
    values.extend(
        observation.bbox
        for _, observations in _observation_groups(sheet)
        for observation in observations
        if observation.bbox is not None
    )
    return values


def _bbox_is_in_contract(bbox: tuple[float, float, float, float]) -> bool:
    return all(0.0 <= coordinate <= 1.0 for coordinate in bbox)


def _coordinate_space(
    bboxes: list[tuple[float, float, float, float]],
) -> tuple[str, int]:
    out_of_contract = [bbox for bbox in bboxes if not _bbox_is_in_contract(bbox)]
    if not out_of_contract:
        return "normalized", len(out_of_contract)
    if len(out_of_contract) > len([bbox for bbox in bboxes if _bbox_is_in_contract(bbox)]):
        return "pixel_like", len(out_of_contract)
    return "mixed", len(out_of_contract)


def _identity_reference_groups(sheet: DrawingEvidenceSheet) -> Iterable[list[str]]:
    yield sheet.sheet_identity.sheet_number.evidence_refs
    yield sheet.sheet_identity.title.evidence_refs
    for candidate in sheet.sheet_identity.scale_candidates:
        yield candidate.evidence_refs


def _duplicate_evidence_ids(sheet: DrawingEvidenceSheet) -> tuple[int, list[str]]:
    seen: set[str] = set()
    duplicate_ids: list[str] = []
    for item in sheet.evidence:
        if item.evidence_id in seen:
            duplicate_ids.append(item.evidence_id)
        else:
            seen.add(item.evidence_id)
    unique_duplicate_ids = list(dict.fromkeys(duplicate_ids))
    return len(duplicate_ids), unique_duplicate_ids


def build_integrity_report(sheet: DrawingEvidenceSheet) -> DemIntegrityReport:
    """Classify one DEM sheet without changing any source model value."""

    evidence_ids = {item.evidence_id for item in sheet.evidence}
    dangling_refs: list[str] = []
    for refs in _identity_reference_groups(sheet):
        dangling_refs.extend(reference for reference in refs if reference not in evidence_ids)

    quarantined: list[DemIntegrityObservation] = []
    flagged: list[DemIntegrityObservation] = []
    for category, observations in _observation_groups(sheet):
        for observation in observations:
            missing_refs = [
                reference
                for reference in observation.evidence_refs
                if reference not in evidence_ids
            ]
            dangling_refs.extend(missing_refs)
            if not missing_refs:
                continue
            item = DemIntegrityObservation(
                category=category,
                raw=observation.raw,
                reason=_DANGLING_REASON,
                evidence_refs=missing_refs,
            )
            if len(missing_refs) == len(observation.evidence_refs):
                quarantined.append(item)
            else:
                flagged.append(item)

    bboxes = _bbox_values(sheet)
    coordinate_space, out_of_contract_count = _coordinate_space(bboxes)
    duplicate_count, duplicate_ids = _duplicate_evidence_ids(sheet)
    completion_consistent = (
        sheet.completion.is_complete
        == (sheet.completion.sections_completed == sheet.completion.sections_expected)
    )
    notes: list[str] = []
    if not sheet.evidence:
        notes.append("no_evidence")
    notes.extend(f"duplicate evidence_id: {evidence_id}" for evidence_id in duplicate_ids)
    if not completion_consistent:
        notes.append("completion inconsistent")

    return DemIntegrityReport(
        page_index=sheet.source.page_index,
        sheet_id=sheet.sheet_identity.sheet_number.value,
        coordinate_space=coordinate_space,
        counts=DemIntegrityCounts(
            total_bbox=len(bboxes),
            out_of_contract_bbox=out_of_contract_count,
            dangling_refs=len(dangling_refs),
            duplicate_evidence_ids=duplicate_count,
            quarantined_observation_count=len(quarantined),
        ),
        quarantined_observations=quarantined,
        flagged_observations=flagged,
        completion_consistent=completion_consistent,
        notes=notes,
    )
