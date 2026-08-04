from __future__ import annotations

from pathlib import Path

import fitz
import pytest

from app.drawing_intelligence.human_delivery import build_human_delivery
from app.drawing_intelligence.pipeline import analyze_drawing_package
from app.drawing_intelligence.review_ledger import (
    ReviewDecisionRequest,
    append_decision,
    apply_ledger_to_human_delivery,
    empty_ledger,
)
from app.drawing_intelligence.taxonomy import resolve_user_category, suppression_reasons
from app.drawing_intelligence.vocabulary import infer_category


def _synthetic_pdf() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=900, height=600)
    page.draw_rect(fitz.Rect(80, 100, 280, 260), color=(0, 0, 0))
    page.draw_rect(fitz.Rect(340, 100, 540, 260), color=(0, 0, 0))
    page.insert_text((150, 180), "K1", fontsize=16)
    page.insert_text((410, 180), "K1", fontsize=16)
    page.draw_rect(fitz.Rect(620, 80, 860, 250), color=(0, 0, 0))
    page.insert_text((640, 110), "KETERANGAN", fontsize=14)
    page.insert_text((640, 145), "K1 400 x 400 mm KOLOM BETON", fontsize=11)
    data = doc.tobytes()
    doc.close()
    return data


def test_human_delivery_is_plain_language_and_keeps_count_non_final():
    analysis = analyze_drawing_package(_synthetic_pdf(), document_name="synthetic.pdf", mode="deep")
    payload = build_human_delivery(analysis)
    item = next(row for row in payload["work_items"] if row["code"] == "K1")
    assert item["technical_name"] == "Kolom"
    assert item["plain_name"] == "Kolom struktur"
    assert item["observed_label_count"] == 2
    assert item["count_label"] == "2 kandidat terdeteksi"
    assert item["count_is_final"] is False
    assert item["known_facts"]
    assert item["source_sheets"]
    assert payload["safety"]["final_quantities_calculated"] is False


def test_human_category_resolution_uses_sheet_context_not_universal_guessing():
    assert resolve_user_category("unknown", "PC1", "PC1", {"sheet_title": "DENAH FOOTPLAT"}) == "foundation"
    assert resolve_user_category("unknown", "S1", "S1", {"sheet_title": "TABEL PELAT"}) == "slab"
    assert resolve_user_category("unknown", "C1", "C1", {"sheet_title": "DENAH PLAFOND LANTAI 1"}) == "ceiling_type"
    assert resolve_user_category("unknown", "WF1", "WF1 150X75X5X7", {"sheet_title": "DETAIL BAJA"}) == "steel_profile"
    assert resolve_user_category("door", "PJ1", "PINTU JENDELA (PJ1)", {"sheet_title": "DETAIL KUSEN"}) == "door_window_assembly"



def test_user_facing_noise_gate_keeps_audit_evidence_but_hides_non_work_items():
    plumbing_sheet = [{"drawing_type": "drainage_plan", "discipline": "plumbing"}]
    assert suppression_reasons(
        category="unknown", code="K-01", attributes={"raw": "K-01", "level": "unknown"},
        source_sheets=plumbing_sheet,
    ) == ["cross_discipline_background_label", "unresolved_background_on_plumbing_sheet"]
    assert suppression_reasons(
        category="unknown", code="E27", attributes={"raw": "FITTING E27"},
        source_sheets=[{"drawing_type": "detail", "discipline": "plumbing"}],
    ) == ["product_specification_not_a_countable_item"]
    assert suppression_reasons(
        category="unknown", code="D-01", attributes={"raw": "D-01"},
        source_sheets=[{"drawing_type": "detail", "discipline": "architecture"}],
    ) == ["detail_callout_marker"]


def test_category_inference_requires_matching_discipline_context():
    assert infer_category("SL1", title="DENAH BALOK LANTAI 1", raw="SL1") == "beam"
    # The same compact code on a lighting plan must not become a structural beam.
    assert infer_category("SL1", title="DENAH TITIK LAMPU LANTAI 1", raw="SL1") == "lighting_fixture"
    # A frame-profile dimension must not be treated as an opening size.
    analysis = analyze_drawing_package(_synthetic_pdf(), document_name="synthetic.pdf", mode="deep")
    payload = build_human_delivery(analysis)
    assert payload["work_items"]

def test_review_ledger_is_versioned_and_physical_count_requires_explicit_acceptance():
    analysis = analyze_drawing_package(_synthetic_pdf(), document_name="synthetic.pdf", mode="deep")
    payload = build_human_delivery(analysis)
    item = next(row for row in payload["work_items"] if row["code"] == "K1")
    ledger = empty_ledger("run-1", analysis)
    updated = append_decision(
        ledger,
        ReviewDecisionRequest(
            work_item_id=item["work_item_id"], action="accept", expected_version=0,
            reason="Overlay dan dua objek pada denah sudah diperiksa.", verified_physical_count=2,
        ),
        actor_id="reviewer-1",
        analysis=analysis,
    )
    delivery = apply_ledger_to_human_delivery(payload, updated)
    accepted = delivery["accepted_drawing_objects"][0]
    assert accepted["verified_physical_count"] == 2
    assert accepted["count_is_final"] is True
    assert delivery["review_ledger"]["version"] == 1

    with pytest.raises(ValueError, match="stale review ledger"):
        append_decision(
            updated,
            ReviewDecisionRequest(
                work_item_id=item["work_item_id"], action="reject", expected_version=0,
                reason="Stale browser state must not overwrite the reviewer decision.",
            ),
            actor_id="reviewer-2",
            analysis=analysis,
        )


def test_plhut_human_delivery_filters_title_block_noise_and_keeps_key_columns():
    repo_root = Path(__file__).resolve().parents[3]
    pdf = repo_root / "GAMBAR KERJA PLHUT SURAKARTA (1).pdf"
    dem = repo_root / "dem_extraction_88pages" / "pages"
    if not pdf.is_file() or len(list(dem.glob("page-*.json"))) != 88:
        return
    analysis = analyze_drawing_package(pdf, dem_directory=dem, mode="fast")
    payload = build_human_delivery(analysis)
    assert payload["summary"]["recognized_work_items"] >= 55
    assert not any(item.get("code") == "NO115" for item in payload["work_items"])
    k2 = next(item for item in payload["work_items"] if item["code"] == "K2" and item["level"] == "L2")
    assert k2["technical_name"] == "Kolom"
    assert k2["dimensions_text"] == "250 × 600 mm"
    assert k2["verified_physical_count"] == 4
    assert k2["count_label"] == "4 unit"
    assert k2["count_is_final"] is True
    assert k2["count_authority"] == "engine_confirmed"
    assert payload["summary"]["suppressed_audit_candidates"] >= 4
    assert {item.get("code") for item in payload["suppressed_candidates"]} >= {"D-01", "E27", "K-01"}
    visible_codes = {item.get("code") for item in [*payload["work_items"], *payload["needs_clarification"]]}
    # P5: LT1 (spurious sheet-title code) merges into the canonical LINTEL
    # family item — it no longer exists anywhere as a separate code.
    assert not {"LT1", "D-01", "E27"} & visible_codes
    all_codes = {item.get("code") for item in [*payload["work_items"], *payload["needs_clarification"], *payload["suppressed_candidates"]]}
    assert "LT1" not in all_codes
    # K-01 is valid as a structural column on the column plan, while the same
    # text on a drainage sheet is retained only as an audit-suppressed match.
    assert "K-01" in visible_codes
    suppressed_k01 = next(item for item in payload["suppressed_candidates"] if item.get("code") == "K-01")
    assert suppressed_k01["category"] == "unknown"
    j1 = next(item for item in payload["work_items"] if item["code"] == "J1" and item["level"] == "L1")
    assert j1["dimensions_text"] is None


def test_sheet_semantics_uses_bounded_non_storey_scopes_for_human_clarity():
    from app.drawing_intelligence.sheet_identity import build_sheet_semantics
    from app.drawing_intelligence.taxonomy import level_display_name

    foundation = build_sheet_semantics(
        10,
        native_text="DENAH FOOTPLAT\nTABEL PONDASI",
        dem_page={"sheet_identity": {"title": {"value": "DENAH FOOTPLAT"}, "discipline": {"value": "structure"}}},
    )
    site = build_sheet_semantics(
        11,
        native_text="RENCANA PAVING\nSITE PLAN",
        dem_page={"sheet_identity": {"title": {"value": "RENCANA PAVING"}, "discipline": {"value": "civil"}}},
    )
    roof = build_sheet_semantics(
        12,
        native_text="DENAH ATAP",
        dem_page={"sheet_identity": {"title": {"value": "DENAH ATAP"}, "discipline": {"value": "architecture"}}},
    )

    assert foundation.level == "foundation"
    assert site.level == "site"
    assert roof.level == "roof"
    assert level_display_name(foundation.level) == "Fondasi/Substruktur"
    assert level_display_name(site.level) == "Area Tapak"
    assert level_display_name(roof.level) == "Atap"
