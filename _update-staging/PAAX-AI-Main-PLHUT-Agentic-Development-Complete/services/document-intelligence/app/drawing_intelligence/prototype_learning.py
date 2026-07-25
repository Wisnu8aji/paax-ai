from __future__ import annotations

from dataclasses import dataclass
from statistics import mean
from typing import Iterable

from .models import VectorDescriptor
from .vector_geometry import descriptor_similarity


@dataclass(frozen=True)
class PrototypeScore:
    score: float
    positive_similarity: float
    negative_similarity: float
    decision: str


def score_against_examples(
    candidate: VectorDescriptor,
    *,
    positive_examples: Iterable[VectorDescriptor],
    negative_examples: Iterable[VectorDescriptor] = (),
    threshold: float = 0.78,
    negative_margin: float = 0.12,
) -> PrototypeScore:
    """Score a vector candidate against project-specific examples.

    Positive examples define what the user wants. Rejected examples are hard
    negatives and subtract confidence only when they are visually close. This
    is deterministic metric learning: no provider call, no hidden training,
    and every component of the score is inspectable.
    """
    positives = [descriptor_similarity(example, candidate) for example in positive_examples]
    if not positives:
        raise ValueError("at least one positive example is required")
    negatives = [descriptor_similarity(example, candidate) for example in negative_examples]
    positive = max(positives) * 0.7 + mean(positives) * 0.3
    negative = max(negatives, default=0.0)
    penalty = max(0.0, negative - (positive - negative_margin))
    score = max(0.0, min(1.0, positive - penalty * 0.85))
    decision = "candidate" if score >= threshold else "rejected"
    if negative >= positive - 0.03:
        decision = "needs_review"
    return PrototypeScore(
        score=round(score, 6),
        positive_similarity=round(positive, 6),
        negative_similarity=round(negative, 6),
        decision=decision,
    )
