from __future__ import annotations

from typing import Dict

from .models import ConfidenceResult


RANK_METHOD: Dict[str, float] = {
    "read_from_grid": 0.9,
    "read_from_table": 0.9,
    "read_from_level": 0.9,
    "vector_length": 0.9,
    "vector_polygon": 0.9,
    "manual_verified": 0.95,
    "manual_input": 0.85,
    "read_from_text": 0.8,
    "ocr_local": 0.65,
    "visual_llm": 0.45,
}


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _r4(value: float) -> float:
    return round(value + 1e-12, 4)


def score_confidence(
    method: str,
    quality_score: float,
    corroborations: int = 0,
    conflicts: int = 0,
    critical: bool = False,
    weights: Dict[str, float] | None = None,
    ambang_conf: float = 0.7,
) -> ConfidenceResult:
    weights = weights or {"source": 0.5, "corroboration": 0.3, "quality": 0.2}
    s_source = RANK_METHOD.get(method, 0.35)
    s_quality = _clamp(quality_score)
    if conflicts > 0:
        s_corrob = 0.0
    elif corroborations > 0:
        s_corrob = 1.0
    else:
        s_corrob = 0.35

    confidence = _clamp(
        weights.get("source", 0) * s_source
        + weights.get("corroboration", 0) * s_corrob
        + weights.get("quality", 0) * s_quality
    )
    reasons: list[str] = []
    if conflicts > 0:
        reasons.append("conflict")
    if critical and corroborations == 0:
        reasons.append("critical_without_corroboration")
    if confidence < ambang_conf:
        reasons.append("low_confidence")

    return ConfidenceResult(
        method=method,
        s_source=_r4(s_source),
        s_corrob=_r4(s_corrob),
        s_quality=_r4(s_quality),
        confidence=_r4(confidence),
        needs_review=bool(reasons),
        reasons=reasons,
    )
