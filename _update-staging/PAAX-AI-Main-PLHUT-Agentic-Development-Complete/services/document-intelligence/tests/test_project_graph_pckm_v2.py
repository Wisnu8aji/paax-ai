from app.project_graph.summary_builder import compile_level_overview
from app.project_graph.synthesis import synthesize_project_graph
from app.transcription.models import EvidenceItem, ObservationValue

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from test_project_graph_synthesis import _position_context, _sheet


def _add_symbol(sheet, *, status: str = "extracted") -> None:
    evidence_id = f"EV-{sheet.source.page_index}-SYMBOL"
    sheet.observations.symbols.append(
        ObservationValue(
            raw="door-symbol",
            normalized="door-symbol",
            bbox=(12.0, 12.0, 22.0, 22.0),
            confidence=0.95,
            status=status,
            evidence_refs=[evidence_id],
        )
    )
    sheet.evidence.append(
        EvidenceItem(evidence_id=evidence_id, kind="geometry", raw=evidence_id, confidence=1.0)
    )


def _position_with_level(sheet):
    _position_context(sheet)
    sheet.observations.levels[0].bbox = (24.0, 30.0, 34.0, 40.0)


def test_schedule_row_does_not_create_physical_element():
    sheet = _sheet(100, "D1", level="Lantai 1", space="Ruang A", has_table=True)
    _position_with_level(sheet)
    _add_symbol(sheet)

    result = synthesize_project_graph([sheet])

    assert not [
        node for node in result.snapshot.nodes
        if node.type in {"physical_element_candidate", "physical_element"}
    ]


def test_plan_label_without_symbol_is_context_group_only():
    sheet = _sheet(101, "D1", level="Lantai 1", space="Ruang A")
    _position_with_level(sheet)

    result = synthesize_project_graph([sheet])

    occurrence = next(node for node in result.snapshot.nodes if node.type == "element_occurrence")
    assert occurrence.properties["occurrence_semantics"].value == "context_group_not_physical"
    assert occurrence.properties["physical_count_eligible"].value is False
    assert not [node for node in result.snapshot.nodes if node.type == "physical_element_candidate"]


def test_symbol_type_level_and_locator_create_physical_candidate():
    sheet = _sheet(102, "D1", level="Lantai 1", space="Ruang A")
    _position_with_level(sheet)
    _add_symbol(sheet)

    result = synthesize_project_graph([sheet])

    candidate = next(node for node in result.snapshot.nodes if node.type == "physical_element_candidate")
    assert candidate.properties["view_id"].value == "S-103"
    assert candidate.properties["level"].value == "Lantai 1"
    assert candidate.properties["spatial_locator"].value == "Ruang A"
    assert candidate.properties["physical_count_eligible"].value is False
    assert any(
        edge.source == candidate.node_id and edge.relation == "INSTANCE_OF"
        for edge in result.snapshot.edges
    )


def test_human_verified_basis_promotes_candidate_to_verified_physical():
    sheet = _sheet(103, "D1", level="Lantai 1", space="Ruang A")
    _position_with_level(sheet)
    _add_symbol(sheet, status="human_verified")
    sheet.observations.element_labels[0].status = "human_verified"
    sheet.observations.levels[0].status = "human_verified"
    sheet.observations.spaces[0].status = "human_verified"

    result = synthesize_project_graph([sheet])

    verified = next(node for node in result.snapshot.nodes if node.type == "physical_element")
    assert verified.verification_status == "human_verified"
    assert verified.properties["physical_count_eligible"].value is True
    assert result.audit.verified_physical_count == 1


def test_physical_count_excludes_context_groups_and_references():
    sheet = _sheet(104, "D1", level="Lantai 1", space="Ruang A")
    _position_with_level(sheet)
    _add_symbol(sheet, status="human_verified")
    sheet.observations.element_labels[0].status = "human_verified"
    sheet.observations.levels[0].status = "human_verified"
    sheet.observations.spaces[0].status = "human_verified"

    result = synthesize_project_graph([sheet])
    level = next(node for node in result.snapshot.nodes if node.type == "level")
    view = compile_level_overview(result.snapshot, level.node_id)

    assert view.summary.context_group_count == 1
    assert view.summary.physical_candidate_count == 1
    assert view.summary.verified_physical_count == 1
    assert view.summary.element_type_index[0].occurrence_count == 1
    assert view.summary.verified_physical_count == 1
