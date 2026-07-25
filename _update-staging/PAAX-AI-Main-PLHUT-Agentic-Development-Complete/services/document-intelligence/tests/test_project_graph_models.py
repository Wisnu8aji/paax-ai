from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.project_graph.models import (
    Citation,
    EdgeResolver,
    GraphQueryPlan,
    GroundedAnswer,
    NodeProperty,
    NodeSourceRef,
    ProjectGraphEdge,
    ProjectGraphNode,
    ProjectGraphSnapshot,
    RetrievalTrace,
    assert_single_located_on,
)


def test_project_graph_node_accepts_element_type_payload():
    node = ProjectGraphNode(
        node_id="ELTYPE-COLUMN-K1",
        type="element_type",
        canonical_name="Kolom K1",
        aliases=["K1", "Kol. K1"],
        properties={
            "shape": NodeProperty(value="rectangular", value_source="extracted", evidence_refs=[]),
            "b_mm": NodeProperty(value=300, value_source="extracted", evidence_refs=["EV-P049-121"]),
            "h_mm": NodeProperty(value=500, value_source="extracted", evidence_refs=["EV-P049-122"]),
        },
        discipline="structure",
        verification_status="ai_interpreted",
        confidence=0.92,
        source_refs=[
            NodeSourceRef(document_id="DOC-PLHUT-001", page_index=48, sheet_id="S-49", evidence_refs=["EV-P049-121", "EV-P049-122"]),
        ],
    )

    assert node.properties["b_mm"].value == 300
    assert node.properties["b_mm"].evidence_refs == ["EV-P049-121"]
    assert node.verification_status == "ai_interpreted"
    # Node stores the property VALUE as extracted, never a derived number -
    # cross_section_area_mm2 (b*h) would be a calculation, which belongs to
    # services/core-engine, never to a PCKM node property (Aturan Emas).
    assert "cross_section_area_mm2" not in node.properties


def test_project_graph_node_defaults_empty_aliases_and_properties():
    node = ProjectGraphNode(
        node_id="LEVEL-01",
        type="level",
        canonical_name="Lantai 1",
        discipline="general",
        verification_status="extracted",
        confidence=0.99,
    )

    assert node.aliases == []
    assert node.properties == {}
    assert node.source_refs == []


def test_project_graph_edge_accepts_instance_of_relation():
    edge = ProjectGraphEdge(
        edge_id="EDGE-001",
        source="ELOC-K1-L1-B2",
        target="ELTYPE-COLUMN-K1",
        relation="INSTANCE_OF",
        confidence_class="CROSS_SHEET_INFERRED",
        confidence=0.89,
        evidence_refs=["EV-P032-017", "EV-P049-121"],
        resolver=EdgeResolver(
            method="constraint_scored_binding_v2",
            resolver_version="2.0.0",
            candidates_considered=4,
            passed_constraints=["same_view"],
            failed_constraints=["distance"],
            rejected_candidate_ids=["ELOC-K1-L2-B2"],
            confidence_calibration={
                "ocr_score": 0.9,
                "detector_score": 0.95,
                "geometry_score": 0.8,
                "legend_score": 1.0,
                "schedule_score": 1.0,
                "consistency_score": 1.0,
                "calibrated_score": 0.855,
            },
        ),
    )

    assert edge.relation == "INSTANCE_OF"
    assert edge.confidence_class == "CROSS_SHEET_INFERRED"
    assert edge.resolver is not None
    assert edge.resolver.confidence_calibration is not None
    assert edge.resolver.confidence_calibration["calibrated_score"] == 0.855


def test_assert_single_located_on_passes_when_each_occurrence_has_one_location():
    edges = [
        ProjectGraphEdge(edge_id="E1", source="ELOC-K1-L1-B2", target="LEVEL-01", relation="LOCATED_ON", confidence_class="EXTRACTED", confidence=0.95),
        ProjectGraphEdge(edge_id="E2", source="ELOC-K1-L1-B2", target="ELTYPE-COLUMN-K1", relation="INSTANCE_OF", confidence_class="EXTRACTED", confidence=0.9),
        ProjectGraphEdge(edge_id="E3", source="ELOC-K2-L2-A1", target="LEVEL-02", relation="LOCATED_ON", confidence_class="EXTRACTED", confidence=0.95),
    ]

    # Should not raise - ELOC-K1-L1-B2 has exactly one LOCATED_ON (to LEVEL-01),
    # the INSTANCE_OF edge on the same node is a different relation and doesn't count.
    assert_single_located_on(edges)


def test_assert_single_located_on_raises_when_occurrence_has_two_locations():
    edges = [
        ProjectGraphEdge(edge_id="E1", source="ELOC-K1-L1-B2", target="LEVEL-01", relation="LOCATED_ON", confidence_class="EXTRACTED", confidence=0.95),
        ProjectGraphEdge(edge_id="E2", source="ELOC-K1-L1-B2", target="LEVEL-02", relation="LOCATED_ON", confidence_class="AMBIGUOUS", confidence=0.4),
    ]

    with pytest.raises(ValueError, match="ELOC-K1-L1-B2 has 2 active LOCATED_ON edges"):
        assert_single_located_on(edges)


def _make_valid_snapshot_kwargs() -> dict:
    return dict(
        schema_version="paax.pckm.graph.v1",
        project_id="PRJ-001",
        snapshot_id="PGS-001",
        document_ids=["DOC-PLHUT-001"],
        dem_run_ids=["DEMRUN-20260714-001"],
        page_count=88,
        nodes=[
            ProjectGraphNode(node_id="ELTYPE-COLUMN-K1", type="element_type", canonical_name="Kolom K1", discipline="structure", verification_status="extracted", confidence=0.9),
            ProjectGraphNode(node_id="LEVEL-01", type="level", canonical_name="Lantai 1", discipline="general", verification_status="extracted", confidence=0.99),
        ],
        edges=[
            ProjectGraphEdge(edge_id="E1", source="ELTYPE-COLUMN-K1", target="LEVEL-01", relation="LOCATED_ON", confidence_class="EXTRACTED", confidence=0.9),
        ],
    )


def test_project_graph_snapshot_accepts_valid_graph():
    snapshot = ProjectGraphSnapshot(**_make_valid_snapshot_kwargs())

    assert snapshot.snapshot_id == "PGS-001"
    assert len(snapshot.nodes) == 2
    assert snapshot.aliases == []
    assert snapshot.conflicts == []


def test_project_graph_snapshot_rejects_duplicate_located_on():
    kwargs = _make_valid_snapshot_kwargs()
    kwargs["edges"] = [
        ProjectGraphEdge(edge_id="E1", source="ELTYPE-COLUMN-K1", target="LEVEL-01", relation="LOCATED_ON", confidence_class="EXTRACTED", confidence=0.9),
        ProjectGraphEdge(edge_id="E2", source="ELTYPE-COLUMN-K1", target="LEVEL-02", relation="LOCATED_ON", confidence_class="AMBIGUOUS", confidence=0.3),
    ]

    with pytest.raises(ValidationError, match="active LOCATED_ON edges"):
        ProjectGraphSnapshot(**kwargs)


def test_graph_query_plan_accepts_element_lookup_intent():
    plan = GraphQueryPlan(
        intent="ELEMENT_LOOKUP",
        project_id="PRJ-001",
        entities=[{"type": "element_type", "value": "K1"}],
        filters={"level": None, "discipline": "structure"},
        relations=["INSTANCE_OF", "LOCATED_ON", "DEFINED_BY", "DEPICTED_IN"],
        traversal_mode="bfs",
        traversal_depth=2,
        budget_tokens=1400,
    )

    assert plan.intent == "ELEMENT_LOOKUP"
    assert plan.traversal_mode == "bfs"
    assert "INSTANCE_OF" in plan.relations


def test_graph_query_plan_rejects_unknown_relation():
    with pytest.raises(ValidationError):
        GraphQueryPlan(
            intent="SPACE_LOOKUP",
            project_id="PRJ-001",
            relations=["SERVED_BY"],
        )


def test_grounded_answer_carries_citations_and_retrieval_trace():
    answer = GroundedAnswer(
        answer="Kolom K1 ditemukan di lantai 1, grid B3.",
        citations=[
            Citation(citation_id="C1", document_id="DOC-PLHUT-001", sheet_id="S-49", page_number=49, title="Detail Kolom", evidence_ids=["EV-P049-121"]),
        ],
        data_status="grounded",
        confidence=0.91,
        missing_information=[],
        conflicts=[],
        retrieval_trace=RetrievalTrace(intent="ELEMENT_LOOKUP", seed_node_ids=["ELTYPE-COLUMN-K1"], node_count=8, edge_count=11, context_token_estimate=1120),
    )

    assert answer.data_status == "grounded"
    assert answer.citations[0].page_number == 49
    assert answer.retrieval_trace.context_token_estimate == 1120
    # Golden Rule: GroundedAnswer never carries a computed RAB/volume number -
    # only text, citations, and a confidence score about the retrieval itself.
    assert not hasattr(answer, "computed_volume_m3")
