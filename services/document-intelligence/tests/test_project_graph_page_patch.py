from __future__ import annotations

from app.project_graph.page_patch import build_sheet_patch
from app.project_graph.synthesis_types import ModelUsage
from app.transcription.models import (
    DemGeneration,
    DemSource,
    DrawingEvidenceSheet,
    EvidenceItem,
    InterpretedValue,
    ObservationValue,
    SheetCompletion,
    SheetIdentity,
    ScaleCandidate,
    ValueWithEvidence,
)


def _sheet_with_every_observation_category() -> DrawingEvidenceSheet:
    observations = {
        category: [
            ObservationValue(
                raw=f"{category} fact",
                normalized=f"{category} normalized",
                confidence=0.8,
                evidence_refs=["EV-VALID", "EV-MISSING"],
            )
        ]
        for category in (
            "texts",
            "dimensions",
            "grids",
            "levels",
            "spaces",
            "element_labels",
            "symbols",
            "tables",
            "materials",
            "notes",
            "references",
            "patterns",
            "geometry_descriptions",
        )
    }
    return DrawingEvidenceSheet(
        run_id="RUN-001",
        document_id="DOC-001",
        project_id="PROJECT-001",
        source=DemSource(
            document_hash="hash",
            file_name="synthetic.pdf",
            page_index=2,
            page_number=3,
            render_uri="memory://sheet-3",
            width_px=1000,
            height_px=800,
        ),
        generation=DemGeneration(
            provider="test",
            model_alias="test-model",
            prompt_version="test-v1",
            started_at="2026-07-15T00:00:00Z",
        ),
        sheet_identity=SheetIdentity(
            sheet_number=ValueWithEvidence(
                value="S-03",
                confidence=0.9,
                evidence_refs=["EV-VALID", "EV-SHEET-MISSING"],
            ),
            title=ValueWithEvidence(value="Structural Plan", confidence=0.9),
            discipline=InterpretedValue(
                value="Struktur",
                confidence=0.9,
                status="ai_interpreted",
            ),
        ),
        observations=observations,
        evidence=[EvidenceItem(evidence_id="EV-VALID", kind="text", raw="present", confidence=1.0)],
        ambiguities=["grid label uncertain"],
        conflicts=["two level labels overlap"],
        unclassified=["unmapped callout"],
        completion=SheetCompletion(sections_expected=1, sections_completed=1, is_complete=True),
    )


def test_build_sheet_patch_preserves_all_facts_and_audits_missing_evidence():
    patch = build_sheet_patch(_sheet_with_every_observation_category())

    assert patch.sheet_id == "S-03"
    assert patch.discipline == "structure"
    assert {fact.category for fact in patch.facts} == {
        "sheet_identity",
        "discipline",
        "texts",
        "dimensions",
        "grids",
        "levels",
        "spaces",
        "element_labels",
        "symbols",
        "tables",
        "materials",
        "notes",
        "references",
        "patterns",
        "geometry_descriptions",
    }
    assert len(patch.facts) == 15
    assert patch.dangling_evidence_refs == ["EV-SHEET-MISSING", "EV-MISSING"]
    assert all(
        set(source_ref.evidence_refs) <= {"EV-VALID"}
        for node in patch.nodes
        for source_ref in node.source_refs
    )
    assert patch.conflicts == ["two level labels overlap"]
    assert patch.ambiguities == ["grid label uncertain"]
    assert patch.unclassified == ["unmapped callout"]
    assert "references fact" in patch.unresolved_references
    assert patch.edges
    assert patch.aliases


def test_model_usage_defaults_to_zero_tokens():
    usage = ModelUsage()

    assert usage.prompt_tokens == 0
    assert usage.completion_tokens == 0
    assert usage.cached_tokens == 0
    assert usage.reasoning_tokens == 0


def test_sheet_patch_preserves_completion_and_property_provenance():
    sheet = _sheet_with_every_observation_category()
    sheet.observations.notes[0].status = "ai_interpreted"

    patch = build_sheet_patch(sheet)

    assert patch.completion.sections_expected == 1
    assert patch.completion.sections_completed == 1
    assert patch.completion.is_complete is True
    note_node = next(
        node
        for node in patch.nodes
        if node.properties.get("category", None) and node.properties["category"].value == "notes"
    )
    assert note_node.properties["raw"].value_source == "ai_interpreted"
    assert note_node.properties["raw"].evidence_refs == ["EV-VALID"]


def test_sheet_identity_keeps_field_scoped_evidence_and_status():
    sheet = _sheet_with_every_observation_category()
    sheet.sheet_identity.sheet_number.evidence_refs = ["EV-SHEET"]
    sheet.sheet_identity.title.evidence_refs = ["EV-TITLE"]
    sheet.sheet_identity.scale_candidates = [
        ScaleCandidate(
            raw="1:100",
            normalized="1:100",
            confidence=0.8,
            evidence_refs=["EV-SCALE"],
        )
    ]
    sheet.evidence = [
        EvidenceItem(evidence_id=evidence_id, kind="text", raw=evidence_id, confidence=1.0)
        for evidence_id in ("EV-SHEET", "EV-TITLE", "EV-SCALE")
    ]

    patch = build_sheet_patch(sheet)

    sheet_node = next(node for node in patch.nodes if node.type == "sheet")
    identity_fact = next(fact for fact in patch.facts if fact.category == "sheet_identity")
    scale_fact = next(fact for fact in patch.facts if fact.category == "scale")
    discipline_fact = next(fact for fact in patch.facts if fact.category == "discipline")
    discipline_node = next(node for node in patch.nodes if node.type == "discipline")
    discipline_edge = next(edge for edge in patch.edges if edge.relation == "DEFINED_BY")

    assert sheet_node.properties["sheet_number"].evidence_refs == ["EV-SHEET"]
    assert sheet_node.properties["title"].evidence_refs == ["EV-TITLE"]
    assert identity_fact.status == "extracted"
    assert identity_fact.evidence_refs == ["EV-SHEET", "EV-TITLE", "EV-SCALE"]
    assert scale_fact.evidence_refs == ["EV-SCALE"]
    assert discipline_fact.status == "ai_interpreted"
    assert discipline_fact.evidence_refs == []
    assert discipline_node.verification_status == "ai_interpreted"
    assert sheet_node.source_refs[0].evidence_refs == ["EV-SHEET", "EV-TITLE", "EV-SCALE"]
    assert discipline_node.source_refs[0].evidence_refs == []
    assert discipline_edge.evidence_refs == []
