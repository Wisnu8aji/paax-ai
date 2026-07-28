from __future__ import annotations

"""Bounded, review-only AI fallback for sheet classification.

The deterministic sheet classifier remains authoritative.  This module is
called only after deterministic abstention/low confidence and accepts only
already-extracted text plus evidence identifiers.  It never receives a PDF,
image, path, or pixel payload and never mutates source sheet metadata.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable

from app.drawing_intelligence.models import SheetClassificationKey
from app.perception.ai_assist.client import AiAssistClient

DEFAULT_REVIEW_THRESHOLD = 0.75
_ALLOWED = tuple(item.value for item in SheetClassificationKey if item is not SheetClassificationKey.UNKNOWN)


@dataclass(frozen=True)
class SheetTextFragment:
    text: str
    evidence_ref: str
    bbox_id: str | None = None


@dataclass(frozen=True)
class SheetClassificationContext:
    page_index: int
    title: str | None
    fragments: tuple[SheetTextFragment, ...]
    deterministic_classification: str | None = None
    deterministic_confidence: float = 0.0
    review_threshold: float = DEFAULT_REVIEW_THRESHOLD
    allowed_categories: tuple[str, ...] = _ALLOWED


@dataclass(frozen=True)
class SheetClassificationProposal:
    page_index: int
    classification_key: str
    proposed_category: str | None
    confidence: float
    reasoning: str
    source_texts: tuple[str, ...]
    evidence_refs: tuple[str, ...]
    bbox_ids: tuple[str, ...]
    status: str = "needs_review"
    auto_commit_allowed: bool = False
    prompt_version: str = "sheet-classification-assist-v1"
    model: str = "unknown"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "classification_key": {"type": "STRING"},
        "proposed_category": {"type": "STRING", "nullable": True},
        "confidence": {"type": "NUMBER"},
        "reasoning": {"type": "STRING"},
        "source_texts": {"type": "ARRAY", "items": {"type": "STRING"}},
        "evidence_refs": {"type": "ARRAY", "items": {"type": "STRING"}},
        "bbox_ids": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": [
        "classification_key",
        "confidence",
        "reasoning",
        "source_texts",
        "evidence_refs",
        "bbox_ids",
    ],
}


def _clean_strings(value: Any) -> tuple[str, ...] | None:
    if not isinstance(value, list):
        return None
    cleaned = tuple(str(item).strip() for item in value if str(item).strip())
    return cleaned


def _subset(values: Iterable[str], allowed: set[str]) -> bool:
    return all(value in allowed for value in values)


def _prompt(context: SheetClassificationContext) -> str:
    fragments = [
        {
            "text": item.text,
            "evidence_ref": item.evidence_ref,
            "bbox_id": item.bbox_id,
        }
        for item in context.fragments
    ]
    return (
        "Classify one construction drawing sheet using only the extracted fragments below. "
        "Do not invent text, evidence ids, or bbox ids. Select one allowed category, or use "
        "classification_key='unknown' and propose a concise novel category for human review.\n"
        f"page_index={context.page_index}\n"
        f"title={context.title or ''}\n"
        f"allowed_categories={list(context.allowed_categories)}\n"
        f"fragments={fragments}"
    )


def suggest_sheet_classification(
    context: SheetClassificationContext,
    client: AiAssistClient,
    *,
    model: str | None = None,
) -> SheetClassificationProposal | None:
    """Return a validated proposal only after deterministic abstention.

    A deterministic classified result at or above the threshold exits without
    touching the client.  Every returned proposal remains ``needs_review`` and
    explicitly disallows auto-commit.
    """

    deterministic = (context.deterministic_classification or "unknown").strip()
    if deterministic != "unknown" and context.deterministic_confidence >= context.review_threshold:
        return None
    if not context.fragments and not (context.title or "").strip():
        return None

    raw = client.generate_json(
        system_prompt=(
            "You are a bounded construction-sheet metadata assistant. Use only supplied extracted "
            "text/evidence. Never calculate quantities and never approve or mutate metadata."
        ),
        user_prompt=_prompt(context),
        response_schema=_RESPONSE_SCHEMA,
        operation_name="drawing_intelligence:sheet_classification",
    )
    if not isinstance(raw, dict):
        return None

    classification = str(raw.get("classification_key") or "").strip().lower()
    proposed_category = str(raw.get("proposed_category") or "").strip() or None
    reasoning = str(raw.get("reasoning") or "").strip()
    source_texts = _clean_strings(raw.get("source_texts"))
    evidence_refs = _clean_strings(raw.get("evidence_refs"))
    bbox_ids = _clean_strings(raw.get("bbox_ids"))
    if not reasoning or source_texts is None or evidence_refs is None or bbox_ids is None:
        return None

    allowed_categories = set(context.allowed_categories)
    if classification not in allowed_categories and classification != "unknown":
        return None
    if classification == "unknown" and not proposed_category:
        return None
    if classification != "unknown" and proposed_category:
        # Novel labels are never silently attached to a known canonical bucket.
        return None

    fragments = context.fragments
    allowed_texts = {fragment.text for fragment in fragments}
    allowed_refs = {fragment.evidence_ref for fragment in fragments}
    allowed_bboxes = {fragment.bbox_id for fragment in fragments if fragment.bbox_id}
    if not source_texts or not evidence_refs:
        return None
    if not _subset(source_texts, allowed_texts):
        return None
    if not _subset(evidence_refs, allowed_refs):
        return None
    if not _subset(bbox_ids, allowed_bboxes):
        return None

    try:
        confidence = float(raw.get("confidence"))
    except (TypeError, ValueError):
        return None
    if not 0 <= confidence <= 1:
        return None

    client_model = model or str(getattr(client, "model", "unknown"))
    return SheetClassificationProposal(
        page_index=context.page_index,
        classification_key=classification,
        proposed_category=proposed_category,
        confidence=confidence,
        reasoning=reasoning,
        source_texts=source_texts,
        evidence_refs=evidence_refs,
        bbox_ids=bbox_ids,
        model=client_model,
    )
