from __future__ import annotations

from app.perception.ai_assist.sheet_classification_assist import (
    SheetClassificationContext,
    SheetTextFragment,
    suggest_sheet_classification,
)


class FakeClient:
    model = "fake-model"

    def __init__(self, response):
        self.response = response
        self.calls = 0

    def generate_json(self, **kwargs):
        self.calls += 1
        return self.response


def context(**changes):
    values = dict(
        page_index=4,
        title="DENAH LANTAI 2",
        fragments=(
            SheetTextFragment("DENAH LANTAI 2", "ev-title", "bbox-title"),
            SheetTextFragment("SKALA 1:100", "ev-scale", "bbox-scale"),
        ),
        deterministic_classification="unknown",
        deterministic_confidence=0.4,
    )
    values.update(changes)
    return SheetClassificationContext(**values)


def valid_response(**changes):
    values = dict(
        classification_key="plan",
        proposed_category=None,
        confidence=0.92,
        reasoning="The title explicitly states a floor plan.",
        source_texts=["DENAH LANTAI 2"],
        evidence_refs=["ev-title"],
        bbox_ids=["bbox-title"],
    )
    values.update(changes)
    return values


def test_deterministic_fast_path_does_not_call_ai():
    client = FakeClient(valid_response())
    proposal = suggest_sheet_classification(
        context(deterministic_classification="plan", deterministic_confidence=0.95), client
    )
    assert proposal is None
    assert client.calls == 0


def test_valid_proposal_is_review_only_and_never_auto_committed():
    client = FakeClient(valid_response())
    proposal = suggest_sheet_classification(context(), client)
    assert proposal is not None
    assert proposal.classification_key == "plan"
    assert proposal.status == "needs_review"
    assert proposal.auto_commit_allowed is False
    assert proposal.model == "fake-model"


def test_hallucinated_source_text_is_rejected():
    client = FakeClient(valid_response(source_texts=["DENAH LANTAI 99"]))
    assert suggest_sheet_classification(context(), client) is None


def test_invalid_evidence_or_bbox_is_rejected():
    assert suggest_sheet_classification(context(), FakeClient(valid_response(evidence_refs=["missing"]))) is None
    assert suggest_sheet_classification(context(), FakeClient(valid_response(bbox_ids=["missing"]))) is None


def test_novel_category_stays_unknown_and_needs_human_review():
    client = FakeClient(valid_response(classification_key="unknown", proposed_category="fire compartment matrix"))
    proposal = suggest_sheet_classification(context(), client)
    assert proposal is not None
    assert proposal.classification_key == "unknown"
    assert proposal.proposed_category == "fire compartment matrix"
    assert proposal.status == "needs_review"


def test_invalid_category_and_client_failure_degrade_to_none():
    assert suggest_sheet_classification(context(), FakeClient(valid_response(classification_key="invoice"))) is None
    assert suggest_sheet_classification(context(), FakeClient(None)) is None
