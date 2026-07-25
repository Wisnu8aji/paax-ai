"""Explicit RAB Bridge V2 lifecycle; approval is never inferred."""
from __future__ import annotations

_TRANSITIONS = {
    "draft": {"candidate_ready", "needs_review", "rejected", "superseded"},
    "candidate_ready": {"needs_review", "approved", "rejected", "superseded"},
    "needs_review": {"approved", "rejected", "superseded"},
    "approved": {"calculation_pending", "rejected", "superseded"},
    "calculation_pending": {"calculated", "needs_review", "rejected"},
    "calculated": {"materialized", "superseded"},
    "materialized": {"superseded"},
    "rejected": set(), "superseded": set(),
}


def transition(current: str, target: str) -> str:
    if target == "calculation_pending" and current != "approved":
        raise ValueError("human AHSP approval is required before calculation")
    if target not in _TRANSITIONS.get(current, set()):
        raise ValueError(f"invalid RAB Bridge transition: {current} -> {target}")
    return target
