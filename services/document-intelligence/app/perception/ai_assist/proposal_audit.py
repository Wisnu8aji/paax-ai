from __future__ import annotations

"""Append-only audit primitives for bounded Drawing Intelligence AI proposals.

This module never calls a provider and never mutates approved project metadata.
It records why deterministic processing abstained, what evidence was supplied,
and how a proposal was validated so a reviewer can approve or reject it later.
"""

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
from typing import Any, Literal


AssistTrigger = Literal["abstain", "ambiguous"]
ProposalOutcome = Literal["needs_review", "approved", "rejected", "invalid", "provider_error"]


@dataclass(frozen=True)
class AiAssistDecision:
    trigger: AssistTrigger
    deterministic_reason: str
    allowed_fields: tuple[str, ...]
    evidence_refs: tuple[str, ...]

    def __post_init__(self) -> None:
        if not self.deterministic_reason.strip():
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
    recorded_at: str = ""

    def normalized(self) -> "AiProposalAudit":
        timestamp = self.recorded_at or datetime.now(timezone.utc).isoformat()
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
            recorded_at=timestamp,
        )


class AppendOnlyProposalAuditLog:
    """JSONL hash-chain ledger; existing records are never edited in place."""

    def __init__(self, path: str | Path):
        self.path = Path(path)

    def _last_hash(self) -> str:
        if not self.path.exists():
            return "GENESIS"
        last = "GENESIS"
        for line in self.path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                last = str(json.loads(line)["record_hash"])
        return last

    def append(self, audit: AiProposalAudit) -> dict[str, Any]:
        normalized = audit.normalized()
        previous_hash = self._last_hash()
        body = asdict(normalized)
        canonical = json.dumps(
            {"previous_hash": previous_hash, "audit": body},
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )
        record_hash = sha256(canonical.encode("utf-8")).hexdigest()
        row = {"previous_hash": previous_hash, "record_hash": record_hash, "audit": body}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        return row

    def verify(self) -> bool:
        previous = "GENESIS"
        if not self.path.exists():
            return True
        for line in self.path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get("previous_hash") != previous:
                return False
            canonical = json.dumps(
                {"previous_hash": previous, "audit": row.get("audit")},
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
            )
            expected = sha256(canonical.encode("utf-8")).hexdigest()
            if row.get("record_hash") != expected:
                return False
            previous = expected
        return True


def validate_bounded_proposal(
    *,
    decision: AiAssistDecision,
    proposal: dict[str, Any],
    supplied_evidence_refs: set[str],
) -> dict[str, Any]:
    """Reject fields/evidence not explicitly allowed by deterministic processing."""

    proposed_fields = set(proposal)
    disallowed = sorted(proposed_fields - set(decision.allowed_fields))
    evidence = proposal.get("evidence_refs", [])
    if not isinstance(evidence, list):
        return {"valid": False, "reason": "evidence_refs must be a list"}
    missing = sorted(set(str(value) for value in evidence) - supplied_evidence_refs)
    if disallowed:
        return {"valid": False, "reason": "proposal contains disallowed fields", "fields": disallowed}
    if missing:
        return {"valid": False, "reason": "proposal cites unknown evidence", "evidence_refs": missing}
    return {"valid": True, "reason": "bounded proposal is reviewable"}
