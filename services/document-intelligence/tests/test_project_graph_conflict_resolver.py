from __future__ import annotations

from app.project_graph.conflict_resolver import ConflictResolution, resolve_conflicts
from app.project_graph.models import NodeProperty, NodeSourceRef, ProjectGraphNode
from app.project_graph.synthesis_types import SheetCompletionState, SheetKnowledgePatch


def _page_81_patch() -> SheetKnowledgePatch:
    return SheetKnowledgePatch(
        sheet_id="S-81",
        document_id="DOC-PLHUT-001",
        project_id="PRJ-PLHUT-001",
        run_id="DEMRUN-001",
        page_index=80,
        discipline="structure",
        completion=SheetCompletionState(
            sections_expected=1,
            sections_completed=1,
            is_complete=True,
        ),
        nodes=[
            ProjectGraphNode(
                node_id="DIM-P081-20250",
                type="dimension",
                canonical_name="000",
                properties={
                    "raw": NodeProperty(value="20250", evidence_refs=["EV-P081-DIM-01"]),
                },
                discipline="structure",
                verification_status="conflicting",
                confidence=0.91,
                source_refs=[
                    NodeSourceRef(
                        document_id="DOC-PLHUT-001",
                        page_index=80,
                        sheet_id="S-81",
                        evidence_refs=["EV-P081-DIM-01"],
                    )
                ],
            ),
            ProjectGraphNode(
                node_id="DIM-P081-20000",
                type="dimension",
                canonical_name="001",
                properties={
                    "raw": NodeProperty(value="20000", evidence_refs=["EV-P081-DIM-02"]),
                },
                discipline="structure",
                verification_status="conflicting",
                confidence=0.87,
                source_refs=[
                    NodeSourceRef(
                        document_id="DOC-PLHUT-001",
                        page_index=80,
                        sheet_id="S-81",
                        evidence_refs=["EV-P081-DIM-02"],
                    )
                ],
            ),
        ],
        conflicts=["Page 81 source conflict: dimension observations 20250mm and 20000 mm."],
        dangling_evidence_refs=["EV-P081-DIM-DANGLING"],
        missing_evidence_refs=["EV-P081-DIM-MISSING"],
    )


def _unrelated_patch() -> SheetKnowledgePatch:
    return SheetKnowledgePatch(
        sheet_id="S-01",
        document_id="DOC-PLHUT-001",
        project_id="PRJ-PLHUT-001",
        run_id="DEMRUN-001",
        page_index=0,
        discipline="architecture",
        completion=SheetCompletionState(
            sections_expected=1,
            sections_completed=1,
            is_complete=True,
        ),
    )


def test_resolve_conflicts_lifts_page_81_dimension_conflict_without_changing_observations():
    patch = _page_81_patch()

    resolution = resolve_conflicts([patch])

    assert isinstance(resolution, ConflictResolution)
    assert len(resolution.nodes) == 1
    conflict_node = resolution.nodes[0]
    assert conflict_node.type == "conflict"
    assert conflict_node.verification_status == "conflicting"
    assert conflict_node.properties["conflict_statement"].value == (
        "Page 81 source conflict: dimension observations 20250mm and 20000 mm."
    )
    assert [
        conflict_node.properties[key].value
        for key in sorted(conflict_node.properties)
        if key.startswith("observed_value_")
    ] == ["20000", "20250"]
    assert conflict_node.properties["dangling_evidence_refs"].value == "EV-P081-DIM-DANGLING"
    assert conflict_node.properties["missing_evidence_refs"].value == "EV-P081-DIM-MISSING"
    assert conflict_node.properties["dangling_evidence_refs"].evidence_refs == []
    assert conflict_node.properties["missing_evidence_refs"].evidence_refs == []

    assert {(edge.relation, edge.target) for edge in resolution.edges} == {
        ("CONFLICTS_WITH", "DIM-P081-20000"),
        ("CONFLICTS_WITH", "DIM-P081-20250"),
    }
    assert {tuple(edge.evidence_refs) for edge in resolution.edges} == {
        ("EV-P081-DIM-01",),
        ("EV-P081-DIM-02",),
    }


def test_resolve_conflicts_is_stable_when_patch_order_changes():
    page_81 = _page_81_patch()
    unrelated = _unrelated_patch()

    forward = resolve_conflicts([page_81, unrelated])
    reverse = resolve_conflicts([unrelated, page_81])

    assert forward.model_dump() == reverse.model_dump()
    assert forward.nodes[0].node_id == reverse.nodes[0].node_id
    assert forward.edges[0].edge_id == reverse.edges[0].edge_id
