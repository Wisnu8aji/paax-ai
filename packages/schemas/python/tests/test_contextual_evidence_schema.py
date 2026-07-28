import json
import pathlib
import pytest
from pydantic import ValidationError

from paax_schemas.contextual_evidence import (
    RawEvidenceArtifact,
    EvidenceRegion,
    EvidencePointer,
    SourceAuthorityEntry,
    CanonicalFact,
    PropagationScope,
    ResolutionDecision,
)

FIXTURES_DIR = pathlib.Path(__file__).parents[2] / "fixtures"


def test_valid_contextual_evidence_fixture_parses():
    valid_file = FIXTURES_DIR / "contextual-evidence.valid.json"
    data = json.loads(valid_file.read_text(encoding="utf-8"))

    artifact = RawEvidenceArtifact.model_validate(data["artifact"])
    assert artifact.content_sha256 == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

    region = EvidenceRegion.model_validate(data["region"])
    assert region.project_graph_snapshot_id == "snap_pckm_001"
    assert region.project_graph_evidence_id == "ev_pckm_99"

    auth = SourceAuthorityEntry.model_validate(data["authority"])
    assert auth.authority_id == "auth_3001"

    fact = CanonicalFact.model_validate(data["canonical_fact"])
    assert fact.calculation_authority == "none"
    assert fact.value["token_ref"] == "P1"

    scope = PropagationScope.model_validate(data["propagation_scope"])
    assert scope.match_mode == "exact"
    assert scope.occurrence_ids == ["occ_PJ1"]

    decision = ResolutionDecision.model_validate(data["resolution_decision"])
    assert decision.status == "approved"
    assert decision.selected_fact_id == "fact_4001"
    assert decision.decided_by == "lead_engineer_2"
    assert decision.calculation_authority == "none"


def test_invalid_contextual_evidence_cases_are_rejected():
    invalid_file = FIXTURES_DIR / "contextual-evidence.invalid.json"
    cases = json.loads(invalid_file.read_text(encoding="utf-8"))

    target_map = {
        "artifact": RawEvidenceArtifact,
        "region": EvidenceRegion,
        "authority": SourceAuthorityEntry,
        "canonical_fact": CanonicalFact,
        "propagation_scope": PropagationScope,
        "resolution_decision": ResolutionDecision,
    }

    assert len(cases) == 14, f"Expected 14 invalid cases, found {len(cases)}"

    for case in cases:
        name = case["name"]
        target_name = case["target"]
        data = case["data"]
        model_cls = target_map[target_name]
        with pytest.raises(ValidationError) as exc_info:
            model_cls.model_validate(data)
        assert exc_info.value is not None, f"Case {name} failed to raise ValidationError"


def test_evidence_region_snapshot_and_evidence_id_must_pair():
    with pytest.raises(ValidationError):
        EvidenceRegion(
            region_id="reg_1",
            artifact_id="art_1",
            project_id="proj_1",
            page_index=0,
            bbox_space="none",
            project_graph_snapshot_id="snap_1",
            project_graph_evidence_id=None,
            created_at="2026-07-28T10:00:00Z",
        )


def test_no_prefix_special_cases_for_p_pj_tokens():
    scope = PropagationScope(
        project_id="proj_1",
        occurrence_ids=["P", "P1", "PJ", "PJ1"],
        match_mode="exact",
    )
    assert scope.occurrence_ids == ["P", "P1", "PJ", "PJ1"]
    assert scope.match_mode == "exact"
