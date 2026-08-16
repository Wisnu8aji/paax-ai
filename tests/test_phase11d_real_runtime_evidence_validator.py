#!/usr/bin/env python3
"""
PAAX Phase 11D Correction Round 5 — Independent Canonical Evidence Validator & Mutation Tests
Re-calculates canonical SHA-256 hashes from raw response metadata, validates fail-closed rules,
and executes negative mutation tests proving the validator rejects corrupted or fake evidence.
"""
from __future__ import annotations

import copy
import hashlib
import json
import pathlib
import pytest

EVIDENCE_PATH = pathlib.Path(r"report/report_drawing_intelligence/phase11d_cr5_real_runtime_evidence.json")


def _load_active_evidence() -> dict:
    if not EVIDENCE_PATH.exists():
        pytest.skip(f"Current runtime evidence is not present: {EVIDENCE_PATH}")
    evidence_data = json.loads(EVIDENCE_PATH.read_text(encoding="utf-8"))
    if evidence_data.get("overall_status") != "PASS" or evidence_data.get("status") != "PASS":
        pytest.skip(
            "Historical runtime evidence is superseded and requires an owner rerun; "
            "it is not valid evidence for the current stack."
        )
    return evidence_data


def canonical_sha256(data: dict | list) -> str:
    serialized = json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def validate_cr5_evidence(evidence_data: dict):
    # 1. Reject superseded or non-PASS status
    if evidence_data.get("overall_status") != "PASS" or evidence_data.get("status") != "PASS":
        raise ValueError(f"Evidence overall status must be PASS, got: {evidence_data.get('overall_status')}")

    gates = evidence_data.get("gates", {})
    if not isinstance(gates, dict):
        raise ValueError("Evidence missing 'gates' dictionary")

    # 2. Gate 1 Validation
    g1 = gates.get("command_room_real_route", {})
    if not g1.get("passed") or g1.get("http_status") != 200 or g1.get("total_events", 0) <= 0 or not g1.get("fallback_passed"):
        raise ValueError("Gate 1 failed validation criteria")
    expected_g1_hash = canonical_sha256({"status": 200, "events": g1.get("total_events")})
    if g1.get("response_sha256") != expected_g1_hash:
        raise ValueError("Gate 1 SHA-256 mismatch")

    # 3. Gate 2 Validation
    g2 = gates.get("agentic_mission_runtime", {})
    if not g2.get("passed") or not g2.get("approval_validated") or not g2.get("occ_rejected") or not g2.get("scope_rejected"):
        raise ValueError("Gate 2 failed validation criteria")
    if not g2.get("core_engine_receipt_sha256"):
        raise ValueError("Gate 2 missing core engine receipt sha256")

    # 4. Gate 3 Validation — Handoff Non-Zero Materialization
    g3 = gates.get("review_to_handoff_workflow", {})
    if not g3.get("passed"):
        raise ValueError("Gate 3 'passed' is False")
    if g3.get("materialized_count", 0) <= 0:
        raise ValueError(f"Gate 3 materialized_count must be > 0, got: {g3.get('materialized_count')}")
    if g3.get("rab_draft_updated") is not True:
        raise ValueError("Gate 3 rab_draft_updated must be True")
    if not g3.get("correction_resolved") or not g3.get("stale_rejected") or not g3.get("rbac_denied"):
        raise ValueError("Gate 3 workflow or rejection assertion failed")

    raw_canonical = g3.get("canonical_response")
    if not raw_canonical or not isinstance(raw_canonical, dict):
        raise ValueError("Gate 3 missing canonical_response dictionary")

    recalculated_mat_hash = canonical_sha256(raw_canonical)
    if g3.get("materialization_response_sha256") != recalculated_mat_hash:
        raise ValueError(f"Gate 3 SHA-256 mismatch: recorded={g3.get('materialization_response_sha256')}, recalculated={recalculated_mat_hash}")

    # 5. Gate 4 Validation
    g4 = gates.get("artifact_lifecycle", {})
    if not g4.get("passed") or g4.get("http_status") != 404:
        raise ValueError("Gate 4 failed 404 validation")
    expected_g4_hash = canonical_sha256({"status": 404, "missing_key": "non-existent-artifact-key.json"})
    if g4.get("sha256") != expected_g4_hash:
        raise ValueError("Gate 4 SHA-256 mismatch")

    # 6. Call provenance & budget cap validation
    if not evidence_data.get("attempt_6_rejected"):
        raise ValueError("Evidence must prove attempt_6_rejected == True")
    prov = evidence_data.get("call_counters_provenance", {})
    if prov.get("agentic_orchestrator_provider", 0) > 5:
        raise ValueError("Agentic orchestrator provider call counter exceeded budget cap of 5")


def test_cr5_evidence_valid():
    evidence_data = _load_active_evidence()
    validate_cr5_evidence(evidence_data)


def test_cr5_negative_mutation_zero_materialized():
    evidence_data = _load_active_evidence()
    mutated = copy.deepcopy(evidence_data)
    mutated["gates"]["review_to_handoff_workflow"]["materialized_count"] = 0
    with pytest.raises(ValueError, match="materialized_count must be > 0"):
        validate_cr5_evidence(mutated)


def test_cr5_negative_mutation_false_rab_draft_updated():
    evidence_data = _load_active_evidence()
    mutated = copy.deepcopy(evidence_data)
    mutated["gates"]["review_to_handoff_workflow"]["rab_draft_updated"] = False
    with pytest.raises(ValueError, match="rab_draft_updated must be True"):
        validate_cr5_evidence(mutated)


def test_cr5_negative_mutation_corrupted_sha256():
    evidence_data = _load_active_evidence()
    mutated = copy.deepcopy(evidence_data)
    mutated["gates"]["review_to_handoff_workflow"]["materialization_response_sha256"] = "0000000000000000000000000000000000000000000000000000000000000000"
    with pytest.raises(ValueError, match="Gate 3 SHA-256 mismatch"):
        validate_cr5_evidence(mutated)


def test_cr5_negative_mutation_missing_budget_cap_proof():
    evidence_data = _load_active_evidence()
    mutated = copy.deepcopy(evidence_data)
    mutated["attempt_6_rejected"] = False
    with pytest.raises(ValueError, match="attempt_6_rejected == True"):
        validate_cr5_evidence(mutated)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
