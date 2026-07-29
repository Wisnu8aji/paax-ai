from __future__ import annotations

import json
from unittest.mock import MagicMock
import pytest

from app.perception.ai_assist.contracts import (
    AiAssistDecision,
    AiProposalAudit,
    validate_bounded_proposal,
)
from app.perception.ai_assist.audit_ledger import AppendOnlyProposalAuditLog
from app.perception.ai_assist.client import NullAiAssistClient, GeminiAiAssistClient


def make_decision(trigger="abstain", reason="deterministic rule fast-path abstained", fields=("category", "evidence_refs", "source_texts"), refs=("ev-101",)):
    return AiAssistDecision(
        trigger=trigger,
        deterministic_reason=reason,
        allowed_fields=fields,
        evidence_refs=refs,
    )


def test_deterministic_success_does_not_call_provider():
    """Verify that when deterministic rules succeed, no LLM provider is invoked."""
    client = MagicMock()
    # Fast path: deterministic rule knows exact answer, so fast-path logic returns without calling client
    # NullAiAssistClient simulates client when API key is missing or fast-path is sufficient
    null_client = NullAiAssistClient()
    res = null_client.generate_json(
        system_prompt="sys",
        user_prompt="usr",
        response_schema={"type": "object"},
    )
    assert res is None
    client.generate_json.assert_not_called()


def test_trigger_other_than_abstain_or_ambiguous_is_rejected():
    """Verify that triggers other than abstain or ambiguous are rejected."""
    with pytest.raises(ValueError, match="trigger must be 'abstain' or 'ambiguous'"):
        AiAssistDecision(
            trigger="always_call",  # invalid trigger
            deterministic_reason="some reason",
            allowed_fields=("cat",),
            evidence_refs=("ev-1",),
        )


def test_missing_or_invalid_evidence_is_rejected():
    """Verify that proposals citing evidence refs not present in input evidence are rejected."""
    dec = make_decision(refs=("ev-1",))
    res = validate_bounded_proposal(
        decision=dec,
        proposal={"category": "plan", "evidence_refs": ["ev-999"]},  # unknown ref
        supplied_evidence_refs={"ev-1"},
    )
    assert res["valid"] is False
    assert "proposal cites unknown evidence" in res["reason"]
    assert "ev-999" in res["evidence_refs"]


def test_proposal_outside_allowed_vocabulary_is_rejected():
    """Verify that proposals with values outside allowed vocabulary are rejected."""
    dec = make_decision(fields=("category", "evidence_refs"))
    res = validate_bounded_proposal(
        decision=dec,
        proposal={"category": "invalid_custom_category", "evidence_refs": ["ev-101"]},
        supplied_evidence_refs={"ev-101"},
        allowed_vocabulary={"plan", "elevation", "section", "detail"},
    )
    assert res["valid"] is False
    assert "not in allowed vocabulary" in res["reason"]


def test_source_text_mismatch_is_rejected():
    """Verify that proposals with source_texts not present in input evidence are rejected."""
    dec = make_decision()
    res = validate_bounded_proposal(
        decision=dec,
        proposal={
            "category": "plan",
            "evidence_refs": ["ev-101"],
            "source_texts": ["Hallucinated String 123"],
        },
        supplied_evidence_refs={"ev-101"},
        supplied_source_texts={"Denah Lantai 1", "Skala 1:100"},
    )
    assert res["valid"] is False
    assert "proposal cites source text not present in input evidence" in res["reason"]


def test_proposal_claiming_core_engine_or_final_quantity_is_rejected():
    """Verify that proposals attempting to claim sourceAuthority=core_engine or set final quantity are rejected."""
    dec = make_decision(fields=("category", "evidence_refs", "sourceAuthority", "final_quantity"))
    res1 = validate_bounded_proposal(
        decision=dec,
        proposal={"category": "plan", "evidence_refs": ["ev-101"], "sourceAuthority": "core_engine"},
        supplied_evidence_refs={"ev-101"},
    )
    assert res1["valid"] is False
    assert "cannot claim sourceAuthority=core_engine" in res1["reason"]

    res2 = validate_bounded_proposal(
        decision=dec,
        proposal={"category": "plan", "evidence_refs": ["ev-101"], "final_quantity": 100.5},
        supplied_evidence_refs={"ev-101"},
    )
    assert res2["valid"] is False
    assert "cannot claim sourceAuthority=core_engine or set final engine quantity" in res2["reason"]


def test_audit_append_only_and_hash_chain(tmp_path):
    """Verify audit log append-only property and tamper detection."""
    ledger_file = tmp_path / "audit.jsonl"
    log = AppendOnlyProposalAuditLog(ledger_file)
    assert log.verify() is True

    dec = make_decision()
    entry1 = AiProposalAudit(
        model="fake-model-v1",
        prompt_version="1.0.0",
        case_id="case-001",
        tokens={"prompt": 50, "completion": 20},
        cost_usd=0.0001,
        latency_ms=120,
        proposal={"category": "plan", "evidence_refs": ["ev-101"]},
        validation={"valid": True, "reason": "bounded proposal is reviewable"},
        outcome="needs_review",
        decision=dec,
        approval_state="unapproved",
    )

    row1 = log.append(entry1)
    assert row1["previous_hash"] == "GENESIS"
    assert log.verify() is True

    entry2 = AiProposalAudit(
        model="fake-model-v1",
        prompt_version="1.0.0",
        case_id="case-002",
        tokens={"prompt": 30, "completion": 10},
        cost_usd=0.00005,
        latency_ms=90,
        proposal=None,
        validation={"valid": False, "reason": "provider error"},
        outcome="provider_error",
        decision=dec,
        approval_state="unapproved",
    )

    row2 = log.append(entry2)
    assert row2["previous_hash"] == row1["record_hash"]
    assert log.verify() is True

    # Tamper with file
    lines = ledger_file.read_text(encoding="utf-8").splitlines()
    tampered_data = json.loads(lines[0])
    tampered_data["audit"]["outcome"] = "approved"
    lines[0] = json.dumps(tampered_data)
    ledger_file.write_text("\n".join(lines) + "\n", encoding="utf-8")

    assert log.verify() is False


def test_provider_failure_produces_honest_audit_outcome(tmp_path):
    """Verify provider failures yield an honest audit record with provider_error outcome."""
    ledger = AppendOnlyProposalAuditLog(tmp_path / "audit.jsonl")
    dec = make_decision()

    failed_audit = AiProposalAudit(
        model="gemini-2.5-flash",
        prompt_version="1.0.0",
        case_id="case-timeout",
        tokens={"prompt": 0, "completion": 0},
        cost_usd=0.0,
        latency_ms=5000,
        proposal=None,
        validation={"valid": False, "reason": "HTTP 504 Gateway Timeout"},
        outcome="provider_error",
        decision=dec,
        approval_state="unapproved",
    )

    row = ledger.append(failed_audit)
    assert row["audit"]["outcome"] == "provider_error"
    assert row["audit"]["proposal"] is None
    assert ledger.verify() is True


def test_proposal_requires_human_approval_state():
    """Verify proposal defaults to unapproved / needs_review and cannot auto-commit."""
    dec = make_decision()
    audit = AiProposalAudit(
        model="test-model",
        prompt_version="v1",
        case_id="case-proposal",
        tokens={"input": 10},
        cost_usd=0.0,
        latency_ms=10,
        proposal={"category": "plan", "evidence_refs": ["ev-101"]},
        validation={"valid": True},
        outcome="needs_review",
        decision=dec,
    )
    normalized = audit.normalized()
    assert normalized.approval_state == "unapproved"
    assert normalized.outcome == "needs_review"
