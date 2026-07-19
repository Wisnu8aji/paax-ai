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
    status: Literal["candidate_ready", "needs_measurement"]
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
    work_specs = _CONCRETE_WORKS if material == "concrete" else [("primary", element_category, "unit", "count")]
    work_items: list[WorkItemCandidate] = []
    for index, (work_type, category, expected_unit, measurement_type) in enumerate(work_specs, start=1):
        facts = [fact for fact in approved if fact.get("measurement_type") == measurement_type and fact.get("unit") == expected_unit]
        status: Literal["candidate_ready", "needs_measurement"] = "candidate_ready" if facts else "needs_measurement"
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
                candidates.append(AhspCandidate(ahsp_code=item["code"], description=item.get("description", ""), unit=expected_unit, score=score, ranking_factors=factors))
            candidates.sort(key=lambda candidate: (-candidate.score, candidate.ahsp_code))
        work_items.append(WorkItemCandidate(
            work_item_id=f"{physical_element_id}:{work_type}:{index}", work_type=work_type, category=category,
            expected_unit=expected_unit, measurement_fact_ids=[fact["measurement_id"] for fact in facts], status=status,
            ahsp_candidates=candidates, rejected_candidates=rejected,
        ))
    return CandidateSet(
        project_id=project_id, snapshot_id=snapshot_id, physical_element_id=physical_element_id, work_items=work_items,
        provenance={"evidence_refs": list(dict.fromkeys(evidence_refs)), "measurement_fact_ids": [fact["measurement_id"] for fact in approved], "region_code": region_code, "ranking": "token_overlap_plus_metadata; human_approval_required"},
    )
