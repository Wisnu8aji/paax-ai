from app.transcription.evidence_namespacing import namespace_evidence_ids
from app.transcription.models import (
    DemModelOutput,
    EvidenceItem,
    InterpretedValue,
    ObservationValue,
    SheetCompletion,
    SheetIdentity,
    ValueWithEvidence,
)


def _model_output(evidence_ids: list[str]) -> DemModelOutput:
    return DemModelOutput(
        sheet_identity=SheetIdentity(
            sheet_number=ValueWithEvidence(value="S-01", confidence=0.9, evidence_refs=[evidence_ids[0]]),
            title=ValueWithEvidence(value="Sheet", confidence=0.9),
            discipline=InterpretedValue(value="Arsitektur", confidence=0.9, status="extracted"),
        ),
        observations={
            "element_labels": [
                ObservationValue(
                    raw="COL-1", normalized="COL-1", confidence=0.9, evidence_refs=[evidence_ids[0]],
                ),
            ],
        },
        evidence=[
            EvidenceItem(evidence_id=ev_id, kind="text", raw=ev_id, confidence=0.9)
            for ev_id in evidence_ids
        ],
        completion=SheetCompletion(sections_expected=1, sections_completed=1, is_complete=True),
    )


def test_namespace_evidence_ids_rewrites_evidence_list_and_every_reference():
    model_output = _model_output(["ev-001", "ev-002"])

    namespaced = namespace_evidence_ids(model_output, run_id="RUN-A", page_index=3)

    assert {item.evidence_id for item in namespaced.evidence} == {"RUN-A:3:ev-001", "RUN-A:3:ev-002"}
    assert namespaced.sheet_identity.sheet_number.evidence_refs == ["RUN-A:3:ev-001"]
    assert namespaced.observations.element_labels[0].evidence_refs == ["RUN-A:3:ev-001"]


def test_namespace_evidence_ids_from_two_pages_never_collide():
    page0 = namespace_evidence_ids(_model_output(["ev-001"]), run_id="RUN-A", page_index=0)
    page1 = namespace_evidence_ids(_model_output(["ev-001"]), run_id="RUN-A", page_index=1)

    assert page0.evidence[0].evidence_id != page1.evidence[0].evidence_id


def test_namespace_evidence_ids_is_noop_for_empty_evidence():
    model_output = DemModelOutput(
        sheet_identity=SheetIdentity(
            sheet_number=ValueWithEvidence(value="S-01", confidence=0.9),
            title=ValueWithEvidence(value="Sheet", confidence=0.9),
            discipline=InterpretedValue(value="Arsitektur", confidence=0.9, status="extracted"),
        ),
        evidence=[],
        completion=SheetCompletion(sections_expected=0, sections_completed=0, is_complete=True),
    )

    namespaced = namespace_evidence_ids(model_output, run_id="RUN-A", page_index=0)
    assert namespaced is model_output
