from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.drawing_intelligence.models import (
    PageIntelligence,
    PageProfile,
    SheetSemanticProfile,
    SheetViews,
)
from app.drawing_intelligence.sheet_identity import classify_drawing_type
from app.drawing_intelligence.sheet_views import build_sheet_views


def _page(
    page_index: int,
    *,
    drawing_type: str = "unknown",
    level: str | None = None,
    evidence_refs: list[str] | None = None,
    title: str | None = None,
    with_semantics: bool = True,
) -> PageIntelligence:
    semantics = None
    if with_semantics:
        semantics = SheetSemanticProfile(
            page_index=page_index,
            title=title or f"Sheet {page_index + 1}",
            drawing_type=drawing_type,
            level=level,
            evidence_refs=evidence_refs or [f"EV-{page_index}"],
            confidence=0.9,
        )
    return PageIntelligence(
        profile=PageProfile(
            page_index=page_index,
            width_pt=841,
            height_pt=594,
            rotation=0,
            modality="vector",
            vector_text_spans=10,
            vector_paths=10,
            raster_images=0,
            confidence=0.95,
        ),
        semantics=semantics,
    )


def test_build_sheet_views_orders_canonical_level_buckets_without_mutating_source_identity() -> None:
    pages = [
        _page(8, drawing_type="schedule"),
        _page(3, drawing_type="floor_plan", level="L2"),
        _page(0, drawing_type="site_plan", level="site"),
        _page(6, drawing_type="section"),
        _page(2, drawing_type="floor_plan", level="L1"),
        _page(5, drawing_type="detail"),
        _page(1, drawing_type="foundation_plan", level="foundation"),
        _page(7, drawing_type="elevation"),
        _page(4, drawing_type="roof_plan", level="roof"),
    ]

    views = build_sheet_views(pages)

    assert [entry.level_key for entry in views.level] == [
        "site",
        "foundation",
        "L1",
        "L2",
        "roof",
        "detail",
        "section",
        "elevation",
        "schedule",
    ]
    assert [entry.page_index for entry in views.source] == list(range(9))
    assert [entry.page_number for entry in views.source] == list(range(1, 10))
    assert {entry.page_index for entry in views.level} == set(range(9))
    assert {entry.page_index for entry in views.classification} == set(range(9))


def test_build_sheet_views_orders_classifications_then_levels() -> None:
    pages = [
        _page(9, drawing_type="technical_note", level=None),
        _page(5, drawing_type="section", level="L2"),
        _page(1, drawing_type="drawing_list", level=None),
        _page(8, drawing_type="single_line_diagram", level=None),
        _page(0, drawing_type="cover", level=None),
        _page(7, drawing_type="schedule", level=None),
        _page(4, drawing_type="elevation", level="L1"),
        _page(6, drawing_type="detail", level="L1"),
        _page(3, drawing_type="floor_plan", level="L2"),
        _page(2, drawing_type="site_plan", level="site"),
    ]

    views = build_sheet_views(pages)

    assert [entry.classification_key for entry in views.classification] == [
        "cover",
        "drawing_list",
        "site_plan",
        "plan",
        "elevation",
        "section",
        "detail",
        "schedule",
        "diagram",
        "technical_note",
    ]
    assert [entry.page_index for entry in views.classification] == list(range(10))


def test_plan_pages_are_sorted_by_level_inside_classification() -> None:
    views = build_sheet_views([
        _page(2, drawing_type="floor_plan", level="L10"),
        _page(0, drawing_type="floor_plan", level="L2"),
        _page(1, drawing_type="floor_plan", level="L1"),
    ])

    assert [entry.level_key for entry in views.classification] == ["L1", "L2", "L10"]
    assert [entry.page_index for entry in views.source] == [0, 1, 2]


def test_unknown_page_is_retained_with_review_reason_and_real_evidence() -> None:
    views = build_sheet_views([
        _page(
            0,
            drawing_type="unknown",
            level=None,
            evidence_refs=["EV-TITLE-0", "EV-TEXT-3"],
        )
    ])

    entry = views.source[0]
    assert entry.classification_key == "unknown"
    assert entry.level_key == "unknown"
    assert entry.status == "needs_review"
    assert entry.review_reason == "classification_unknown"
    assert entry.evidence_refs == ["EV-TEXT-3", "EV-TITLE-0"]


def test_missing_semantics_is_not_dropped_or_fabricated() -> None:
    views = build_sheet_views([_page(0, with_semantics=False)])

    assert len(views.source) == 1
    assert views.source[0].status == "needs_review"
    assert views.source[0].review_reason == "sheet_semantics_missing"
    assert views.source[0].classification_key == "unknown"



def test_unassigned_level_becomes_explicit_review_state() -> None:
    views = build_sheet_views([_page(0, drawing_type="floor_plan", level="UNASSIGNED")])

    entry = views.source[0]
    assert entry.level_key == "unknown"
    assert entry.status == "needs_review"
    assert entry.review_reason == "level_unknown"


def test_semantic_page_identity_mismatch_is_quarantined_for_review() -> None:
    page = _page(0, drawing_type="floor_plan", level="L1", evidence_refs=["EV-WRONG-PAGE"])
    assert page.semantics is not None
    page.semantics.page_index = 7

    entry = build_sheet_views([page]).source[0]

    assert entry.page_index == 0
    assert entry.page_number == 1
    assert entry.classification_key == "unknown"
    assert entry.level_key == "unknown"
    assert entry.status == "needs_review"
    assert entry.review_reason == "semantic_page_identity_mismatch"
    assert entry.evidence_refs == ["EV-WRONG-PAGE"]

def test_duplicate_page_identity_is_rejected() -> None:
    with pytest.raises(ValueError, match="duplicate page_index"):
        build_sheet_views([_page(0, drawing_type="cover"), _page(0, drawing_type="detail")])


def test_sheet_views_contract_rejects_non_source_order() -> None:
    built = build_sheet_views([
        _page(0, drawing_type="cover"),
        _page(1, drawing_type="floor_plan", level="L1"),
    ])
    payload = built.model_dump(mode="json")
    payload["source"] = list(reversed(payload["source"]))

    with pytest.raises(ValidationError, match="source view must preserve immutable PDF page order"):
        SheetViews.model_validate(payload)


def test_generic_title_rules_cover_drawing_list_and_technical_note() -> None:
    assert classify_drawing_type("DAFTAR GAMBAR") == "drawing_list"
    assert classify_drawing_type("DRAWING INDEX") == "drawing_list"
    assert classify_drawing_type("CATATAN TEKNIS") == "technical_note"
    assert classify_drawing_type("GENERAL NOTES") == "technical_note"


def test_pipeline_persists_sheet_views_in_package_analysis() -> None:
    import fitz

    from app.drawing_intelligence.pipeline import analyze_drawing_package

    document = fitz.open()
    cover = document.new_page(width=841, height=594)
    cover.insert_text((72, 72), "GAMBAR KERJA\nCOVER")
    plan = document.new_page(width=841, height=594)
    plan.insert_text((72, 72), "DENAH LANTAI 1\nFLOOR PLAN")
    payload = document.tobytes()
    document.close()

    analysis = analyze_drawing_package(payload, document_name="fixture.pdf", mode="fast")

    assert [entry.page_index for entry in analysis.sheet_views.source] == [0, 1]
    assert analysis.sheet_views.source[0].classification_key == "cover"
    assert analysis.sheet_views.source[1].classification_key == "plan"
    assert analysis.sheet_views.source[1].level_key == "L1"
