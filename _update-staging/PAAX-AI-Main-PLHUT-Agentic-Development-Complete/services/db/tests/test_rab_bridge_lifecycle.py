import pytest

from paax_db.rab_bridge_lifecycle import transition


def test_only_documented_rab_bridge_v2_transitions_are_allowed():
    assert transition("draft", "candidate_ready") == "candidate_ready"
    assert transition("candidate_ready", "needs_review") == "needs_review"
    assert transition("needs_review", "approved") == "approved"
    assert transition("approved", "calculation_pending") == "calculation_pending"
    assert transition("calculation_pending", "calculated") == "calculated"
    assert transition("calculated", "materialized") == "materialized"
    with pytest.raises(ValueError, match="invalid RAB Bridge transition"):
        transition("candidate_ready", "materialized")


def test_approval_is_required_before_calculation_transition():
    with pytest.raises(ValueError, match="human AHSP approval"):
        transition("needs_review", "calculation_pending")
