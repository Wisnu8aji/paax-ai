from __future__ import annotations

import socket

from app.project_graph.models import ProjectGraphNode
from app.project_graph.synthesis_types import ModelUsage, PckmProviderResult
from app.transcription.models import (
    DemGeneration,
    DemSource,
    DrawingEvidenceSheet,
    EvidenceItem,
    InterpretedValue,
    ObservationValue,
    SheetCompletion,
    SheetIdentity,
    ValueWithEvidence,
)


def _sheet(
    page_index: int,
    code: str,
    *,
    level: str | None = None,
    space: str | None = None,
    title: str = "Synthetic sheet",
) -> DrawingEvidenceSheet:
    observations: dict[str, list[ObservationValue]] = {
        "element_labels": [
            ObservationValue(
                raw=code,
                normalized=code,
                confidence=0.95,
                evidence_refs=[f"EV-{page_index}-LABEL"],
            )
        ]
    }
    if level is not None:
        observations["levels"] = [
            ObservationValue(
                raw=level,
                normalized=level,
                confidence=0.9,
                evidence_refs=[f"EV-{page_index}-LEVEL"],
            )
        ]
    if space is not None:
        observations["spaces"] = [
            ObservationValue(
                raw=space,
                normalized=space,
                confidence=0.9,
                evidence_refs=[f"EV-{page_index}-SPACE"],
            )
        ]

    evidence = [
        EvidenceItem(
            evidence_id=evidence_id,
            kind="text",
            raw=evidence_id,
            confidence=1.0,
        )
        for evidence_id in (
            f"EV-{page_index}-LABEL",
            f"EV-{page_index}-LEVEL",
            f"EV-{page_index}-SPACE",
        )
    ]
    return DrawingEvidenceSheet(
        run_id="RUN-TEST",
        document_id="DOC-TEST",
        project_id="PROJECT-TEST",
        source=DemSource(
            document_hash="test-hash",
            file_name="synthetic.pdf",
            page_index=page_index,
            page_number=page_index + 1,
            render_uri=f"memory://page-{page_index}",
            width_px=1000,
            height_px=700,
        ),
        generation=DemGeneration(
            provider="test",
            model_alias="test-model",
            prompt_version="test-v1",
            started_at="2026-07-15T00:00:00Z",
        ),
        sheet_identity=SheetIdentity(
            sheet_number=ValueWithEvidence(
                value=f"S-{page_index + 1:02d}",
                confidence=0.9,
            ),
            title=ValueWithEvidence(value=title, confidence=0.9),
            discipline=InterpretedValue(
                value="Arsitektur",
                confidence=0.9,
                status="extracted",
            ),
        ),
        observations=observations,
        evidence=evidence,
        completion=SheetCompletion(
            sections_expected=1,
            sections_completed=1,
            is_complete=True,
        ),
    )


def _node(snapshot_nodes: list[ProjectGraphNode], node_type: str, name: str) -> ProjectGraphNode:
    return next(
        node
        for node in snapshot_nodes
        if node.type == node_type and node.canonical_name == name
    )


def _position_context(sheet: DrawingEvidenceSheet) -> None:
    sheet.observations.element_labels[0].bbox = (10.0, 10.0, 20.0, 20.0)
    sheet.observations.spaces[0].bbox = (24.0, 10.0, 34.0, 20.0)


def test_synthesis_merges_one_type_and_one_fully_contextual_occurrence():
    from app.project_graph.synthesis import synthesize_project_graph

    sheets = [
        _sheet(20, "J2", level="Lantai 1", space="Ruang A", title="DENAH LANTAI 1"),
        _sheet(21, "JENDELA (J2)", level="Lantai 1", space="Ruang A", title="DENAH LANTAI 1"),
        _sheet(26, "J2"),
    ]
    _position_context(sheets[0])
    _position_context(sheets[1])
    result = synthesize_project_graph(sheets)

    type_node = _node(result.snapshot.nodes, "element_type", "J2")
    occurrences = [
        node
        for node in result.snapshot.nodes
        if node.type == "element_occurrence" and node.canonical_name.startswith("J2 @")
    ]
    assert [source_ref.page_index for source_ref in type_node.source_refs] == [20, 21, 26]
    assert len(occurrences) == 1
    assert any(edge.relation == "SAME_AS" for edge in result.snapshot.edges)
    reference_node = next(
        node
        for node in result.snapshot.nodes
        if node.type == "drawing_reference" and node.canonical_name == "J2 on S-21"
    )
    sheet_node = next(
        node
        for node in result.snapshot.nodes
        if node.type == "sheet" and node.canonical_name == "S-21"
    )
    assert any(
        edge.source == reference_node.node_id
        and edge.target == sheet_node.node_id
        and edge.relation == "DEPICTED_IN"
        for edge in result.snapshot.edges
    )
    assert any(
        edge.source == occurrences[0].node_id and edge.relation == "INSTANCE_OF"
        for edge in result.snapshot.edges
    )
    assert sum(
        edge.source == occurrences[0].node_id and edge.relation == "LOCATED_ON"
        for edge in result.snapshot.edges
    ) == 1
    assert any("J2" in item and "context" in item.lower() for item in result.snapshot.missing_information)
    assert all(edge.resolver is not None for edge in result.snapshot.edges)


class _RecordingProvider:
    def __init__(self) -> None:
        self.candidates: list[object] = []

    def resolve(self, candidate: object) -> PckmProviderResult:
        self.candidates.append(candidate)
        return PckmProviderResult(
            payload={"decision": "merge", "rationale": "Review requested by policy."},
            usage=ModelUsage(),
            model="test-provider",
            latency_ms=1,
        )


def test_synthesis_preserves_alternate_contexts_as_ambiguous_provider_proposals():
    from app.project_graph.synthesis import synthesize_project_graph

    provider = _RecordingProvider()
    sheets = [
        _sheet(20, "J2", level="Lantai 1", space="Ruang A", title="DENAH LANTAI 1"),
        _sheet(21, "J2", level="Lantai 2", space="Ruang B", title="DENAH LANTAI 2"),
    ]
    for sheet in sheets:
        _position_context(sheet)
    result = synthesize_project_graph(sheets, provider=provider)

    occurrences = [node for node in result.snapshot.nodes if node.type == "element_occurrence"]
    assert len(occurrences) == 2
    assert len(provider.candidates) == 1
    assert len(result.provider_proposals) == 1
    assert any(
        edge.relation == "POSSIBLY_SAME_AS"
        and edge.confidence_class == "AMBIGUOUS"
        for edge in result.snapshot.edges
    )
    for occurrence in occurrences:
        assert sum(
            edge.source == occurrence.node_id and edge.relation == "LOCATED_ON"
            for edge in result.snapshot.edges
        ) == 1


def test_synthesis_scopes_same_named_spaces_to_their_respective_levels():
    from app.project_graph.synthesis import synthesize_project_graph

    sheets = [
        _sheet(20, "J2", level="Lantai 1", space="Lobby", title="DENAH LANTAI 1"),
        _sheet(21, "J2", level="Lantai 2", space="Lobby", title="DENAH LANTAI 2"),
    ]
    for sheet in sheets:
        _position_context(sheet)

    result = synthesize_project_graph(sheets)

    occurrences = [node for node in result.snapshot.nodes if node.type == "element_occurrence"]
    spaces = [
        node
        for node in result.snapshot.nodes
        if node.type == "space"
        and node.canonical_name == "Lobby"
        and node.node_id.startswith("SPACE-")
    ]
    located_in = {
        edge.source: edge.target
        for edge in result.snapshot.edges
        if edge.relation == "LOCATED_IN"
    }
    assert len(spaces) == 2
    assert len({space.node_id for space in spaces}) == 2
    assert {located_in[occurrence.node_id] for occurrence in occurrences} == {
        space.node_id for space in spaces
    }


def test_synthesis_uses_explicit_title_level_and_nearest_space_context():
    from app.project_graph.synthesis import synthesize_project_graph

    sheets = [
        _sheet(20, "J2", space="Ruang A", title="DENAH LANTAI 1"),
        _sheet(21, "J2", space="Ruang A", title="DENAH LANTAI 1"),
    ]
    for sheet in sheets:
        sheet.observations.element_labels[0].bbox = (10.0, 10.0, 20.0, 20.0)
        sheet.observations.spaces[0].bbox = (24.0, 10.0, 34.0, 20.0)
        sheet.observations.spaces.append(
            ObservationValue(
                raw="Ruang B",
                normalized="Ruang B",
                bbox=(200.0, 200.0, 220.0, 220.0),
                confidence=0.9,
            )
        )

    result = synthesize_project_graph(sheets)

    occurrence = _node(
        result.snapshot.nodes,
        "element_occurrence",
        "J2 @ Lantai 1 / Ruang A",
    )
    assert [source_ref.page_index for source_ref in occurrence.source_refs] == [20, 21]


def test_synthesis_merges_equivalent_context_display_variants_without_losing_aliases():
    from app.project_graph.synthesis import synthesize_project_graph

    sheets = [
        _sheet(20, "J2", level="Lantai 1", space="Area Tangga", title="DENAH LANTAI 1"),
        _sheet(21, "BV1", level="Lantai 1", space="Area tangga", title="DENAH LANTAI 1"),
    ]
    for sheet in sheets:
        _position_context(sheet)
    result = synthesize_project_graph(sheets)

    space = next(
        node
        for node in result.snapshot.nodes
        if node.type == "space" and node.node_id.startswith("SPACE-")
    )
    assert space.canonical_name == "Area Tangga"
    assert [source_ref.page_index for source_ref in space.source_refs] == [20, 21]
    assert "Area tangga" in space.aliases


def test_synthesis_leaves_an_equal_distance_space_tie_as_missing_information():
    from app.project_graph.synthesis import synthesize_project_graph

    sheet = _sheet(20, "J2", space="Ruang A", title="DENAH LANTAI 1")
    sheet.observations.element_labels[0].bbox = (10.0, 10.0, 20.0, 20.0)
    sheet.observations.spaces[0].bbox = (0.0, 10.0, 10.0, 20.0)
    sheet.observations.spaces.append(
        ObservationValue(
            raw="Ruang B",
            normalized="Ruang B",
            bbox=(20.0, 10.0, 30.0, 20.0),
            confidence=0.9,
        )
    )

    result = synthesize_project_graph([sheet])

    assert not [node for node in result.snapshot.nodes if node.type == "element_occurrence"]
    assert any("J2" in item and "spatial context" in item for item in result.snapshot.missing_information)


def test_synthesis_does_not_associate_an_unpositioned_label_with_the_only_space():
    from app.project_graph.synthesis import synthesize_project_graph

    result = synthesize_project_graph(
        [_sheet(20, "J2", level="Lantai 1", space="Ruang A", title="DENAH LANTAI 1")]
    )

    assert not [node for node in result.snapshot.nodes if node.type == "element_occurrence"]
    assert any("J2" in item and "spatial context" in item for item in result.snapshot.missing_information)


class _InvalidDecisionProvider:
    def resolve(self, candidate: object) -> PckmProviderResult:
        return PckmProviderResult(
            payload={"decision": "unsupported", "rationale": "Unsupported proposal."},
            usage=ModelUsage(),
            model="test-provider",
            latency_ms=1,
        )


def test_synthesis_rejects_an_unsupported_provider_decision_without_mutating_graph():
    from app.project_graph.synthesis import synthesize_project_graph

    sheets = [
        _sheet(20, "J2", level="Lantai 1", space="Ruang A", title="DENAH LANTAI 1"),
        _sheet(21, "J2", level="Lantai 2", space="Ruang B", title="DENAH LANTAI 2"),
    ]
    for sheet in sheets:
        _position_context(sheet)
    result = synthesize_project_graph(sheets, provider=_InvalidDecisionProvider())

    assert len(result.provider_proposals) == 1
    assert result.provider_proposals[0].error == "unsupported provider decision"
    assert any(edge.relation == "POSSIBLY_SAME_AS" for edge in result.snapshot.edges)


class _ReviewDecisionProvider:
    def resolve(self, candidate: object) -> PckmProviderResult:
        return PckmProviderResult(
            payload={
                "decision": "requires_review",
                "rationale": "Two spatial contexts are plausible.",
            },
            usage=ModelUsage(),
            model="review-provider-v1",
            prompt_version="pckm-resolution-v1",
            latency_ms=1,
        )


def test_synthesis_records_provider_review_as_a_noncanonical_ambiguous_edge():
    from app.project_graph.synthesis import synthesize_project_graph

    sheets = [
        _sheet(20, "J2", level="Lantai 1", space="Ruang A", title="DENAH LANTAI 1"),
        _sheet(21, "J2", level="Lantai 2", space="Ruang B", title="DENAH LANTAI 2"),
    ]
    for sheet in sheets:
        _position_context(sheet)

    result = synthesize_project_graph(sheets, provider=_ReviewDecisionProvider())

    provider_edges = [
        edge
        for edge in result.snapshot.edges
        if edge.resolver is not None and edge.resolver.method == "provider_review_proposal"
    ]
    assert len(provider_edges) == 1
    assert provider_edges[0].relation == "POSSIBLY_SAME_AS"
    assert provider_edges[0].confidence_class == "AMBIGUOUS"
    assert provider_edges[0].resolver.model == "review-provider-v1"
    assert len(result.provider_proposals) == 1
    assert result.provider_proposals[0].error is None


def test_synthesis_keeps_same_code_labels_on_one_sheet_as_distinct_occurrence_sources():
    from app.project_graph.synthesis import synthesize_project_graph

    sheet = _sheet(20, "J2", space="Ruang A", title="DENAH LANTAI 1")
    _position_context(sheet)
    sheet.observations.element_labels.append(
        ObservationValue(
            raw="J2",
            normalized="J2",
            bbox=(200.0, 10.0, 210.0, 20.0),
            confidence=0.95,
            evidence_refs=["EV-20-LABEL-SECOND"],
        )
    )
    sheet.observations.spaces.append(
        ObservationValue(
            raw="Ruang B",
            normalized="Ruang B",
            bbox=(214.0, 10.0, 224.0, 20.0),
            confidence=0.9,
            evidence_refs=["EV-20-SPACE-SECOND"],
        )
    )
    sheet.evidence.extend(
        [
            EvidenceItem(
                evidence_id="EV-20-LABEL-SECOND",
                kind="text",
                raw="J2",
                confidence=1.0,
            ),
            EvidenceItem(
                evidence_id="EV-20-SPACE-SECOND",
                kind="text",
                raw="Ruang B",
                confidence=1.0,
            ),
        ]
    )

    result = synthesize_project_graph([sheet])

    occurrences = [node for node in result.snapshot.nodes if node.type == "element_occurrence"]
    assert {node.canonical_name for node in occurrences} == {
        "J2 @ Lantai 1 / Ruang A",
        "J2 @ Lantai 1 / Ruang B",
    }
    assert {
        evidence_ref
        for occurrence in occurrences
        for source_ref in occurrence.source_refs
        for evidence_ref in source_ref.evidence_refs
    } == {"EV-20-LABEL", "EV-20-LABEL-SECOND"}


def test_synthesis_snapshot_id_changes_when_graph_content_changes():
    from app.project_graph.synthesis import synthesize_project_graph

    baseline = _sheet(20, "J2", level="Lantai 1", space="Ruang A", title="DENAH LANTAI 1")
    changed = _sheet(20, "J2", level="Lantai 1", space="Ruang A", title="DENAH LANTAI 1")
    _position_context(baseline)
    _position_context(changed)
    changed.observations.element_labels[0].confidence = 0.72

    first = synthesize_project_graph([baseline])
    second = synthesize_project_graph([changed])

    assert first.snapshot.nodes[0].node_id == second.snapshot.nodes[0].node_id
    assert first.snapshot.snapshot_id != second.snapshot.snapshot_id


def test_synthesis_exposes_full_community_membership_for_persistence():
    from app.project_graph.synthesis import synthesize_project_graph

    sheet = _sheet(20, "J2", level="Lantai 1", space="Ruang A", title="DENAH LANTAI 1")
    _position_context(sheet)

    result = synthesize_project_graph([sheet])

    assert result.communities
    assert result.snapshot.communities == [community.community_id for community in result.communities]
    assert all(community.node_ids for community in result.communities)


def test_synthesis_uses_no_network_when_a_provider_is_not_explicitly_supplied(monkeypatch):
    from app.project_graph.synthesis import synthesize_project_graph

    def _network_forbidden(*_args, **_kwargs):
        raise AssertionError("default synthesis must not open a network connection")

    monkeypatch.setattr(socket, "create_connection", _network_forbidden)
    sheet = _sheet(20, "J2", level="Lantai 1", space="Ruang A", title="DENAH LANTAI 1")
    _position_context(sheet)

    result = synthesize_project_graph([sheet])

    assert result.provider_proposals == ()
