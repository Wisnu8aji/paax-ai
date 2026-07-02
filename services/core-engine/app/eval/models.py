from __future__ import annotations

from typing import Any, List, Optional

from pydantic import BaseModel, Field


class EvalCase(BaseModel):
    id: str
    actual: Optional[float] = None
    expected: Optional[float] = None
    tolerance: float = Field(default=0.0, ge=0)
    actual_json: Optional[Any] = None
    expected_json: Optional[Any] = None


class EvalRunRequest(BaseModel):
    cases: List[EvalCase] = Field(default_factory=list)


class EvalCaseResult(BaseModel):
    id: str
    passed: bool
    delta: Optional[float] = None
    reason: str


class EvalSummary(BaseModel):
    total: int
    passed: int
    failed: int


class EvalRunResult(BaseModel):
    results: List[EvalCaseResult]
    summary: EvalSummary
