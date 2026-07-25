"""Hybrid classifier: AI proposal + deterministic civil taxonomy + evidence gates."""
from __future__ import annotations
from dataclasses import dataclass
from .civil_taxonomy import resolve_identity
from .lbs_wbs import project_breakdown

@dataclass(frozen=True)
class ClassificationDecision:
    status: str
    discipline: str | None
    element_class: str | None
    level: str | None
    lbs_path: tuple[str, ...]
    wbs_code: str | None
    wbs_group: str | None
    confidence: float
    reason_codes: tuple[str, ...]


def classify(*, ai_discipline: str | None, ai_element: str | None, ai_level: str | None,
             evidence_count: int, active_conflict: bool, element_code: str | None = None) -> ClassificationDecision:
    identity = resolve_identity(discipline=ai_discipline, element=ai_element, level=ai_level)
    reasons=list(identity.reason_codes)
    if evidence_count <= 0: reasons.append("no_evidence")
    if active_conflict: reasons.append("active_conflict")
    if reasons:
        return ClassificationDecision("review_required", identity.discipline, identity.element_class, identity.level,
                                      (), None, None, max(0.0, identity.confidence - 0.2), tuple(reasons))
    breakdown=project_breakdown(level=identity.level or "UNKNOWN", element_class=identity.element_class or "unknown", element_code=element_code)
    return ClassificationDecision("classified", identity.discipline, identity.element_class, identity.level,
                                  breakdown.lbs_path, breakdown.wbs_code, breakdown.wbs_group,
                                  min(1.0, identity.confidence + min(evidence_count, 3)*0.03), ())
