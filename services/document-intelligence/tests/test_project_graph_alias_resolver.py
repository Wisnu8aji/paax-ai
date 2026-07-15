from __future__ import annotations

from app.project_graph.alias_resolver import resolve_aliases
from app.project_graph.models import NodeSourceRef, ProjectGraphNode
from app.project_graph.synthesis_types import SheetCompletionState, SheetKnowledgePatch


def _patch(sheet_id: str, page_index: int, label: str, evidence_ref: str) -> SheetKnowledgePatch:
    return SheetKnowledgePatch(
        sheet_id=sheet_id,
        document_id="DOC-SYNTHETIC",
        project_id="PROJECT-SYNTHETIC",
        run_id="RUN-SYNTHETIC",
        page_index=page_index,
        discipline="struktur",
        completion=SheetCompletionState(sections_expected=1, sections_completed=1, is_complete=True),
        nodes=[
            ProjectGraphNode(
                node_id=f"SOURCE-{sheet_id}-{label}",
                type="element_type",
                canonical_name=label,
                aliases=[label.lower(), f"JENDELA ({label.upper()})"],
                discipline="struktur",
                verification_status="extracted",
                confidence=0.9,
                source_refs=[
                    NodeSourceRef(
                        document_id="DOC-SYNTHETIC",
                        page_index=page_index,
                        sheet_id=sheet_id,
                        evidence_refs=[evidence_ref],
                    )
                ],
            )
        ],
    )


def test_repeated_j2_across_sheets_produces_one_canonical_type_and_preserves_sources():
    result = resolve_aliases(
        [
            _patch("S-22", 22, "J2", "EV-22-J2"),
            _patch("S-21", 21, "j-2", "EV-21-J2"),
        ]
    )

    assert len(result.nodes) == 1
    node = result.nodes[0]
    assert node.type == "element_type"
    assert node.canonical_name == "J2"
    assert node.discipline == "structure"
    assert {"j2", "j-2", "JENDELA (J2)", "JENDELA (J-2)"}.issubset(node.aliases)
    assert [ref.page_index for ref in node.source_refs] == [21, 22]
    assert result.alias_to_node_id["J2"] == node.node_id
    assert set(result.evidence_refs[node.node_id]) == {"EV-21-J2", "EV-22-J2"}


def test_equivalent_patch_order_has_identical_serialized_resolution_and_stable_sha_id():
    patches = [
        _patch("S-23", 23, "BV1", "EV-23-BV1"),
        _patch("S-56", 56, "RB3", "EV-56-RB3"),
        _patch("S-27", 27, "J2", "EV-27-J2"),
    ]

    forward = resolve_aliases(patches)
    reverse = resolve_aliases(list(reversed(patches)))

    assert forward.model_dump(mode="json") == reverse.model_dump(mode="json")
    assert forward.nodes[0].node_id.startswith("ELTYPE-")
    assert len({node.node_id for node in forward.nodes}) == 3


def test_canonical_type_id_is_scoped_to_the_project():
    project_one = _patch("S-01", 0, "J2", "EV-01-J2")
    project_two = project_one.model_copy(
        update={
            "project_id": "PROJECT-OTHER",
            "document_id": "DOC-OTHER",
            "sheet_id": "S-02",
            "page_index": 1,
        }
    )

    first = resolve_aliases([project_one])
    second = resolve_aliases([project_two])

    assert first.nodes[0].canonical_name == second.nodes[0].canonical_name == "J2"
    assert first.nodes[0].node_id != second.nodes[0].node_id
