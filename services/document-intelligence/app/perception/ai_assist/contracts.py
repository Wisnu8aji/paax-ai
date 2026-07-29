from __future__ import annotations

"""Contracts for bounded Drawing Intelligence AI proposals and abstention rules."""

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from typing import Any, Literal


AssistTrigger = Literal["abstain", "ambiguous"]
ProposalOutcome = Literal["needs_review", "approved", "rejected", "invalid", "provider_error"]
ApprovalState = Literal["unapproved", "approved", "rejected", "edited"]

ALLOWED_TRIGGERS: set[str] = {"abstain", "ambiguous"}


@dataclass(frozen=True)
class AiAssistDecision:
    trigger: AssistTrigger
    deterministic_reason: str
    allowed_fields: tuple[str, ...]
    evidence_refs: tuple[str, ...]

    def __post_init__(self) -> None:
        if self.trigger not in ALLOWED_TRIGGERS:
            raise ValueError(f"trigger must be 'abstain' or 'ambiguous', got '{self.trigger}'")
        if not self.deterministic_reason or not self.deterministic_reason.strip():
            raise ValueError("deterministic_reason is required")
        if not self.allowed_fields:
            raise ValueError("allowed_fields cannot be empty")
        if not self.evidence_refs:
            raise ValueError("evidence_refs cannot be empty")


@dataclass(frozen=True)
class AiProposalAudit:
    model: str
    prompt_version: str
    case_id: str
    tokens: dict[str, int]
    cost_usd: float
    latency_ms: int
    proposal: dict[str, Any] | None
    validation: dict[str, Any]
    outcome: ProposalOutcome
    decision: AiAssistDecision
    approval_state: ApprovalState = "unapproved"
    recorded_at: str = ""

    def normalized(self) -> "AiProposalAudit":
        timestamp = self.recorded_at or datetime.now(timezone.utc).isoformat()
        if not self.model.strip():
            raise ValueError("model cannot be empty")
        if not self.prompt_version.strip():
            raise ValueError("prompt_version cannot be empty")
        if not self.case_id.strip():
            raise ValueError("case_id cannot be empty")
        if self.cost_usd < 0 or self.latency_ms < 0:
            raise ValueError("cost and latency must be non-negative")
        if any(int(value) < 0 for value in self.tokens.values()):
            raise ValueError("token counts must be non-negative")
        return AiProposalAudit(
            model=self.model.strip(),
            prompt_version=self.prompt_version.strip(),
            case_id=self.case_id.strip(),
            tokens={str(key): int(value) for key, value in self.tokens.items()},
            cost_usd=float(self.cost_usd),
            latency_ms=int(self.latency_ms),
            proposal=self.proposal,
            validation=dict(self.validation),
            outcome=self.outcome,
            decision=self.decision,
            approval_state=self.approval_state,
            recorded_at=timestamp,
        )


def validate_bounded_proposal(
    *,
    decision: AiAssistDecision,
    proposal: dict[str, Any],
    supplied_evidence_refs: set[str],
    allowed_vocabulary: set[str] | None = None,
    supplied_source_texts: set[str] | None = None,
) -> dict[str, Any]:
    """Reject fields/evidence/vocabulary/texts not explicitly allowed by deterministic processing."""

    if decision.trigger not in ALLOWED_TRIGGERS:
        return {"valid": False, "reason": f"invalid trigger '{decision.trigger}', must be abstain or ambiguous"}

    # Prohibit setting core_engine authority or final quantity
    if proposal.get("sourceAuthority") == "core_engine" or proposal.get("final_quantity") is not None:
        return {
            "valid": False,
            "reason": "AI proposal cannot claim sourceAuthority=core_engine or set final engine quantity",
        }

    proposed_fields = set(proposal)
    disallowed = sorted(proposed_fields - set(decision.allowed_fields))
    if disallowed:
        return {"valid": False, "reason": "proposal contains disallowed fields", "fields": disallowed}

    evidence = proposal.get("evidence_refs", [])
    if not isinstance(evidence, list):
        return {"valid": False, "reason": "evidence_refs must be a list"}

    missing_evidence = sorted(set(str(value) for value in evidence) - supplied_evidence_refs)
    if missing_evidence:
        return {"valid": False, "reason": "proposal cites unknown evidence", "evidence_refs": missing_evidence}

    # Check allowed vocabulary if specified
    if allowed_vocabulary is not None:
        for key, value in proposal.items():
            if key == "evidence_refs":
                continue
            candidates = value if isinstance(value, list) else [value]
            for item in candidates:
                if isinstance(item, str) and item not in allowed_vocabulary:
                    return {
                        "valid": False,
                        "reason": f"value '{item}' for field '{key}' is not in allowed vocabulary",
                        "field": key,
                        "value": item,
                    }

    # Check source text matching if supplied
    if supplied_source_texts is not None:
        source_texts = proposal.get("source_texts", [])
        if isinstance(source_texts, list):
            missing_texts = sorted(set(str(t) for t in source_texts) - supplied_source_texts)
            if missing_texts:
                return {
                    "valid": False,
                    "reason": "proposal cites source text not present in input evidence",
                    "missing_source_texts": missing_texts,
                }

    return {"valid": True, "reason": "bounded proposal is reviewable"}
