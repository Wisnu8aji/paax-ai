from __future__ import annotations

import pytest

from app.project_graph.models import (
    NodeProperty,
    NodeSourceRef,
    ProjectGraphEdge,
    ProjectGraphNode,
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
    )

    assert edge.relation == "INSTANCE_OF"
    assert edge.confidence_class == "CROSS_SHEET_INFERRED"


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
