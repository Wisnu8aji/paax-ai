"""Explicit coordinate-space canonicalization for evidence bounding boxes.

Target 4, final remediation wave. A prior bug in synthesis_task.py guessed
a bbox's coordinate space purely from whether a PageTransform happened to be
present, and unconditionally applied pdf_to_normalized_bbox -- which is
correct only for a genuinely PDF-point bbox and actively corrupts an
already-normalized one (shrinks it toward the origin). That guess is
replaced here with an explicit, stated bbox_space (EvidenceItem.bbox_space)
that decides which transform (if any) applies -- normalized bboxes are only
validated/clamped, pixel bboxes are divided by the source render dimensions,
pdf_point bboxes go through PageTransform, and unknown/unrecognized spaces
are quarantined rather than guessed at.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.perception.coordinate_transform import PageTransform

BboxSpace = Literal["normalized", "pixel", "pdf_point", "viewport", "unknown"]
BboxTuple = tuple[float, float, float, float]

COORDINATE_SCHEMA_VERSION = "paax.bbox.v1"


class BboxQuarantined(ValueError):
    """Raised when a bbox cannot be canonicalized -- callers must not
    silently fall back to treating it as normalized; this must surface as a
    quarantine/manual-review state, per Target 5's retrieval-eligibility
    rule (missing/unknown coordinate space is not authoritative)."""


@dataclass(frozen=True)
class CanonicalBbox:
    bbox_normalized: BboxTuple
    bbox_space: BboxSpace
    normalization_method: str
    coordinate_schema_version: str = COORDINATE_SCHEMA_VERSION
    transform_version: str | None = None


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _clamp_bbox(bbox: BboxTuple) -> BboxTuple:
    x0, y0, x1, y1 = bbox
    return (_clamp(x0), _clamp(y0), _clamp(x1), _clamp(y1))


def canonicalize_bbox(
    bbox: BboxTuple,
    *,
    bbox_space: BboxSpace,
    source_width: float | None = None,
    source_height: float | None = None,
    page_transform: PageTransform | None = None,
) -> CanonicalBbox:
    """Canonicalize one bbox to normalized [0, 1] page-relative coordinates,
    branching strictly on the *stated* bbox_space -- never inferred from
    whether page_transform happens to be provided.

    Raises BboxQuarantined if the space is unknown/unsupported, or if a
    required transform input (source dimensions, page_transform) is missing
    for the space that was stated.
    """
    if bbox_space == "normalized":
        # Trust, but verify: a bbox claimed normalized that is wildly out of
        # [0, 1] is more likely mislabeled than a page-edge artifact -- clamp
        # rather than reject, matching the audit's "normalized -> validate
        # and clamp" instruction exactly.
        return CanonicalBbox(
            bbox_normalized=_clamp_bbox(bbox), bbox_space="normalized",
            normalization_method="validate_and_clamp",
        )

    if bbox_space == "pixel":
        if not source_width or not source_height:
            raise BboxQuarantined("pixel bbox requires source_width/source_height to normalize")
        x0, y0, x1, y1 = bbox
        normalized = (x0 / source_width, y0 / source_height, x1 / source_width, y1 / source_height)
        return CanonicalBbox(
            bbox_normalized=_clamp_bbox(normalized), bbox_space="pixel",
            normalization_method="divide_by_source_dimensions",
        )

    if bbox_space == "pdf_point":
        if page_transform is None:
            raise BboxQuarantined("pdf_point bbox requires page_transform to normalize")
        normalized = page_transform.pdf_to_normalized_bbox(bbox)
        return CanonicalBbox(
            bbox_normalized=_clamp_bbox(normalized), bbox_space="pdf_point",
            normalization_method="page_transform.pdf_to_normalized_bbox",
            transform_version=getattr(page_transform, "transform_version", None),
        )

    if bbox_space == "viewport":
        # A viewport bbox is a rendered/displayed-coordinate bbox that is not
        # necessarily the same as the source render pixel dimensions (e.g. a
        # zoomed/panned client viewport) -- there is no deterministic mapping
        # back to page-normalized space without knowing the viewport's own
        # transform, which this module does not have. Quarantine rather than
        # guess; a future viewport-aware caller can extend this with its own
        # transform once that contract exists.
        raise BboxQuarantined("viewport bbox has no deterministic normalization path yet")

    raise BboxQuarantined(f"unrecognized or unknown bbox_space: {bbox_space!r}")
