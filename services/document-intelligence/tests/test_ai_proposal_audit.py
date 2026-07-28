from __future__ import annotations

import json

from app.perception.ai_assist.proposal_audit import (
    AiAssistDecision,
    AiProposalAudit,
    AppendOnlyProposalAuditLog,
    validate_bounded_proposal,
)


def decision():
    return AiAssistDecision(
        trigger="abstain",
        deterministic_reason="title could not be classified",
        allowed_fields=("classification_key", "evidence_refs"),
        evidence_refs=("ev-1",),
    )


def audit():
    return AiProposalAudit(
        model="offline-fake",
        prompt_version="v1",
        case_id="case-1",
        tokens={"input": 10, "output": 5},
        cost_usd=0,
        latency_ms=2,
        proposal={"classification_key": "plan", "evidence_refs": ["ev-1"]},
        validation={"valid": True},
        outcome="needs_review",
        decision=decision(),
    )


def test_bounded_validation_rejects_unknown_fields_and_evidence():
    assert validate_bounded_proposal(
        decision=decision(), proposal={"quantity": 10, "evidence_refs": ["ev-1"]}, supplied_evidence_refs={"ev-1"}
    )["valid"] is False
    assert validate_bounded_proposal(
        decision=decision(), proposal={"classification_key": "plan", "evidence_refs": ["made-up"]}, supplied_evidence_refs={"ev-1"}
    )["valid"] is False


def test_append_only_hash_chain_detects_tampering(tmp_path):
    path = tmp_path / "audit.jsonl"
    ledger = AppendOnlyProposalAuditLog(path)
    first = ledger.append(audit())
    second = ledger.append(audit())
    assert second["previous_hash"] == first["record_hash"]
    assert ledger.verify() is True

    rows = path.read_text(encoding="utf-8").splitlines()
    changed = json.loads(rows[0])
    changed["audit"]["outcome"] = "approved"
    rows[0] = json.dumps(changed)
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")
    assert ledger.verify() is False
