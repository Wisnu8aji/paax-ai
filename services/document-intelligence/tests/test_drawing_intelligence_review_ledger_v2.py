from __future__ import annotations

import fitz
import pytest

from app.drawing_intelligence.human_delivery import build_human_delivery
from app.drawing_intelligence.models import DrawingConflict, SourceValue
from app.drawing_intelligence.pipeline import analyze_drawing_package
from app.drawing_intelligence.review_ledger import (
    ReviewDecisionRequest,
    append_decision,
    apply_ledger_to_human_delivery,
    empty_ledger,
)


def _pdf() -> bytes:
    doc = fitz.open()
    plan = doc.new_page(width=900, height=600)
    plan.insert_text((80, 55), "DENAH KOLOM LANTAI 2", fontsize=16)
    plan.draw_rect(fitz.Rect(80, 100, 280, 260), color=(0, 0, 0))
    plan.draw_rect(fitz.Rect(340, 100, 540, 260), color=(0, 0, 0))
    plan.insert_text((150, 180), "K1", fontsize=16)
    plan.insert_text((410, 180), "K1", fontsize=16)
    schedule = doc.new_page(width=900, height=600)
    schedule.insert_text((80, 55), "TABEL KOLOM", fontsize=16)
    schedule.draw_rect(fitz.Rect(80, 80, 500, 250), color=(0, 0, 0))
    schedule.insert_text((100, 145), "K1 200 x 200 mm", fontsize=11)
    data = doc.tobytes()
    doc.close()
    return data


def _analysis_with_two_conflicts():
    analysis = analyze_drawing_package(_pdf(), document_name="conflict.pdf", mode="deep")
    item = next(value for value in analysis.work_items if value.code == "K1")
    dimension_conflict = DrawingConflict(
        conflict_id="conf-dim-k1",
        work_item_id=item.work_item_id,
        field="dimensions",
        title="Ukuran kolom K1 berbeda antarlembar",
        explanation="Mayoritas lembar menunjukkan 200 × 200 mm, halaman 45 menunjukkan 200 × 300 mm.",
        source_values=[
            SourceValue(
                value_id="dim-majority", field="dimensions", value={"width": 200, "depth": 200},
                unit="mm", page_index=1, sheet_title="TABEL KOLOM", evidence_refs=["ev-dim-200"],
                source_channel="schedule", confidence=0.99, authority_rank=90,
            ),
            SourceValue(
                value_id="dim-page45", field="dimensions", value={"width": 200, "depth": 300},
                unit="mm", page_index=0, sheet_title="DETAIL KOLOM HALAMAN 45", evidence_refs=["ev-dim-300"],
                source_channel="native_pdf", confidence=0.92, authority_rank=80,
            ),
        ],
        affected_page_indices=[0, 1],
    )
    count_conflict = DrawingConflict(
        conflict_id="conf-count-k1",
        work_item_id=item.work_item_id,
        field="count",
        title="Jumlah kolom K1 berbeda antarhasil deteksi",
        explanation="Lembar denah dan hasil rekonstruksi belum konsisten.",
        source_values=[
            SourceValue(
                value_id="count-vector", field="count", value=8, unit="unit", page_index=0,
                sheet_title="DENAH KOLOM LANTAI 2", evidence_refs=["ev-count-vector"],
                source_channel="native_pdf", confidence=0.99, authority_rank=100,
            ),
            SourceValue(
                value_id="count-dem", field="count", value=12, unit="unit", page_index=0,
                sheet_title="DENAH KOLOM LANTAI 2", evidence_refs=["ev-count-dem"],
                source_channel="dem", confidence=0.75, authority_rank=40,
            ),
        ],
        affected_page_indices=[0],
    )
    updated_items = [
        value.model_copy(update={"conflict_ids": ["conf-dim-k1", "conf-count-k1"]})
        if value.work_item_id == item.work_item_id else value
        for value in analysis.work_items
    ]
    return analysis.model_copy(update={
        "work_items": updated_items,
        "conflicts": [dimension_conflict, count_conflict],
    }), item.work_item_id


def test_review_ledger_replays_multiple_conflict_decisions_without_losing_the_first():
    analysis, item_id = _analysis_with_two_conflicts()
    payload = build_human_delivery(analysis)
    ledger = empty_ledger("run-review-v2", analysis)

    ledger = append_decision(
        ledger,
        ReviewDecisionRequest(
            work_item_id=item_id, action="resolve_conflict", expected_version=0,
            reason="Gunakan ukuran yang konsisten pada tabel kolom terotorisasi.",
            conflict_id="conf-dim-k1", selected_source_value_id="dim-majority",
        ),
        actor_id="reviewer-1", analysis=analysis,
    )
    ledger = append_decision(
        ledger,
        ReviewDecisionRequest(
            work_item_id=item_id, action="resolve_conflict", expected_version=1,
            reason="Gunakan jumlah hasil rekonstruksi vektor pada denah utama.",
            conflict_id="conf-count-k1", selected_source_value_id="count-vector",
        ),
        actor_id="reviewer-1", analysis=analysis,
    )

    resolved = apply_ledger_to_human_delivery(payload, ledger)
    item = next(value for value in [*resolved["work_items"], *resolved["needs_clarification"]] if value["work_item_id"] == item_id)
    assert item["dimensions_text"] == "200 × 200 mm"
    assert item["verified_physical_count"] == 8
    assert item["count_label"] == "8 unit"
    assert item["count_authority"] == "human_confirmed"
    assert item["conflict_status"] == "none"
    assert len(item["review_history"]) == 2
    assert {fact["field"] for fact in item["measurement_facts"]} >= {"width", "depth", "count"}
    assert resolved["review_ledger"]["version"] == 2
    assert len(resolved["review_ledger"]["all_events"]) == 2


def test_review_ledger_accepts_manual_dimension_correction_and_marks_all_source_pages():
    analysis, item_id = _analysis_with_two_conflicts()
    payload = build_human_delivery(analysis)
    item_before = next(value for value in [*payload["work_items"], *payload["needs_clarification"]] if value["work_item_id"] == item_id)
    conflict = next(value for value in item_before["conflicts"] if value["conflict_id"] == "conf-dim-k1")
    assert {page["page_index"] for page in conflict["affected_pages"]} == {0, 1}

    ledger = append_decision(
        empty_ledger("run-manual-dim", analysis),
        ReviewDecisionRequest(
            work_item_id=item_id, action="resolve_conflict", expected_version=0,
            reason="Ukuran terkoreksi berdasarkan revisi gambar terbaru.", conflict_id="conf-dim-k1",
            corrected_width=200, corrected_depth=250, corrected_dimension_unit="mm",
        ),
        actor_id="reviewer-2", analysis=analysis,
    )
    resolved = apply_ledger_to_human_delivery(payload, ledger)
    item = next(value for value in [*resolved["work_items"], *resolved["needs_clarification"]] if value["work_item_id"] == item_id)
    assert item["dimensions_text"] == "200 × 250 mm"
    assert next(value for value in item["conflicts"] if value["conflict_id"] == "conf-dim-k1")["status"] == "human_resolved"
    assert next(value for value in item["conflicts"] if value["conflict_id"] == "conf-count-k1")["status"] == "open"


def test_review_ledger_request_reupload_is_versioned_and_keeps_page_scope():
    analysis, item_id = _analysis_with_two_conflicts()
    payload = build_human_delivery(analysis)
    ledger = append_decision(
        empty_ledger("run-reupload", analysis),
        ReviewDecisionRequest(
            work_item_id=item_id, action="request_reupload", expected_version=0,
            reason="Halaman 45 tidak konsisten dengan revisi lain dan perlu diunggah ulang.",
            reupload_page_indices=[0],
        ),
        actor_id="reviewer-3", analysis=analysis,
    )
    resolved = apply_ledger_to_human_delivery(payload, ledger)
    item = next(value for value in [*resolved["work_items"], *resolved["needs_clarification"]] if value["work_item_id"] == item_id)
    assert item["status"] == "reupload_requested"
    assert item["reupload_page_indices"] == [0]
    with pytest.raises(ValueError, match="stale review ledger"):
        append_decision(
            ledger,
            ReviewDecisionRequest(
                work_item_id=item_id, action="accept", expected_version=0,
                reason="Versi lama tidak boleh menimpa keputusan terbaru.",
            ),
            actor_id="reviewer-4", analysis=analysis,
        )
