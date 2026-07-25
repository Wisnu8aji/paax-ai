from __future__ import annotations
from typing import Any, Literal, Protocol
from pydantic import BaseModel, Field

class SolverCapability(BaseModel):
    solver_id: str
    domain: str
    operations: list[str]
    availability: Literal['available','not_installed','external_license_required','not_configured']
    deterministic: bool = True
    version: str | None = None

class SolverRequest(BaseModel):
    project_id: str
    operation: str
    inputs: dict[str, Any]
    evidence_refs: list[str] = Field(default_factory=list)

class SolverResult(BaseModel):
    solver_id: str
    operation: str
    status: Literal['complete','review_required','unavailable','failed']
    outputs: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)

class SolverAdapter(Protocol):
    capability: SolverCapability
    def execute(self, request: SolverRequest) -> SolverResult: ...

class SolverRegistry:
    def __init__(self): self._adapters: dict[str,SolverAdapter]={}
    def register(self, adapter: SolverAdapter) -> None:
        if adapter.capability.solver_id in self._adapters: raise ValueError('duplicate solver')
        self._adapters[adapter.capability.solver_id]=adapter
    def capabilities(self) -> list[SolverCapability]: return sorted((a.capability for a in self._adapters.values()),key=lambda x:x.solver_id)
    def execute(self, solver_id: str, request: SolverRequest) -> SolverResult:
        adapter=self._adapters.get(solver_id)
        if not adapter: return SolverResult(solver_id=solver_id,operation=request.operation,status='unavailable',warnings=['solver adapter not registered'],evidence_refs=request.evidence_refs)
        cap=adapter.capability
        if cap.availability!='available': return SolverResult(solver_id=solver_id,operation=request.operation,status='unavailable',warnings=[f'solver {cap.availability}'],evidence_refs=request.evidence_refs)
        if request.operation not in cap.operations: return SolverResult(solver_id=solver_id,operation=request.operation,status='failed',warnings=['operation not supported'],evidence_refs=request.evidence_refs)
        return adapter.execute(request)
