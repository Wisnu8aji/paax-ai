from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field


class AuthorityDecision(BaseModel):
    result_id: str
    status: Literal["proposal", "candidate", "verified", "approved", "rejected", "stale"]
    authorized_by_type: Literal["model", "engine", "human", "none"]
    authorized_by_id: str | None = None
    formula_version: str | None = None
    standard_versions: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)
    approval_role: str | None = None


class UntrustedInstructionFinding(BaseModel):
    text: str
    reason: str
    severity: Literal["review", "blocking"]


_INJECTION_PATTERNS = [
    re.compile(r"ignore (?:all|previous|prior) instructions", re.I),
    re.compile(r"system prompt", re.I),
    re.compile(r"reveal (?:secret|token|password|key)", re.I),
    re.compile(r"execute (?:shell|command|code)", re.I),
    re.compile(r"bypass (?:approval|policy|security)", re.I),
]


def scan_untrusted_document_text(texts: list[str]) -> list[UntrustedInstructionFinding]:
    findings: list[UntrustedInstructionFinding] = []
    for text in texts:
        for pattern in _INJECTION_PATTERNS:
            if pattern.search(text):
                findings.append(UntrustedInstructionFinding(
                    text=text[:240], reason=f"document text matches untrusted instruction pattern: {pattern.pattern}",
                    severity="blocking",
                ))
                break
    return findings


def can_publish_authoritative_result(decision: AuthorityDecision) -> bool:
    if decision.status not in {"verified", "approved"}:
        return False
    if decision.authorized_by_type == "engine":
        return bool(decision.formula_version and decision.evidence_refs)
    if decision.authorized_by_type == "human":
        return bool(decision.authorized_by_id and decision.approval_role and decision.evidence_refs)
    return False
