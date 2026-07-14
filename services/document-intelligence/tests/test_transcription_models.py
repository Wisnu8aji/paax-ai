from __future__ import annotations

from app.transcription.models import (
    ContinuationPatch,
    DemGeneration,
    DemObservations,
    DemSource,
    DocumentManifest,
    DrawingEvidenceSheet,
    EvidenceItem,
    InterpretedValue,
    ObservationValue,
    PageManifestEntry,
    ScaleCandidate,
    SheetCompletion,
    SheetIdentity,
    SheetView,
    ValueWithEvidence,
)


def test_drawing_evidence_sheet_accepts_minimal_valid_payload():
    sheet = DrawingEvidenceSheet(
        schema_version="paax.dem.sheet.v1",
        run_id="DEMRUN-20260714-001",
        document_id="DOC-PLHUT-001",
        project_id="PRJ-001",
        source=DemSource(
            document_hash="sha256:abc123",
            file_name="GAMBAR KERJA PLHUT SURAKARTA (1).pdf",
            page_index=5,
            page_number=6,
            render_uri="object://renders/doc-plhut-001/page-006.png",
            width_px=4096,
            height_px=2896,
        ),
        generation=DemGeneration(
            provider="qwen",
            model_alias="qwen-3.7-plus",
            prompt_version="dem-extraction-v1.0.0",
            started_at="2026-07-14T10:00:00Z",
            completed_at="2026-07-14T10:00:12Z",
            continuation_count=0,
            temperature=0.0,
            status="complete",
        ),
        sheet_identity=SheetIdentity(
            sheet_number=ValueWithEvidence(value="A-06", raw="A-06", confidence=0.98, evidence_refs=["EV-P006-001"]),
            title=ValueWithEvidence(value="Rencana Paving", raw="RENCANA PAVING", confidence=0.99, evidence_refs=["EV-P006-002"]),
            discipline=InterpretedValue(value="architecture", confidence=0.88, status="ai_interpreted"),
            scale_candidates=[ScaleCandidate(raw="1 : 100", normalized="1:100", confidence=0.94, evidence_refs=["EV-P006-003"])],
        ),
        views=[SheetView(view_id="VIEW-P006-01", type="site_plan", title="Rencana Paving", bbox=(0.08, 0.12, 0.84, 0.91), confidence=0.91)],
        observations=DemObservations(
            texts=[ObservationValue(raw="R.PLHUT", normalized="Ruang PLHUT", confidence=0.9, evidence_refs=["EV-P006-004"])],
            dimensions=[ObservationValue(raw="20400", normalized="20400", numeric_value=20400.0, unit="mm", confidence=0.86, evidence_refs=["EV-P006-005"])],
        ),
        evidence=[
            EvidenceItem(evidence_id="EV-P006-001", kind="visible_text", raw="A-06", bbox=(0.91, 0.88, 0.96, 0.92), confidence=0.98),
        ],
        completion=SheetCompletion(sections_expected=13, sections_completed=13, is_complete=True, next_cursor=None),
    )

    assert sheet.source.page_number == 6
    assert sheet.sheet_identity.discipline.status == "ai_interpreted"
    assert sheet.observations.dimensions[0].numeric_value == 20400.0
    assert sheet.completion.is_complete is True
    # DEM never computes derived numbers - dimensions carry only the raw/normalized
    # value read from the sheet, no cross-sheet or calculated fields exist on the model.
    assert not hasattr(sheet.observations.dimensions[0], "cross_section_area_mm2")


def test_drawing_evidence_sheet_defaults_empty_observation_lists():
    sheet = DrawingEvidenceSheet(
        schema_version="paax.dem.sheet.v1",
        run_id="DEMRUN-20260714-002",
        document_id="DOC-PLHUT-001",
        project_id="PRJ-001",
        source=DemSource(
            document_hash="sha256:abc123",
            file_name="GAMBAR KERJA PLHUT SURAKARTA (1).pdf",
            page_index=0,
            page_number=1,
            render_uri="object://renders/doc-plhut-001/page-001.png",
            width_px=4096,
            height_px=2896,
        ),
        generation=DemGeneration(
            provider="qwen",
            model_alias="qwen-3.7-plus",
            prompt_version="dem-extraction-v1.0.0",
            started_at="2026-07-14T10:00:00Z",
            completed_at="2026-07-14T10:00:05Z",
            continuation_count=0,
            temperature=0.0,
            status="complete",
        ),
        sheet_identity=SheetIdentity(
            sheet_number=ValueWithEvidence(value="", confidence=0.0),
            title=ValueWithEvidence(value="GAMBAR KERJA", confidence=0.95),
            discipline=InterpretedValue(value="cover", confidence=0.9, status="ai_interpreted"),
        ),
        completion=SheetCompletion(sections_expected=13, sections_completed=13, is_complete=True, next_cursor=None),
    )

    assert sheet.observations.texts == []
    assert sheet.views == []
    assert sheet.evidence == []
    assert sheet.ambiguities == []
    assert sheet.conflicts == []
    assert sheet.unclassified == []


def test_document_manifest_tracks_page_status_and_resume_state():
    manifest = DocumentManifest(
        document_id="DOC-PLHUT-001",
        document_hash="sha256:abc123",
        total_pages=88,
        pages=[
            PageManifestEntry(page_index=0, status="complete", attempt_count=1, input_hash="sha256:page0hash"),
            PageManifestEntry(page_index=1, status="complete", attempt_count=1, input_hash="sha256:page1hash"),
            PageManifestEntry(page_index=46, status="failed", attempt_count=3, input_hash="sha256:page46hash", error="timeout after 30s"),
            PageManifestEntry(page_index=47, status="queued", attempt_count=0, input_hash=None),
        ],
    )

    complete_pages = [p for p in manifest.pages if p.status == "complete"]
    assert len(complete_pages) == 2
    failed = next(p for p in manifest.pages if p.page_index == 46)
    assert failed.error == "timeout after 30s"
    assert failed.attempt_count == 3


def test_continuation_patch_carries_base_hash_and_cursor():
    patch = ContinuationPatch(
        schema_version="paax.dem.patch.v1",
        run_id="DEMRUN-20260714-001",
        page_index=5,
        base_result_hash="sha256:previousresulthash",
        cursor="grids:0",
        append={"grids": [], "levels": [], "spaces": []},
        is_complete=False,
        next_cursor="element_labels:0",
    )

    assert patch.base_result_hash == "sha256:previousresulthash"
    assert patch.is_complete is False
    assert patch.next_cursor == "element_labels:0"
