from __future__ import annotations

import io
from pathlib import Path

import fitz

from app.drawing_intelligence.models import BBox
from app.drawing_intelligence.pipeline import analyze_drawing_package
from app.drawing_intelligence.vector_geometry import find_similar_vectors, one_click_area, one_click_line


def _synthetic_pdf() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=900, height=600)
    # Drawing region: two repeated closed rectangles and drawing labels.
    page.draw_rect(fitz.Rect(80, 100, 280, 260), color=(0, 0, 0))
    page.draw_rect(fitz.Rect(340, 100, 540, 260), color=(0, 0, 0))
    page.insert_text((150, 180), "K1", fontsize=16)
    page.insert_text((410, 180), "K1", fontsize=16)
    # Legend / schedule region.
    page.draw_rect(fitz.Rect(620, 80, 860, 250), color=(0, 0, 0))
    page.insert_text((640, 110), "KETERANGAN", fontsize=14)
    page.insert_text((640, 145), "K1 400 x 400 mm KOLOM BETON", fontsize=11)
    # Notes and title block.
    page.insert_text((80, 500), "CATATAN UMUM", fontsize=12)
    page.draw_rect(fitz.Rect(600, 470, 880, 580), color=(0, 0, 0))
    page.insert_text((620, 505), "NO. GAMBAR S-201", fontsize=10)
    page.insert_text((620, 530), "SKALA 1:100", fontsize=10)
    data = doc.tobytes()
    doc.close()
    return data


def test_package_pipeline_builds_zones_vocabulary_and_cross_references():
    result = analyze_drawing_package(
        _synthetic_pdf(),
        document_name="synthetic.pdf",
        mode="deep",
    )

    assert result.page_count == 1
    assert result.metrics["ai_provider_calls"] == 0
    zone_types = {zone.type for zone in result.pages[0].zones}
    assert {"drawing", "legend", "notes", "title_block"}.issubset(zone_types)

    definitions = [entry for entry in result.vocabulary if entry.canonical_key == "K1"]
    assert definitions
    assert any(entry.attributes.get("dimensions", {}).get("a") == 400 for entry in definitions)

    # Only the two drawing occurrences are counted. The K1 in the legend is excluded.
    matches = [match for match in result.cross_references if match.canonical_key == "K1"]
    assert len(matches) == 2
    work_item = next(item for item in result.work_items if item.code == "K1")
    assert work_item.occurrence_count_observed == 2
    assert "authoritative_count_source" in work_item.missing_information


def test_one_click_area_and_line_are_deterministic_and_evidence_safe():
    doc = fitz.open(stream=_synthetic_pdf(), filetype="pdf")
    try:
        page = doc[0]
        area = one_click_area(page, 0, [(0.2, 0.3)])
        assert area.kind == "area"
        assert area.raw_value and area.raw_value > 0
        assert area.raw_unit == "pt2"
        assert area.scaled_value is None
        assert area.status == "candidate"

        line = one_click_line(page, 0, (0.09, 0.2))
        assert line.kind == "line"
        assert line.raw_value and line.raw_value > 0
        assert line.scaled_value is None
        assert line.status == "candidate"
    finally:
        doc.close()


def test_find_similar_uses_reference_vector_descriptor_without_ai():
    doc = fitz.open(stream=_synthetic_pdf(), filetype="pdf")
    try:
        page = doc[0]
        reference = BBox(x0=80 / 900, y0=100 / 600, x1=280 / 900, y1=260 / 600)
        matches = find_similar_vectors(page, 0, reference, threshold=0.7)
        assert matches
        assert all(match.method == "vector_similarity" for match in matches)
    finally:
        doc.close()


def test_real_plhut_pdf_is_vector_first_when_fixture_is_available():
    repo_root = Path(__file__).resolve().parents[3]
    pdf = repo_root / "GAMBAR KERJA PLHUT SURAKARTA (1).pdf"
    if not pdf.is_file():
        return
    result = analyze_drawing_package(
        pdf.read_bytes(),
        document_name=pdf.name,
        mode="fast",
        max_pages=3,
    )
    assert result.metrics["analyzed_pages"] == 3
    assert result.metrics["modality_counts"]["vector"] == 3
    assert all(page.profile.vector_text_spans > 0 for page in result.pages)


def test_project_specific_positive_and_negative_examples_are_deterministic():
    from app.drawing_intelligence.vector_geometry import find_similar_by_examples

    doc = fitz.open(stream=_synthetic_pdf(), filetype="pdf")
    try:
        page = doc[0]
        first = BBox(x0=80 / 900, y0=100 / 600, x1=280 / 900, y1=260 / 600)
        second = BBox(x0=340 / 900, y0=100 / 600, x1=540 / 900, y1=260 / 600)
        results = find_similar_by_examples(page, 0, [first], threshold=0.65)
        assert len(results) >= 2
        negative_results = find_similar_by_examples(
            page, 0, [first], negative_bboxes=[second], threshold=0.65
        )
        assert all("project-specific prototype" in " ".join(item.reasons) for item in negative_results)
        assert all(item.status in {"candidate", "needs_review"} for item in negative_results)
    finally:
        doc.close()


def test_input_routing_handles_pdf_raster_and_fails_closed_for_dwg(monkeypatch):
    from app.drawing_intelligence.ingestion import CadConversionUnavailable, detect_input_kind, prepare_pdf_bytes

    pdf = _synthetic_pdf()
    assert detect_input_kind("drawing.pdf", pdf) == "pdf"
    prepared, kind, warnings = prepare_pdf_bytes(pdf, "drawing.pdf")
    assert kind == "pdf" and prepared == pdf and warnings == []

    source = fitz.open(stream=pdf, filetype="pdf")
    png = source[0].get_pixmap(alpha=False).tobytes("png")
    source.close()
    raster_pdf, kind, warnings = prepare_pdf_bytes(png, "scan.png")
    assert kind == "png" and raster_pdf.startswith(b"%PDF-") and warnings

    monkeypatch.delenv("PAAX_CAD_TO_PDF_COMMAND_JSON", raising=False)
    try:
        prepare_pdf_bytes(b"AC1032 synthetic", "drawing.dwg")
    except CadConversionUnavailable:
        pass
    else:
        raise AssertionError("DWG without a configured converter must fail closed")


def test_raster_fallback_maps_local_ocr_to_normalized_coordinates(monkeypatch):
    from types import SimpleNamespace
    from app.drawing_intelligence.raster_fallback import extract_raster_tokens

    def fake_ocr(_path: str, page: int):
        span = SimpleNamespace(text="K1", bbox=(10.0, 20.0, 110.0, 70.0), confidence=0.81)
        return SimpleNamespace(available=True, spans=[span], message="")

    monkeypatch.setattr("app.drawing_intelligence.raster_fallback.extract_spans_via_ocr", fake_ocr)
    document = fitz.open(stream=_synthetic_pdf(), filetype="pdf")
    try:
        tokens, warnings = extract_raster_tokens(document[0], 0, [], dpi=72)
    finally:
        document.close()
    assert warnings == []
    assert len(tokens) == 1
    assert tokens[0].source == "ocr"
    assert tokens[0].bbox.space == "normalized"
    assert 0 <= tokens[0].bbox.x0 < tokens[0].bbox.x1 <= 1


def test_full_plhut_88_page_benchmark_passes():
    from app.drawing_intelligence.benchmark import run_plhut_benchmark

    repo_root = Path(__file__).resolve().parents[3]
    pdf = repo_root / "GAMBAR KERJA PLHUT SURAKARTA (1).pdf"
    dem = repo_root / "dem_extraction_88pages" / "pages"
    if not pdf.is_file() or len(list(dem.glob("page-*.json"))) != 88:
        return
    analysis, score = run_plhut_benchmark(pdf, dem)
    assert analysis.metrics["ai_provider_calls"] == 0
    assert score["status"] == "PASS", [item for item in score["checks"] if not item["passed"]]
    assert score["passed"] == score["total"] == 20


def test_sheet_level_prefers_title_over_unrelated_roof_note():
    from app.drawing_intelligence.sheet_identity import build_sheet_semantics

    dem_page = {
        "sheet_identity": {
            "title": {"value": "DENAH PINTU DAN JENDELA LANTAI 2", "evidence_refs": ["ev-title"]},
            "discipline": {"value": "architecture"},
        }
    }
    semantics = build_sheet_semantics(44, native_text="DETAIL ATAP\nCATATAN UMUM", dem_page=dem_page)
    assert semantics.drawing_type == "door_window_plan"
    assert semantics.level == "L2"


def test_evidence_repair_links_only_existing_unambiguous_evidence():
    from app.drawing_intelligence.evidence_repair import repair_dem_evidence_refs

    page = {
        "source": {"width_px": 1000, "height_px": 1000},
        "evidence": [
            {"evidence_id": "ev-k2", "raw": "K2", "bbox": [100, 100, 140, 140]},
            {"evidence_id": "ev-note", "raw": "CATATAN", "bbox": [500, 500, 650, 540]},
        ],
        "observations": {
            "element_labels": [
                {"raw": "K2", "normalized": "K2", "bbox": [100, 100, 140, 140], "evidence_refs": []},
                {"raw": "UNKNOWN", "normalized": "UNKNOWN", "bbox": [800, 800, 840, 840], "evidence_refs": []},
            ]
        },
    }
    repaired, stats = repair_dem_evidence_refs(page)
    assert stats.observations == 2
    assert stats.repaired == 1
    assert stats.unresolved == 1
    assert repaired["observations"]["element_labels"][0]["evidence_refs"] == ["ev-k2"]
    assert repaired["observations"]["element_labels"][1]["evidence_refs"] == []
    assert len(repaired["evidence"]) == 2  # no evidence object was fabricated


def test_user_delivery_keeps_observed_counts_separate_from_acceptance():
    from app.drawing_intelligence.delivery import build_user_delivery

    analysis = analyze_drawing_package(_synthetic_pdf(), document_name="synthetic.pdf", mode="deep")
    payload = build_user_delivery(analysis)
    k1 = next(item for item in payload["work_item_candidates"] if item["code"] == "K1")
    assert k1["observed_label_count"] == 2
    assert k1["count_semantics"] == "drawing_label_observation"
    assert k1["user_accepted"] is False
    assert payload["accepted_work_items"] == []
    assert payload["safety"]["physical_counts_auto_accepted"] is False
    assert payload["safety"]["final_quantities_calculated"] is False


def test_specific_mep_titles_refine_broad_dem_discipline():
    from app.drawing_intelligence.sheet_identity import build_sheet_semantics

    examples = [
        ("DENAH TITIK LAMPU LANTAI 2", "electrical"),
        ("DENAH INSTALASI AC LT.1", "mechanical"),
        ("DENAH AIR KOTOR LT 1", "plumbing"),
        ("DENAH SALURAN AIR HUJAN", "plumbing"),
    ]
    for title, expected in examples:
        semantics = build_sheet_semantics(
            0,
            native_text=title,
            dem_page={"sheet_identity": {"title": {"value": title}, "discipline": {"value": "mep"}}},
        )
        assert semantics.discipline == expected


def test_cover_and_explicit_detail_titles_override_incidental_view_words():
    from app.drawing_intelligence.sheet_identity import build_sheet_semantics, classify_drawing_type

    cover = build_sheet_semantics(
        0,
        native_text="GAMBAR KERJA\nTAMPAK DEPAN GEDUNG\nTAHUN ANGGARAN 2024",
        dem_page={"sheet_identity": {"title": {"value": "Tampak Depan Gedung"}, "discipline": {"value": "architecture"}}},
    )
    assert cover.drawing_type == "cover"
    assert cover.title == "GAMBAR KERJA"
    assert classify_drawing_type("DETAIL SHOPSIGN TAMPAK DEPAN") == "detail"
    assert classify_drawing_type("DETAIL PENANGKAL PETIR DAN GROUNDING") == "detail"


def test_native_pdf_bridge_uses_real_token_ids_and_leaves_ambiguity_unlinked():
    from app.drawing_intelligence.evidence_repair import bridge_dem_refs_to_native_tokens
    from app.drawing_intelligence.models import BBox, TextToken

    token = TextToken(
        token_id="p0-w00001", page_index=0, text="K2", normalized="K2",
        bbox=BBox(x0=0.1, y0=0.1, x1=0.14, y1=0.14, space="normalized"),
        block_no=0, line_no=0, word_no=0, source="native_pdf", confidence=1.0,
    )
    page = {
        "source": {"width_px": 1000, "height_px": 1000},
        "evidence": [],
        "observations": {"element_labels": [
            {"raw": "K2", "bbox": [100, 100, 140, 140], "evidence_refs": []},
            {"raw": "NO MATCH", "bbox": [700, 700, 800, 750], "evidence_refs": []},
        ]},
    }
    bridged, stats = bridge_dem_refs_to_native_tokens(page, [token])
    rows = bridged["observations"]["element_labels"]
    assert rows[0]["evidence_refs"] == ["native:p0-w00001"]
    assert rows[1]["evidence_refs"] == []
    assert stats.repaired == 1 and stats.unresolved == 1


def test_generic_sheet_identity_supports_arbitrary_buildings_and_levels():
    from app.drawing_intelligence.sheet_identity import build_sheet_semantics, infer_level
    from app.drawing_intelligence.taxonomy import level_display_name

    hospital = build_sheet_semantics(
        0,
        native_text=(
            "PROJECT NAME\nHOSPITAL TOWER EAST\nDRAWING TITLE\n"
            "LEVEL 12 COLUMN PLAN\nSCALE 1:100"
        ),
        dem_page={
            "sheet_identity": {
                "title": {"value": "PROJECT NAME HOSPITAL TOWER EAST"},
                "discipline": {"value": "structural"},
            },
            "views": [{"title": "LEVEL 12 COLUMN PLAN"}],
        },
    )
    assert hospital.title == "LEVEL 12 COLUMN PLAN"
    assert hospital.drawing_type == "column_plan"
    assert hospital.level == "L12"
    assert level_display_name(hospital.level) == "Lantai 12"

    assert infer_level("BASEMENT 3 PARKING PLAN") == "B3"
    assert level_display_name("B3") == "Basement 3"
    assert infer_level("MEZZANINE FLOOR PLAN") == "mezzanine"
    assert infer_level("UNSPECIFIED PLAN") is None


def test_generic_sheet_identity_does_not_use_plhut_or_city_names_as_rules():
    from pathlib import Path

    source = Path(__file__).resolve().parents[1] / "app" / "drawing_intelligence" / "sheet_identity.py"
    text = source.read_text(encoding="utf-8")
    forbidden_runtime_markers = (
        "PLHUT-SURAKARTA",
        "GEDUNG PUSAT LAYANAN",
        "KEMENTERIAN AGAMA",
    )
    assert all(marker not in text for marker in forbidden_runtime_markers)


def test_generic_sheet_identity_supports_bridge_and_road_drawings():
    from app.drawing_intelligence.sheet_identity import build_sheet_semantics
    from app.drawing_intelligence.taxonomy import level_display_name

    bridge = build_sheet_semantics(
        0,
        native_text="PROJECT NAME\nRIVER BRIDGE\nBRIDGE GENERAL ARRANGEMENT\nABUTMENT A1",
        dem_page={"sheet_identity": {"title": {"value": "BRIDGE GENERAL ARRANGEMENT - ABUTMENT A1"}, "discipline": {"value": "structural"}}},
    )
    assert bridge.drawing_type == "bridge_plan"
    assert bridge.discipline == "structure"
    assert bridge.level == "substructure"
    assert level_display_name(bridge.level) == "Substruktur"

    road = build_sheet_semantics(
        1,
        native_text="ROAD PLAN AND PROFILE\nSTA 0+000 - STA 1+000\nSCALE 1:1000",
        dem_page={"sheet_identity": {"title": {"value": "ROAD PLAN AND PROFILE"}, "discipline": {"value": "civil"}}},
    )
    assert road.drawing_type == "road_plan_profile"
    assert road.discipline == "civil"
    assert road.level == "alignment"
    assert level_display_name(road.level) == "Trase/Alignment"


def test_generic_sheet_identity_supports_cross_sections_and_reinforcement_details():
    from app.drawing_intelligence.sheet_identity import build_sheet_semantics

    cross = build_sheet_semantics(
        2,
        native_text="TYPICAL CROSS SECTION ROAD STA 2+500",
        dem_page={"sheet_identity": {"title": {"value": "TYPICAL CROSS SECTION ROAD"}, "discipline": {"value": "civil"}}},
    )
    assert cross.drawing_type == "cross_section"
    assert cross.discipline == "civil"

    rebar = build_sheet_semantics(
        3,
        native_text="PIER P2 REINFORCEMENT DETAIL",
        dem_page={"sheet_identity": {"title": {"value": "PIER P2 REINFORCEMENT DETAIL"}, "discipline": {"value": "structural"}}},
    )
    assert rebar.drawing_type == "reinforcement_detail"
    assert rebar.discipline == "structure"
    assert rebar.level == "substructure"
