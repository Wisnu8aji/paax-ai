from __future__ import annotations

from app.project_graph.models import (
    NodeProperty,
    NodeSourceRef,
    ProjectGraphNode,
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
