"""Target 4 (final remediation wave) acceptance tests: explicit coordinate-
space canonicalization, replacing the guess-from-page_transform-presence bug
a prior audit found (an already-normalized bbox was unconditionally
re-transformed as if it were a PDF-point coordinate)."""
import fitz
import pytest

from app.perception.bbox_canonicalize import BboxQuarantined, canonicalize_bbox
from app.perception.coordinate_transform import create_page_transform


def test_normalized_bbox_is_validated_and_clamped_not_retransformed():
    canonical = canonicalize_bbox((0.1, 0.2, 0.3, 0.4), bbox_space="normalized")
    assert canonical.bbox_normalized == (0.1, 0.2, 0.3, 0.4)
    assert canonical.normalization_method == "validate_and_clamp"


def test_normalized_bbox_out_of_range_is_clamped_into_0_1():
    canonical = canonicalize_bbox((-0.5, 0.2, 1.5, 0.4), bbox_space="normalized")
    assert canonical.bbox_normalized == (0.0, 0.2, 1.0, 0.4)


def test_pixel_bbox_is_divided_by_source_dimensions():
    canonical = canonicalize_bbox(
        (100.0, 200.0, 300.0, 400.0), bbox_space="pixel",
        source_width=1000.0, source_height=1000.0,
    )
    assert canonical.bbox_normalized == (0.1, 0.2, 0.3, 0.4)
    assert canonical.normalization_method == "divide_by_source_dimensions"


def test_pixel_bbox_without_source_dimensions_is_quarantined():
    with pytest.raises(BboxQuarantined, match="source_width"):
        canonicalize_bbox((100.0, 200.0, 300.0, 400.0), bbox_space="pixel")


def test_pdf_point_bbox_uses_page_transform():
    doc = fitz.open()
    page = doc.new_page(width=841.89, height=595.28)
    transform = create_page_transform(page, dpi=200)

    canonical = canonicalize_bbox((100.0, 150.0, 200.0, 250.0), bbox_space="pdf_point", page_transform=transform)
    expected = transform.pdf_to_normalized_bbox((100.0, 150.0, 200.0, 250.0))
    assert canonical.bbox_normalized == pytest.approx(expected)
    assert canonical.normalization_method == "page_transform.pdf_to_normalized_bbox"


def test_pdf_point_bbox_without_page_transform_is_quarantined():
    with pytest.raises(BboxQuarantined, match="page_transform"):
        canonicalize_bbox((100.0, 150.0, 200.0, 250.0), bbox_space="pdf_point")


def test_pdf_point_bbox_on_a_rotated_page():
    doc = fitz.open()
    page = doc.new_page(width=841.89, height=595.28)
    page.set_rotation(90)
    transform = create_page_transform(page, dpi=200)

    canonical = canonicalize_bbox((10.0, 20.0, 100.0, 80.0), bbox_space="pdf_point", page_transform=transform)
    assert all(0.0 <= value <= 1.0 for value in canonical.bbox_normalized)


def test_pdf_point_bbox_respects_a_crop_box():
    doc = fitz.open()
    page = doc.new_page(width=841.89, height=595.28)
    page.set_cropbox(fitz.Rect(50, 50, 400, 400))
    transform = create_page_transform(page, dpi=200)

    canonical = canonicalize_bbox((100.0, 150.0, 200.0, 250.0), bbox_space="pdf_point", page_transform=transform)
    assert all(0.0 <= value <= 1.0 for value in canonical.bbox_normalized)


def test_viewport_bbox_is_quarantined_not_guessed():
    with pytest.raises(BboxQuarantined, match="viewport"):
        canonicalize_bbox((0.1, 0.2, 0.3, 0.4), bbox_space="viewport")


def test_unknown_bbox_space_is_quarantined():
    with pytest.raises(BboxQuarantined, match="unknown"):
        canonicalize_bbox((0.1, 0.2, 0.3, 0.4), bbox_space="unknown")


def test_normalized_to_normalized_round_trip_is_identity():
    original = (0.05, 0.15, 0.65, 0.85)
    canonical = canonicalize_bbox(original, bbox_space="normalized")
    assert canonical.bbox_normalized == original
