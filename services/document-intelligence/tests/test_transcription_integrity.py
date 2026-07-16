from __future__ import annotations

from pathlib import Path

from app.project_graph.page_patch import build_sheet_patch
from app.project_graph.synthesis import synthesize_project_graph
from app.transcription.integrity import build_integrity_report
from app.transcription.models import (
    DemGeneration,
    DemObservations,
    DemSource,
    DrawingEvidenceSheet,
    EvidenceItem,
    InterpretedValue,
    ObservationValue,
    SheetCompletion,
    SheetIdentity,
    SheetView,
    ValueWithEvidence,
)


FIXTURE_DIR = (
    Path(__file__).resolve().parents[3]
    / "report"
    / "report_drawing_intelligence"
    / "dem_extraction_88pages"
    / "pages"
)


def _sheet(
    *,
    observations: DemObservations | None = None,
    evidence: list[EvidenceItem] | None = None,
    views: list[SheetView] | None = None,
    completion: SheetCompletion | None = None,
) -> DrawingEvidenceSheet:
    return DrawingEvidenceSheet(
        run_id="RUN-INTEGRITY",
        document_id="DOC-INTEGRITY",
        project_id="PROJECT-INTEGRITY",
        source=DemSource(
            document_hash="hash",
            file_name="sheet.pdf",
            page_index=7,
            page_number=8,
            render_uri="memory://sheet",
            width_px=1000,
            height_px=700,
        ),
        generation=DemGeneration(
            provider="test",
            model_alias="test",
            prompt_version="test-v1",
            started_at="2026-07-16T00:00:00Z",
        ),
        sheet_identity=SheetIdentity(
            sheet_number=ValueWithEvidence(value="A-08", confidence=0.9),
            title=ValueWithEvidence(value="Integrity Test", confidence=0.9),
            discipline=InterpretedValue(value="structure", confidence=0.9),
        ),
        views=views or [],
        observations=observations or DemObservations(),
        evidence=evidence or [],
        completion=completion
        or SheetCompletion(sections_expected=1, sections_completed=1, is_complete=True),
    )


def test_integrity_report_classifies_bbox_refs_duplicates_and_completion_without_mutating_sheet():
    sheet = _sheet(
        views=[
            SheetView(
                view_id="VIEW-1",
                type="plan",
                title="Plan",
                bbox=(10.0, 10.0, 100.0, 100.0),
                confidence=0.9,
            ),
            SheetView(
                view_id="VIEW-2",
                type="detail",
                title="Detail",
                bbox=(10.0, 20.0, 300.0, 400.0),
                confidence=0.9,
            ),
        ],
        evidence=[
            EvidenceItem(evidence_id="EV-DUP", kind="text", raw="one", confidence=0.9),
            EvidenceItem(evidence_id="EV-DUP", kind="text", raw="two", confidence=0.9),
        ],
        observations=DemObservations(
            texts=[
                ObservationValue(
                    raw="FULL",
                    bbox=(0.1, 0.1, 0.2, 0.2),
                    confidence=0.9,
                    evidence_refs=["EV-MISSING"],
                ),
                ObservationValue(
                    raw="PARTIAL",
                    bbox=(10.0, 10.0, 20.0, 20.0),
                    confidence=0.9,
                    evidence_refs=["EV-DUP", "EV-MISSING-2"],
                ),
            ]
        ),
        completion=SheetCompletion(
            sections_expected=2,
            sections_completed=1,
            is_complete=True,
        ),
    )
    before = sheet.model_dump(mode="json")

    report = build_integrity_report(sheet)

    assert report.page_index == 7
    assert report.sheet_id == "A-08"
    assert report.coordinate_space == "pixel_like"
    assert report.counts.total_bbox == 4
    assert report.counts.out_of_contract_bbox == 3
    assert report.counts.dangling_refs == 2
    assert report.counts.duplicate_evidence_ids == 1
    assert report.counts.quarantined_observation_count == 1
    assert [item.raw for item in report.quarantined_observations] == ["FULL"]
    assert [item.raw for item in report.flagged_observations] == ["PARTIAL"]
    assert report.completion_consistent is False
    assert sheet.model_dump(mode="json") == before


def test_real_fixture_integrity_anchors_are_explicit():
    sheets = [
        DrawingEvidenceSheet.model_validate_json(path.read_text(encoding="utf-8"))
        for path in sorted(FIXTURE_DIR.glob("page-*.json"))
    ]
    reports = [build_integrity_report(sheet) for sheet in sheets]

    assert len(reports) == 88
    assert sum(report.counts.total_bbox for report in reports) == 7004
    assert sum(report.counts.out_of_contract_bbox for report in reports) == 6904
    assert sum(report.counts.dangling_refs for report in reports) == 839
    assert sum(report.counts.duplicate_evidence_ids for report in reports) == 33
    assert len([report for report in reports if "no_evidence" in report.notes]) == 15
    # The committed fixture stores the mismatch in page-0042.json with
    # source.page_index=42 and source.page_number=43; this is one page later
    # than the A4 note's human page/index label, so the assertion follows the
    # actual DEM source metadata rather than inventing a false result.
    assert reports[42].completion_consistent is False


def test_full_and_partial_dangling_observations_are_gated_at_patch_consumption():
    sheet = _sheet(
        evidence=[EvidenceItem(evidence_id="EV-VALID", kind="text", raw="valid", confidence=1.0)],
        observations=DemObservations(
            texts=[
                ObservationValue(raw="FULL", confidence=0.9, evidence_refs=["EV-MISSING"]),
                ObservationValue(
                    raw="PARTIAL",
                    confidence=0.9,
                    evidence_refs=["EV-VALID", "EV-MISSING-2"],
                ),
                ObservationValue(raw="VALID", confidence=0.9, evidence_refs=["EV-VALID"]),
            ]
        ),
    )
    report = build_integrity_report(sheet)

    patch = build_sheet_patch(sheet, report)
    result = synthesize_project_graph([sheet])

    assert not any(node.canonical_name == "FULL" for node in patch.nodes)
    partial = next(node for node in patch.nodes if node.canonical_name == "PARTIAL")
    assert partial.verification_status == "ambiguous"
    assert any(node.canonical_name == "VALID" for node in patch.nodes)
    assert any("integrity: dangling evidence" in item for item in result.snapshot.missing_information)
