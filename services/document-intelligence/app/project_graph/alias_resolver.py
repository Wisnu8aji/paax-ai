"""Deterministic element-type alias resolution for project-graph synthesis."""

from __future__ import annotations

import json
from hashlib import sha256
from typing import Sequence

from pydantic import BaseModel, Field

from app.project_graph.models import NodeSourceRef, ProjectGraphNode
from app.project_graph.normalizer import normalize_discipline, normalize_element_code
from app.project_graph.synthesis_types import SheetKnowledgePatch


class AliasResolution(BaseModel):
    """Public, provider-free result consumed by a later synthesis orchestrator."""

    project_id: str
    nodes: list[ProjectGraphNode] = Field(default_factory=list)
    alias_to_node_id: dict[str, str] = Field(default_factory=dict)
    evidence_refs: dict[str, list[str]] = Field(default_factory=dict)


def resolve_aliases(patches: Sequence[SheetKnowledgePatch]) -> AliasResolution:
    """Merge element-label nodes by normalized discipline and element code."""

    if not patches:
        return AliasResolution(project_id="")

    project_ids = sorted({patch.project_id for patch in patches})
    project_id = project_ids[0] if len(project_ids) == 1 else "|".join(project_ids)
    grouped: dict[tuple[str, str], list[ProjectGraphNode]] = {}

    for patch in patches:
        for node in patch.nodes:
            if node.type != "element_type":
                continue
            discipline = normalize_discipline(node.discipline or patch.discipline)
            code = normalize_element_code(node.canonical_name)
            if not code:
                for alias in node.aliases:
                    code = normalize_element_code(alias)
                    if code:
                        break
            if code:
                grouped.setdefault((discipline, code), []).append(node)

    nodes: list[ProjectGraphNode] = []
    evidence_by_node: dict[str, list[str]] = {}
    alias_targets: dict[str, set[str]] = {}

    for (discipline, code), sources in sorted(grouped.items()):
        node_id = _stable_node_id(project_id, discipline, code)
        aliases = sorted(
            {value for source in sources for value in [source.canonical_name, *source.aliases] if value},
            key=lambda value: (value.casefold(), value),
        )
        source_refs = _merge_source_refs(sources)
        evidence_refs = sorted(
            {
                evidence_ref
                for source in sources
                for source_ref in source.source_refs
                for evidence_ref in source_ref.evidence_refs
            }
        )
        representative = sorted(sources, key=lambda source: (source.node_id, source.canonical_name))[0]
        canonical = ProjectGraphNode(
            node_id=node_id,
            type="element_type",
            canonical_name=code,
            aliases=aliases,
            discipline=discipline,
            verification_status=representative.verification_status,
            confidence=min(source.confidence for source in sources),
            source_refs=source_refs,
        )
        nodes.append(canonical)
        evidence_by_node[node_id] = evidence_refs
        for alias in {code, *(normalize_element_code(value) for value in aliases)}:
            if alias:
                alias_targets.setdefault(alias, set()).add(node_id)

    alias_to_node_id = {
        alias: next(iter(node_ids))
        for alias, node_ids in sorted(alias_targets.items())
        if len(node_ids) == 1
    }
    return AliasResolution(
        project_id=project_id,
        nodes=nodes,
        alias_to_node_id=alias_to_node_id,
        evidence_refs=evidence_by_node,
    )


def _stable_node_id(project_id: str, discipline: str, code: str) -> str:
    canonical_input = json.dumps(
        sorted(
            (
                ("project_id", project_id),
                ("discipline", discipline),
                ("code", code),
            )
        ),
        separators=(",", ":"),
    )
    digest = sha256(canonical_input.encode("utf-8")).hexdigest().upper()
    return f"ELTYPE-{digest}"


def _merge_source_refs(sources: Sequence[ProjectGraphNode]) -> list[NodeSourceRef]:
    refs = {
        (
            source_ref.document_id,
            source_ref.page_index,
            source_ref.sheet_id,
            tuple(sorted(set(source_ref.evidence_refs))),
        )
        for source in sources
        for source_ref in source.source_refs
    }
    return [
        NodeSourceRef(
            document_id=document_id,
            page_index=page_index,
            sheet_id=sheet_id,
            evidence_refs=list(evidence_refs),
        )
        for document_id, page_index, sheet_id, evidence_refs in sorted(refs)
    ]
