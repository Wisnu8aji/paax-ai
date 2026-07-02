from __future__ import annotations

import hashlib

from .models import ReviewCandidate, ReviewTask, ReviewTriageRequest, ReviewTriageResult


def _task_id(project_id: str, candidate: ReviewCandidate, reasons: list[str]) -> str:
    raw = "|".join([project_id, candidate.target_type, candidate.target_ref, ",".join(reasons)])
    return "rev_" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _reasons(candidate: ReviewCandidate, ambang_conf: float) -> list[str]:
    reasons: list[str] = []
    if candidate.cost_rank_pct is not None and candidate.p_pareto is not None:
        if candidate.cost_rank_pct >= candidate.p_pareto:
            reasons.append("RULE-TRI-01:PARETO")
    if candidate.confidence is not None and candidate.confidence < ambang_conf:
        reasons.append("RULE-TRI-01:LOW_CONFIDENCE")
    if candidate.corroborations <= 0:
        reasons.append("RULE-TRI-01:NO_CORROBORATION")
    if candidate.implied_high_impact:
        reasons.append("RULE-TRI-01:IMPLIED_HIGH_IMPACT")
    if candidate.precedence_conflict:
        reasons.append("RULE-TRI-01:PRECEDENCE_CONFLICT")
    return reasons


def triage_review_tasks(req: ReviewTriageRequest) -> ReviewTriageResult:
    tasks: list[ReviewTask] = []
    for candidate in req.candidates:
        reasons = _reasons(candidate, req.ambang_conf)
        if not reasons:
            continue
        priority = round(candidate.impact_score * candidate.uncertainty_score, 6)
        tasks.append(ReviewTask(
            id=_task_id(req.project_id, candidate, reasons),
            project_id=req.project_id,
            target_ref=candidate.target_ref,
            target_type=candidate.target_type,
            reasons=reasons,
            priority=priority,
            impact_score=candidate.impact_score,
            uncertainty_score=candidate.uncertainty_score,
        ))
    tasks.sort(key=lambda t: (-t.priority, t.target_ref, t.id))
    return ReviewTriageResult(project_id=req.project_id, tasks=tasks)
