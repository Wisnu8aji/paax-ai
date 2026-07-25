"""Deterministic RAB Bridge V2 candidate expansion and ranking.

This module only prepares reviewable candidates. It never selects an AHSP as
final and never derives quantities; Core Engine remains the calculation owner.
"""
from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field


def _tokens(value: str) -> set[str]:
    return {token for token in re.split(r"[^a-z0-9]+", value.lower()) if token}


class AhspCandidate(BaseModel):
    ahsp_code: str
    description: str
    unit: str
    score: float
    ranking_factors: dict[str, float] = Field(default_factory=dict)
    is_final: Literal[False] = False


class RejectedCandidate(BaseModel):
    ahsp_code: str
    reason: str


class WorkItemCandidate(BaseModel):
    work_item_id: str
    work_type: str
    category: str
    expected_unit: str
    measurement_fact_ids: list[str] = Field(default_factory=list)
    status: Literal["candidate_ready", "needs_measurement", "no_candidate"]
    ahsp_candidates: list[AhspCandidate] = Field(default_factory=list)
    rejected_candidates: list[RejectedCandidate] = Field(default_factory=list)


class CandidateSet(BaseModel):
    project_id: str
    snapshot_id: str
    physical_element_id: str
    work_items: list[WorkItemCandidate]
    provenance: dict[str, Any]


_CONCRETE_WORKS = [
    ("beton", "beton", "m3", "volume_input"),
    ("bekisting", "bekisting", "m2", "area"),
    ("pembesian", "pembesian", "kg", "mass_input"),
    ("curing", "curing", "m2", "area"),
    ("support", "support", "unit", "count"),
]

# Domain-specific work breakdowns, keyed by discipline (see project_graph
# node.discipline conventions in cross_sheet_resolver.py: "structure",
# "architecture", "mep"). A prior audit found every non-concrete element
# collapsed to a single generic ("primary", element_category, "unit",
# "count") work item regardless of what it actually was -- a masonry wall
# and a plumbing fixture both got the identical, uninformative breakdown.
# These lists give architecture/MEP elements the same multi-work-item
# decomposition concrete already had. Structure non-concrete elements (e.g.
# structural steel) fall through to _STRUCTURE_NON_CONCRETE_WORKS.
_STRUCTURE_NON_CONCRETE_WORKS = [
    ("erection", "structural_steel", "kg", "mass_input"),
    ("connection", "connection", "unit", "count"),
    ("coating", "coating", "m2", "area"),
]

_ARCHITECTURE_WORKS = [
    ("pasangan", "pasangan", "m2", "area"),
    ("plesteran", "plesteran", "m2", "area"),
    ("acian", "acian", "m2", "area"),
    ("finishing", "finishing", "m2", "area"),
    ("unit_terpasang", "unit_terpasang", "unit", "count"),
]

_MEP_WORKS = [
    ("instalasi_pipa", "instalasi_pipa", "m", "length"),
    ("titik_instalasi", "titik_instalasi", "unit", "count"),
    ("peralatan_utama", "peralatan_utama", "unit", "count"),
    ("pengujian", "pengujian", "unit", "count"),
]

_DISCIPLINE_WORKS: dict[str, list[tuple[str, str, str, str]]] = {
    "structure": _STRUCTURE_NON_CONCRETE_WORKS,
    "architecture": _ARCHITECTURE_WORKS,
    "mep": _MEP_WORKS,
}

# Below this score a candidate's token/metadata overlap with the queried
# element is too weak to present as a ranked AHSP suggestion; a work item
# whose only candidates all fall under this line becomes "no_candidate"
# rather than silently surfacing the least-bad guess as if it were reliable.
_MINIMUM_CANDIDATE_SCORE = 0.15


def _score(
    *, work_type: str, unit: str, description: str, discipline: str, category: str, material: str,
    method: str, wbs: str, region_code: str, item: dict[str, Any], history: list[dict[str, Any]],
) -> tuple[float, dict[str, float]]:
    # Token overlap is only the first-stage candidate signal; every other
    # deterministic metadata factor is explicit in the returned provenance.
    query = _tokens(f"{description} {work_type} {category} {material} {method}")
    text = _tokens(item.get("description", ""))
    overlap = len(query & text) / (len(query | text) or 1)
    factors = {"token_overlap": overlap}
    for field, expected, weight in (
        ("discipline", discipline, .10), ("category", category, .12), ("material", material, .10),
        ("method", method, .08), ("wbs", wbs, .06),
    ):
        if expected and item.get(field) == expected:
            factors[field] = weight
    if region_code in item.get("regions", []):
        factors["regional_catalog"] = .10
    for selection in history:
        if selection.get("ahsp_code") == item.get("code") and selection.get("discipline") == discipline and selection.get("category") == category and selection.get("region_code") == region_code:
            factors["human_history"] = min(.20, .04 * int(selection.get("selections", 0)))
    return round(sum(factors.values()), 6), factors


def build_candidate_set(
    *, project_id: str, snapshot_id: str, physical_element_id: str, verified_physical: bool, discipline: str, element_category: str,
    material: str, method: str, wbs: str, region_code: str, description: str, evidence_refs: list[str],
    measurement_facts: list[dict[str, Any]], catalog: list[dict[str, Any]], human_history: list[dict[str, Any]],
) -> CandidateSet:
    """Expand a verified concrete element into reviewable work/AHSP candidates.

    Inputs are expected to originate from verified physical-element bindings.
    Only approved typed facts make a work item calculation-ready.
    """
    if not verified_physical:
        raise ValueError("RAB Bridge V2 accepts only verified physical elements")
    approved = [fact for fact in measurement_facts if fact.get("verification_status") in {"human_verified", "engine_verified"}]
    if material == "concrete":
        work_specs = _CONCRETE_WORKS
    else:
        work_specs = _DISCIPLINE_WORKS.get(discipline, [("primary", element_category, "unit", "count")])
    work_items: list[WorkItemCandidate] = []
    for index, (work_type, category, expected_unit, measurement_type) in enumerate(work_specs, start=1):
        facts = [fact for fact in approved if fact.get("measurement_type") == measurement_type and fact.get("unit") == expected_unit]
        status: Literal["candidate_ready", "needs_measurement", "no_candidate"] = "candidate_ready" if facts else "needs_measurement"
        candidates: list[AhspCandidate] = []
        rejected: list[RejectedCandidate] = []
        if status == "candidate_ready":
            for item in catalog:
                exclusions = {str(value).lower() for value in item.get("exclusions", [])}
                context = _tokens(f"{description} {method} {material} {element_category}")
                if exclusions & context:
                    rejected.append(RejectedCandidate(ahsp_code=item.get("code", ""), reason="excluded_by_catalog"))
                    continue
                if item.get("unit") != expected_unit:
                    rejected.append(RejectedCandidate(ahsp_code=item.get("code", ""), reason=f"incompatible_unit:{item.get('unit')}!={expected_unit}"))
                    continue
                score, factors = _score(work_type=work_type, unit=expected_unit, description=description, discipline=discipline, category=category, material=material, method=method, wbs=wbs, region_code=region_code, item=item, history=human_history)
                if score < _MINIMUM_CANDIDATE_SCORE:
                    rejected.append(RejectedCandidate(ahsp_code=item.get("code", ""), reason=f"below_minimum_score:{score}<{_MINIMUM_CANDIDATE_SCORE}"))
                    continue
                candidates.append(AhspCandidate(ahsp_code=item["code"], description=item.get("description", ""), unit=expected_unit, score=score, ranking_factors=factors))
            candidates.sort(key=lambda candidate: (-candidate.score, candidate.ahsp_code))
            # Every catalog item was either excluded, unit-incompatible, or
            # below the minimum score -- there is no reliable candidate to
            # present, so say so explicitly instead of silently returning an
            # empty candidate list under a status that implies readiness.
            if not candidates and catalog:
                status = "no_candidate"
        work_items.append(WorkItemCandidate(
            work_item_id=f"{physical_element_id}:{work_type}:{index}", work_type=work_type, category=category,
            expected_unit=expected_unit, measurement_fact_ids=[fact["measurement_id"] for fact in facts], status=status,
            ahsp_candidates=candidates, rejected_candidates=rejected,
        ))
    return CandidateSet(
        project_id=project_id, snapshot_id=snapshot_id, physical_element_id=physical_element_id, work_items=work_items,
        provenance={"evidence_refs": list(dict.fromkeys(evidence_refs)), "measurement_fact_ids": [fact["measurement_id"] for fact in approved], "region_code": region_code, "ranking": "token_overlap_plus_metadata; human_approval_required"},
    )
