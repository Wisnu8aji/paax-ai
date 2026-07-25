from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from typing import Iterable

import fitz

from .coordinates import normalized_bbox, pdf_bbox
from .models import BBox, DetectionCandidate, InteractiveMeasurement, VectorDescriptor


@dataclass(frozen=True)
class _PathFeature:
    rect: fitz.Rect
    segment_count: int
    curve_count: int
    rectangle_count: int
    closed: bool
    fill: bool
    stroke: bool
    orientations: tuple[float, ...]
    points: tuple[tuple[float, float], ...]


def _path_feature(drawing: dict) -> _PathFeature | None:
    rect = fitz.Rect(drawing.get("rect") or (0, 0, 0, 0))
    if rect.is_empty or rect.width <= 0 or rect.height <= 0:
        return None
    segments = curves = rectangles = 0
    orientations: list[float] = []
    points: list[tuple[float, float]] = []
    for item in drawing.get("items") or []:
        kind = item[0]
        if kind == "l":
            p1, p2 = item[1], item[2]
            segments += 1
            dx, dy = p2.x - p1.x, p2.y - p1.y
            angle = math.atan2(dy, dx) % math.pi
            orientations.append(angle)
            points.extend([(float(p1.x), float(p1.y)), (float(p2.x), float(p2.y))])
        elif kind == "c":
            curves += 1
            for p in item[1:]:
                if hasattr(p, "x"):
                    points.append((float(p.x), float(p.y)))
        elif kind == "re":
            rectangles += 1
            r = fitz.Rect(item[1])
            points.extend(
                [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1), (r.x0, r.y0)]
            )
            segments += 4
            orientations.extend([0.0, math.pi / 2, 0.0, math.pi / 2])
        elif kind == "qu":
            q = item[1]
            q_points = [q.ul, q.ur, q.lr, q.ll, q.ul]
            points.extend((float(p.x), float(p.y)) for p in q_points)
            segments += 4
    return _PathFeature(
        rect=rect,
        segment_count=segments,
        curve_count=curves,
        rectangle_count=rectangles,
        closed=bool(drawing.get("closePath")) or rectangles > 0,
        fill=drawing.get("fill") is not None,
        stroke=drawing.get("color") is not None,
        orientations=tuple(orientations),
        points=tuple(points),
    )


def _orientation_histogram(values: Iterable[float], bins: int = 8) -> list[float]:
    hist = [0.0] * bins
    values = list(values)
    if not values:
        return hist
    for angle in values:
        index = min(bins - 1, int((angle % math.pi) / math.pi * bins))
        hist[index] += 1.0
    total = sum(hist)
    return [value / total for value in hist]


def descriptor_for_features(features: list[_PathFeature]) -> VectorDescriptor:
    if not features:
        return VectorDescriptor(
            width=0,
            height=0,
            aspect_ratio=0,
            segment_count=0,
            curve_count=0,
            rectangle_count=0,
            closed_path_count=0,
            fill_count=0,
            stroke_count=0,
            orientation_histogram=[0.0] * 8,
        )
    rect = fitz.Rect(features[0].rect)
    for feature in features[1:]:
        rect.include_rect(feature.rect)
    return VectorDescriptor(
        width=float(rect.width),
        height=float(rect.height),
        aspect_ratio=float(rect.width / max(rect.height, 1e-9)),
        segment_count=sum(feature.segment_count for feature in features),
        curve_count=sum(feature.curve_count for feature in features),
        rectangle_count=sum(feature.rectangle_count for feature in features),
        closed_path_count=sum(feature.closed for feature in features),
        fill_count=sum(feature.fill for feature in features),
        stroke_count=sum(feature.stroke for feature in features),
        orientation_histogram=_orientation_histogram(
            angle for feature in features for angle in feature.orientations
        ),
    )


def descriptor_for_bbox(page: fitz.Page, box: BBox) -> tuple[VectorDescriptor, list[_PathFeature]]:
    target = pdf_bbox(box, page.rect)
    features: list[_PathFeature] = []
    try:
        drawings = page.get_drawings()
    except Exception:
        drawings = []
    for drawing in drawings:
        feature = _path_feature(drawing)
        if feature is None or not feature.rect.intersects(target):
            continue
        features.append(feature)
    return descriptor_for_features(features), features


def descriptor_similarity(reference: VectorDescriptor, candidate: VectorDescriptor) -> float:
    if reference.segment_count == 0 or candidate.segment_count == 0:
        return 0.0

    def ratio(a: float, b: float) -> float:
        if a == 0 and b == 0:
            return 1.0
        return min(a, b) / max(a, b, 1e-9)

    structure = (
        ratio(reference.segment_count, candidate.segment_count) * 0.28
        + ratio(reference.curve_count, candidate.curve_count) * 0.14
        + ratio(reference.rectangle_count, candidate.rectangle_count) * 0.12
        + ratio(reference.closed_path_count, candidate.closed_path_count) * 0.1
        + ratio(reference.aspect_ratio, candidate.aspect_ratio) * 0.18
    )
    orientation_distance = sum(
        abs(a - b) for a, b in zip(reference.orientation_histogram, candidate.orientation_histogram)
    ) / 2.0
    orientation = max(0.0, 1.0 - orientation_distance) * 0.18
    return max(0.0, min(1.0, structure + orientation))


def find_similar_vectors(
    page: fitz.Page,
    page_index: int,
    reference_bbox: BBox,
    *,
    threshold: float = 0.78,
    max_candidates: int = 250,
) -> list[DetectionCandidate]:
    reference, _ = descriptor_for_bbox(page, reference_bbox)
    try:
        drawings = page.get_drawings()
    except Exception:
        drawings = []
    results: list[DetectionCandidate] = []
    for index, drawing in enumerate(drawings):
        feature = _path_feature(drawing)
        if feature is None:
            continue
        # Ignore paths that are either microscopic or effectively whole-page.
        normalized = normalized_bbox(feature.rect, page.rect)
        if normalized.area < 1e-7 or normalized.area > 0.08:
            continue
        descriptor = descriptor_for_features([feature])
        score = descriptor_similarity(reference, descriptor)
        if score < threshold:
            continue
        digest = hashlib.sha1(f"{page_index}|{index}|{feature.rect}".encode()).hexdigest()[:12]
        results.append(
            DetectionCandidate(
                candidate_id=f"vector-{digest}",
                page_index=page_index,
                category="similar_vector",
                bbox=normalized,
                confidence=score,
                status="candidate" if score >= 0.88 else "needs_review",
                method="vector_similarity",
                descriptor=descriptor,
                reasons=[f"vector descriptor similarity {score:.3f}"],
            )
        )
    results.sort(key=lambda item: (-item.confidence, item.bbox.y0, item.bbox.x0))
    return _deduplicate_candidates(results)[:max_candidates]


def find_similar_by_examples(
    page: fitz.Page,
    page_index: int,
    positive_bboxes: list[BBox],
    *,
    negative_bboxes: list[BBox] | None = None,
    threshold: float = 0.78,
    max_candidates: int = 250,
) -> list[DetectionCandidate]:
    """Find repeated vector objects from multiple project-specific examples.

    Positive and negative examples come from the user's current drawing set.
    The function is deterministic and exposes the score rationale; it never
    turns candidates into accepted physical quantities.
    """
    if not positive_bboxes:
        raise ValueError("at least one positive reference bbox is required")
    from .prototype_learning import score_against_examples

    positives = [descriptor_for_bbox(page, box)[0] for box in positive_bboxes]
    negatives = [descriptor_for_bbox(page, box)[0] for box in (negative_bboxes or [])]
    try:
        drawings = page.get_drawings()
    except Exception:
        drawings = []
    results: list[DetectionCandidate] = []
    for index, drawing in enumerate(drawings):
        feature = _path_feature(drawing)
        if feature is None:
            continue
        normalized = normalized_bbox(feature.rect, page.rect)
        if normalized.area < 1e-7 or normalized.area > 0.08:
            continue
        descriptor = descriptor_for_features([feature])
        result = score_against_examples(
            descriptor,
            positive_examples=positives,
            negative_examples=negatives,
            threshold=threshold,
        )
        if result.decision == "rejected":
            continue
        digest = hashlib.sha1(f"examples|{page_index}|{index}|{feature.rect}".encode()).hexdigest()[:12]
        results.append(
            DetectionCandidate(
                candidate_id=f"prototype-{digest}",
                page_index=page_index,
                category="project_prototype",
                bbox=normalized,
                confidence=result.score,
                status="candidate" if result.decision == "candidate" and result.score >= 0.88 else "needs_review",
                method="vector_similarity",
                descriptor=descriptor,
                reasons=[
                    f"positive similarity {result.positive_similarity:.3f}",
                    f"hard-negative similarity {result.negative_similarity:.3f}",
                    "project-specific prototype; not a verified physical count",
                ],
            )
        )
    results.sort(key=lambda item: (-item.confidence, item.bbox.y0, item.bbox.x0))
    return _deduplicate_candidates(results)[:max_candidates]


def _point_in_polygon(point: tuple[float, float], polygon: list[tuple[float, float]]) -> bool:
    x, y = point
    inside = False
    if len(polygon) < 3:
        return False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        xi, yi = polygon[i]; xj, yj = polygon[j]
        intersects = (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / max(yj - yi, 1e-12) + xi
        if intersects:
            inside = not inside
        j = i
    return inside


def _polygon_area(points: list[tuple[float, float]]) -> float:
    if len(points) < 3:
        return 0.0
    if points[0] != points[-1]:
        points = [*points, points[0]]
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:]))) / 2.0


def _distance_to_segment(px: float, py: float, a: tuple[float, float], b: tuple[float, float]) -> float:
    ax, ay = a; bx, by = b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def one_click_area(
    page: fitz.Page,
    page_index: int,
    positive_points: list[tuple[float, float]],
    negative_points: list[tuple[float, float]] | None = None,
) -> InteractiveMeasurement:
    negative_points = negative_points or []
    if not positive_points:
        raise ValueError("at least one positive point is required")
    features: list[_PathFeature] = []
    try:
        drawings = page.get_drawings()
    except Exception:
        drawings = []
    for drawing in drawings:
        feature = _path_feature(drawing)
        if feature is None or not feature.closed:
            continue
        polygon = list(feature.points)
        normalized_polygon = [
            ((x - page.rect.x0) / page.rect.width, (y - page.rect.y0) / page.rect.height)
            for x, y in polygon
        ]
        box = normalized_bbox(feature.rect, page.rect)
        contains_positive = all(
            _point_in_polygon(point, normalized_polygon) if len(normalized_polygon) >= 3 else box.contains(*point)
            for point in positive_points
        )
        contains_negative = any(
            _point_in_polygon(point, normalized_polygon) if len(normalized_polygon) >= 3 else box.contains(*point)
            for point in negative_points
        )
        if not contains_positive or contains_negative:
            continue
        features.append(feature)
    features.sort(key=lambda feature: feature.rect.get_area())
    if not features:
        return InteractiveMeasurement(
            measurement_id=f"area-p{page_index}-unresolved",
            page_index=page_index,
            kind="area",
            geometry=[],
            confidence=0.0,
            status="needs_review",
            review_reason="no closed vector boundary contains all positive points",
        )
    feature = features[0]
    box = normalized_bbox(feature.rect, page.rect)
    raw_points = list(feature.points)
    if len(raw_points) >= 3:
        if raw_points[0] != raw_points[-1]:
            raw_points.append(raw_points[0])
        geometry = [
            ((x - page.rect.x0) / page.rect.width, (y - page.rect.y0) / page.rect.height)
            for x, y in raw_points
        ]
        area_pt2 = _polygon_area(raw_points)
    else:
        geometry = [
            (box.x0, box.y0), (box.x1, box.y0), (box.x1, box.y1), (box.x0, box.y1), (box.x0, box.y0)
        ]
        area_pt2 = float(feature.rect.width * feature.rect.height)
    confidence = 0.92 if feature.rectangle_count else 0.78
    return InteractiveMeasurement(
        measurement_id=f"area-p{page_index}-{hashlib.sha1(str(feature.rect).encode()).hexdigest()[:10]}",
        page_index=page_index,
        kind="area",
        geometry=geometry,
        raw_value=area_pt2,
        raw_unit="pt2",
        confidence=confidence,
        status="candidate",
        review_reason="candidate boundary requires reviewer confirmation before any scaled quantity is accepted",
    )


def one_click_line(page: fitz.Page, page_index: int, point: tuple[float, float]) -> InteractiveMeasurement:
    px = page.rect.x0 + point[0] * page.rect.width
    py = page.rect.y0 + point[1] * page.rect.height
    best: tuple[float, _PathFeature] | None = None
    try:
        drawings = page.get_drawings()
    except Exception:
        drawings = []
    for drawing in drawings:
        feature = _path_feature(drawing)
        if feature is None or not feature.points:
            continue
        segment_distances = [
            _distance_to_segment(px, py, a, b) for a, b in zip(feature.points, feature.points[1:])
        ]
        distance = min(segment_distances) if segment_distances else _distance_to_rect(px, py, feature.rect)
        if best is None or distance < best[0]:
            best = (distance, feature)
    if best is None:
        return InteractiveMeasurement(
            measurement_id=f"line-p{page_index}-unresolved",
            page_index=page_index,
            kind="line",
            geometry=[],
            confidence=0.0,
            status="needs_review",
            review_reason="no vector line found near the selected point",
        )
    distance, feature = best
    points = feature.points[:]
    if len(points) < 2:
        points = ((feature.rect.x0, feature.rect.y0), (feature.rect.x1, feature.rect.y1))
    normalized_points = [
        ((x - page.rect.x0) / page.rect.width, (y - page.rect.y0) / page.rect.height)
        for x, y in points
    ]
    length = 0.0
    for a, b in zip(points, points[1:]):
        length += math.hypot(b[0] - a[0], b[1] - a[1])
    confidence = max(0.5, min(0.96, 1.0 - distance / max(page.rect.width, page.rect.height)))
    return InteractiveMeasurement(
        measurement_id=f"line-p{page_index}-{hashlib.sha1(str(feature.rect).encode()).hexdigest()[:10]}",
        page_index=page_index,
        kind="line",
        geometry=normalized_points,
        raw_value=length,
        raw_unit="pt",
        confidence=confidence,
        status="candidate",
        review_reason="candidate vector path requires reviewer confirmation before any scaled quantity is accepted",
    )


def _distance_to_rect(x: float, y: float, rect: fitz.Rect) -> float:
    dx = max(rect.x0 - x, 0.0, x - rect.x1)
    dy = max(rect.y0 - y, 0.0, y - rect.y1)
    return math.hypot(dx, dy)


def _deduplicate_candidates(candidates: list[DetectionCandidate]) -> list[DetectionCandidate]:
    result: list[DetectionCandidate] = []
    for candidate in candidates:
        if any(_iou(candidate.bbox, existing.bbox) > 0.85 for existing in result):
            continue
        result.append(candidate)
    return result


def _iou(a: BBox, b: BBox) -> float:
    x0, y0 = max(a.x0, b.x0), max(a.y0, b.y0)
    x1, y1 = min(a.x1, b.x1), min(a.y1, b.y1)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    intersection = (x1 - x0) * (y1 - y0)
    union = a.area + b.area - intersection
    return intersection / max(union, 1e-12)
