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
    dimensions: list[tuple[str, tuple[float, float, float, float]]] | None = None,
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
    if dimensions:
        observations["dimensions"] = [
            ObservationValue(
                raw=value,
                normalized=value,
                bbox=bbox,
                confidence=0.99,
                evidence_refs=[f"EV-{page_index}-DIM-{index}"],
            )
            for index, (value, bbox) in enumerate(dimensions)
        ]
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

    evidence_ids = [f"EV-{page_index}-LABEL", f"EV-{page_index}-LEVEL", f"EV-{page_index}-SPACE"]
    if dimensions:
        evidence_ids.extend(f"EV-{page_index}-DIM-{index}" for index in range(len(dimensions)))
    evidence = [
        EvidenceItem(
            evidence_id=evidence_id,
            kind="text",
            raw=evidence_id,
            confidence=1.0,
        )
        for evidence_id in evidence_ids
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
    assert len(occurrences) == 2
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
    assert not any("J2" in item and "context" in item.lower() for item in result.snapshot.missing_information)
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


def test_synthesis_groups_context_deficient_occurrence_when_contextual_exists_cross_sheet():
    from app.project_graph.synthesis import synthesize_project_graph

    sheets = [
        _sheet(0, "J2", level="Lantai 1", space="Ruang A", title="DENAH LANTAI 1"),
        _sheet(1, "J2"),
    ]
    _position_context(sheets[0])
    result = synthesize_project_graph(sheets)

    occurrences = [
        node
        for node in result.snapshot.nodes
        if node.type == "element_occurrence" and node.canonical_name.startswith("J2 @")
    ]
    assert len(occurrences) == 2

    occ_real = next(o for o in occurrences if "Lantai 1" in o.canonical_name)
    occ_generic = next(o for o in occurrences if "Lantai Tidak Terpetakan" in o.canonical_name)

    assert occ_real.confidence == 0.95
    assert occ_generic.confidence == 0.475
    assert occ_generic.properties["level"].value == "Lantai Tidak Terpetakan (S-02 hal. 2)"
    assert occ_generic.properties["space"].value == "Ruang Tidak Terpetakan (S-02 hal. 2)"

    assert any(
        (edge.source == occ_real.node_id and edge.target == occ_generic.node_id and edge.relation == "POSSIBLY_SAME_AS") or
        (edge.source == occ_generic.node_id and edge.target == occ_real.node_id and edge.relation == "POSSIBLY_SAME_AS")
        for edge in result.snapshot.edges
    )
    assert not any("J2" in item and "context" in item.lower() for item in result.snapshot.missing_information)


def test_synthesis_groups_partially_contextual_occurrence_with_fallback_space():
    from app.project_graph.synthesis import synthesize_project_graph

    sheets = [
        _sheet(0, "J2", level="Lantai 1", space="Ruang A", title="DENAH LANTAI 1"),
        _sheet(1, "J2", level="Lantai 1", title="DENAH LANTAI 1"),
    ]
    _position_context(sheets[0])
    result = synthesize_project_graph(sheets)

    occurrences = [
        node
        for node in result.snapshot.nodes
        if node.type == "element_occurrence" and node.canonical_name.startswith("J2 @")
    ]
    assert len(occurrences) == 2

    occ_real = next(o for o in occurrences if "Ruang A" in o.canonical_name)
    occ_generic = next(o for o in occurrences if "Ruang Tidak Terpetakan" in o.canonical_name)

    assert occ_real.confidence == 0.95
    assert occ_generic.confidence == 0.665
    assert occ_generic.properties["level"].value == "Lantai 1"
    assert occ_generic.properties["space"].value == "Ruang Tidak Terpetakan"

    assert any(
        (edge.source == occ_real.node_id and edge.target == occ_generic.node_id and edge.relation == "POSSIBLY_SAME_AS") or
        (edge.source == occ_generic.node_id and edge.target == occ_real.node_id and edge.relation == "POSSIBLY_SAME_AS")
        for edge in result.snapshot.edges
    )


def test_synthesis_does_not_merge_unmapped_occurrences_across_different_sheets():
    from app.project_graph.synthesis import synthesize_project_graph

    sheets = [
        _sheet(0, "J2", level="Lantai 1", space="Ruang A", title="DENAH LANTAI 1"),
        _sheet(1, "J2"),
        _sheet(2, "J2"),
    ]
    _position_context(sheets[0])
    result = synthesize_project_graph(sheets)

    occurrences = [
        node
        for node in result.snapshot.nodes
        if node.type == "element_occurrence" and node.canonical_name.startswith("J2 @")
    ]
    assert len(occurrences) == 3

    occ_names = {o.canonical_name for o in occurrences}
    assert "J2 @ Lantai 1 / Ruang A" in occ_names
    assert "J2 @ Lantai Tidak Terpetakan (S-02 hal. 2) / Ruang Tidak Terpetakan (S-02 hal. 2)" in occ_names
    assert "J2 @ Lantai Tidak Terpetakan (S-03 hal. 3) / Ruang Tidak Terpetakan (S-03 hal. 3)" in occ_names




def test_synthesis_links_unambiguous_nearest_dimension_to_element_reference():
    """Anchor case computed manually from the real 88-page PLHUT fixture,
    page 20: dimension "1500" at [455,135,490,150] sits 37.5 units from the
    aligned BV1 label at [455,170,490,190] and 83.85 units from a different
    -column BV1 at [530,170,565,190] -- both real distances from the fixture
    JSON, not invented. The aligned one must win; the other must not."""
    from app.project_graph.synthesis import synthesize_project_graph

    sheet = _sheet(
        20,
        "BV1",
        dimensions=[("1500", (455.0, 135.0, 490.0, 150.0))],
    )
    sheet.observations.element_labels[0].bbox = (455.0, 170.0, 490.0, 190.0)

    result = synthesize_project_graph([sheet])

    reference_node = next(
        node for node in result.snapshot.nodes if node.type == "drawing_reference"
    )
    dimension_node = next(
        node for node in result.snapshot.nodes if node.type == "dimension"
    )
    has_dimension_edges = [
        edge for edge in result.snapshot.edges if edge.relation == "HAS_DIMENSION"
    ]
    assert len(has_dimension_edges) == 1
    assert has_dimension_edges[0].source == reference_node.node_id
    assert has_dimension_edges[0].target == dimension_node.node_id
    assert dimension_node.canonical_name == "1500"


def test_synthesis_does_not_link_a_dimension_when_two_elements_are_equidistant():
    """Conservative tie-break: if the nearest dimension is exactly equidistant
    from two dimension facts (or from ambiguous element placement), no
    HAS_DIMENSION edge is created -- matches _nearest_value's tie behavior
    elsewhere in this resolver."""
    from app.project_graph.synthesis import synthesize_project_graph

    sheet = _sheet(
        20,
        "BV1",
        dimensions=[
            ("1500", (400.0, 100.0, 435.0, 115.0)),
            ("1625", (400.0, 240.0, 435.0, 255.0)),
        ],
    )
    # Elemen tepat di tengah dua dimensi -- jarak identik ke keduanya (tie).
    sheet.observations.element_labels[0].bbox = (400.0, 170.0, 435.0, 185.0)

    result = synthesize_project_graph([sheet])

    has_dimension_edges = [
        edge for edge in result.snapshot.edges if edge.relation == "HAS_DIMENSION"
    ]
    assert has_dimension_edges == []


def test_synthesis_does_not_link_a_dimension_farther_than_the_page_scale_cutoff():
    """A lone dimension elsewhere on the sheet must never be claimed as
    "nearest" just because it's the only candidate -- distance must also be
    within a page-scale-derived cutoff (matches the real fixture's page 20
    coordinate range of roughly 1400x600 units, where genuinely related
    element/dimension pairs sit tens of units apart, not hundreds)."""
    from app.project_graph.synthesis import synthesize_project_graph

    sheet = _sheet(
        20,
        "BV1",
        dimensions=[("1500", (1600.0, 600.0, 1635.0, 615.0))],
    )
    sheet.observations.element_labels[0].bbox = (400.0, 170.0, 435.0, 185.0)

    result = synthesize_project_graph([sheet])

    has_dimension_edges = [
        edge for edge in result.snapshot.edges if edge.relation == "HAS_DIMENSION"
    ]
    assert has_dimension_edges == []


def test_synthesis_links_a_reference_callout_to_the_exact_matching_sheet_title():
    """Cross-page detail/section callouts (e.g. "POTONGAN A" printed on one
    sheet, pointing at a different sheet actually titled "POTONGAN A") should
    resolve to a REFERENCES edge -- exact title match only, never a guess."""
    from app.project_graph.synthesis import synthesize_project_graph

    referencing_sheet = _sheet(10, "J2", title="DENAH LANTAI 1")
    referencing_sheet.observations.references = [
        ObservationValue(raw="POTONGAN A", normalized="POTONGAN A", confidence=1.0, evidence_refs=["EV-10-REF"]),
    ]
    referencing_sheet.evidence.append(
        EvidenceItem(evidence_id="EV-10-REF", kind="text", raw="EV-10-REF", confidence=1.0)
    )
    target_sheet = _sheet(11, "BV1", title="POTONGAN A")

    result = synthesize_project_graph([referencing_sheet, target_sheet])

    reference_edges = [edge for edge in result.snapshot.edges if edge.relation == "REFERENCES"]
    assert len(reference_edges) == 1
    target_sheet_node = next(
        node for node in result.snapshot.nodes if node.type == "sheet" and node.canonical_name == "S-12"
    )
    assert reference_edges[0].target == target_sheet_node.node_id
    assert not any(
        "unresolved reference POTONGAN A" in item for item in result.snapshot.missing_information
    )


def test_synthesis_does_not_link_a_reference_that_only_names_its_own_sheet():
    """Real fixture behavior (page 14 of the 88-page PLHUT set): a sheet
    titled "POTONGAN A" that also lists "POTONGAN A" in its own unresolved
    references is a self-annotation (e.g. a section-cut callout label on the
    same drawing), not a cross-page reference -- must NOT self-link."""
    from app.project_graph.synthesis import synthesize_project_graph

    sheet = _sheet(13, "BV1", title="POTONGAN A")
    sheet.observations.references = [
        ObservationValue(raw="POTONGAN A", normalized="POTONGAN A", confidence=1.0, evidence_refs=["EV-13-REF"]),
    ]
    sheet.evidence.append(EvidenceItem(evidence_id="EV-13-REF", kind="text", raw="EV-13-REF", confidence=1.0))

    result = synthesize_project_graph([sheet])

    reference_edges = [edge for edge in result.snapshot.edges if edge.relation == "REFERENCES"]
    assert reference_edges == []
    assert any(
        "unresolved reference POTONGAN A" in item for item in result.snapshot.missing_information
    )


def test_synthesis_excludes_raw_per_page_level_nodes_keeping_only_the_deduplicated_one():
    """Regression test for a real accuracy gap on the 88-page PLHUT fixture:
    every page mentioning a level observation produced its own "level" node
    (id prefix NODE-), even when unrelated to the actual floor (the "levels"
    observation category also captures ramp/roof/elevation markers). Measured
    156 such raw nodes for a project with only 12 genuinely distinct levels.
    None of them ever got a LOCATED_ON edge from an occurrence -- only
    cross_sheet_resolver's deduplicated _level_node() (id prefix LEVEL-) does.
    Raw level nodes must be excluded from synthesis output the same way
    element_type raw nodes already are."""
    from app.project_graph.synthesis import synthesize_project_graph

    sheets = [
        _sheet(20, "J2", level="Lantai 1", space="Ruang A", title="DENAH LANTAI 1"),
        _sheet(21, "J2", level="Lantai 1", space="Ruang A", title="DENAH LANTAI 1"),
    ]
    for sheet in sheets:
        _position_context(sheet)

    result = synthesize_project_graph(sheets)

    level_nodes = [node for node in result.snapshot.nodes if node.type == "level"]
    # Exactly one deduplicated level node for "Lantai 1", not two raw
    # per-page mentions.
    assert len(level_nodes) == 1
    assert level_nodes[0].canonical_name == "Lantai 1"
    assert level_nodes[0].node_id.startswith("LEVEL-")
