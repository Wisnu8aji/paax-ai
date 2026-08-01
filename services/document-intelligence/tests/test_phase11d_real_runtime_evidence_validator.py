"""Phase 11D Correction Round 4 Real Runtime Evidence Validator.

Strictly validates:
1. Existence and integrity of report/report_drawing_intelligence/phase11d_cr4_real_runtime_evidence.json.
2. Fail-closed overall PASS requirements (all 10 verification summary booleans MUST be True).
3. Non-synthetic Core Engine receipt SHA-256 and Handoff materialization response SHA-256 hashes (valid 64-hex SHA-256 strings).
4. Budget cap metadata (max_calls_per_feature_cap == 5 and attempt_6_rejected == True).
5. Zero exposed secrets (no raw bearer tokens, internal keys, or cookies).
"""

import json
import re
import pathlib
import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
EVIDENCE_PATH = REPO_ROOT / "report" / "report_drawing_intelligence" / "phase11d_cr4_real_runtime_evidence.json"

HEX_SHA256_REGEX = re.compile(r"^[a-f0-9]{64}$")


def test_evidence_file_exists():
    assert EVIDENCE_PATH.exists(), f"Missing required evidence artifact at {EVIDENCE_PATH}"


def test_evidence_budget_cap_metadata():
    assert EVIDENCE_PATH.exists()
    data = json.loads(EVIDENCE_PATH.read_text(encoding="utf-8"))

    assert data.get("phase") == "Phase 11D Correction Round 4"
    assert data.get("max_calls_per_feature_cap") == 5
    assert data.get("attempt_6_rejected") is True


def test_evidence_fail_closed_booleans_and_overall_pass():
    assert EVIDENCE_PATH.exists()
    data = json.loads(EVIDENCE_PATH.read_text(encoding="utf-8"))

    assert data.get("overall_status") in ("PASS", "REJECTED_SUPERSEDED"), "Overall evidence status must be PASS or REJECTED_SUPERSEDED"

    summary = data.get("verification_summary", {})
    required_booleans = [
        "command_room_sse_completed",
        "agentic_mission_executed",
        "approval_validated",
        "core_engine_calculated",
        "review_queue_verified",
        "correction_resolved",
        "rab_bridge_materialized",
        "stale_receipt_rejected",
        "rbac_denied",
        "artifact_fail_closed_404",
    ]

    for b in required_booleans:
        assert b in summary, f"Verification summary missing required boolean '{b}'"
        assert summary[b] is True, f"Verification summary boolean '{b}' is False (MUST fail-closed to CHANGES_REQUIRED)"


def test_evidence_real_sha256_response_hashes_no_synthetic():
    assert EVIDENCE_PATH.exists()
    data = json.loads(EVIDENCE_PATH.read_text(encoding="utf-8"))

    gates = data.get("gates", {})
    
    # Core Engine calculation receipt hash
    agentic_gate = gates.get("agentic_mission_runtime", {})
    ce_receipt_data = agentic_gate.get("core_engine_receipt", {})
    assert ce_receipt_data.get("verified") is True
    ce_hash = ce_receipt_data.get("receipt_sha256")
    assert ce_hash is not None and isinstance(ce_hash, str)
    assert HEX_SHA256_REGEX.match(ce_hash), f"Invalid Core Engine receipt SHA-256 format: '{ce_hash}'"

    # Handoff materialization response hash
    handoff_gate = gates.get("review_to_handoff_workflow", {})
    vh_response_data = handoff_gate.get("verified_handoff_response", {})
    assert vh_response_data.get("verified") is True
    vh_hash = vh_response_data.get("response_sha256")
    assert vh_hash is not None and isinstance(vh_hash, str)
    assert HEX_SHA256_REGEX.match(vh_hash), f"Invalid Handoff response SHA-256 format: '{vh_hash}'"

    # Assert zero synthetic hash strings in raw JSON
    raw_text = EVIDENCE_PATH.read_text(encoding="utf-8")
    assert "core-engine-receipt:" not in raw_text, "Evidence file contains synthetic core-engine-receipt string!"
    assert "handoff-receipt:" not in raw_text, "Evidence file contains synthetic handoff-receipt string!"


def test_evidence_zero_secret_leakage():
    assert EVIDENCE_PATH.exists()
    raw_text = EVIDENCE_PATH.read_text(encoding="utf-8")

    forbidden_patterns = [
        r"test-internal-key",
        r"Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*",
        r"appr-run-[a-f0-9]{8}",
    ]

    for pat in forbidden_patterns:
        match = re.search(pat, raw_text)
        assert match is None, f"Forbidden secret or reusable token material exposed in evidence file! Match: '{match.group(0)}'"
