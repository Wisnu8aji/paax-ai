from __future__ import annotations

from typing import Any, Optional, Protocol

from pydantic import BaseModel, ConfigDict, Field

from app.project_graph.models import ProjectGraphEdge, ProjectGraphNode


class ModelUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_tokens: int = 0
    reasoning_tokens: int = 0


class ResolutionCandidate(BaseModel):
    """A bounded graph-resolution request for an optional provider."""

    model_config = ConfigDict(extra="allow")

    candidate_id: str = ""
    project_id: str = ""
    source_node_ids: list[str] = Field(default_factory=list)
    target_node_ids: list[str] = Field(default_factory=list)
    relation_hint: Optional[str] = None
    context: dict[str, Any] = Field(default_factory=dict)


class PckmProviderResult(BaseModel):
    payload: dict
    usage: ModelUsage
    model: str
    latency_ms: int = Field(ge=0)


class PckmSynthesisProvider(Protocol):
    def resolve(self, candidate: ResolutionCandidate) -> PckmProviderResult:
        """Resolve one bounded candidate without changing source facts."""


class SheetFact(BaseModel):
    fact_id: str
    category: str
    raw: str
    normalized: Optional[str] = None
    numeric_value: Optional[float] = None
    unit: Optional[str] = None
    bbox: Optional[tuple[float, float, float, float]] = None
    confidence: float = Field(ge=0.0, le=1.0)
    status: str
    evidence_refs: list[str] = Field(default_factory=list)
    missing_evidence_refs: list[str] = Field(default_factory=list)
    attributes: dict[str, str] = Field(default_factory=dict)


class SheetCompletionState(BaseModel):
    """Completion metadata retained with a page patch for later quality checks."""

    sections_expected: int = Field(ge=0)
    sections_completed: int = Field(ge=0)
    is_complete: bool
    next_cursor: Optional[str] = None


class SheetKnowledgePatch(BaseModel):
    """Deterministic, page-scoped facts prepared for project synthesis."""

    sheet_id: str
    document_id: str
    project_id: str
    run_id: str
    page_index: int
    discipline: str
    completion: SheetCompletionState
    facts: list[SheetFact] = Field(default_factory=list)
    nodes: list[ProjectGraphNode] = Field(default_factory=list)
    edges: list[ProjectGraphEdge] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    unresolved_references: list[str] = Field(default_factory=list)
    dangling_evidence_refs: list[str] = Field(default_factory=list)
    missing_evidence_refs: list[str] = Field(default_factory=list)
    ambiguities: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    unclassified: list[str] = Field(default_factory=list)
