from __future__ import annotations

import fitz

from app.drawing_intelligence.models import BBox
from app.drawing_intelligence.prototype_store import (
    PrototypeSample,
    add_prototype_version,
    empty_registry,
    latest_active,
    rollback_prototype,
)
from app.drawing_intelligence.topology import build_vector_topology, trace_connected_line
from app.drawing_intelligence.vector_geometry import descriptor_for_bbox


def _network_pdf() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=500, height=400)
    # One connected three-segment polyline and one closed rectangle.
    page.draw_line((50, 100), (180, 100), color=(0, 0, 0))
    page.draw_line((180, 100), (300, 100), color=(0, 0, 0))
    page.draw_line((180, 100), (180, 230), color=(0, 0, 0))
    page.draw_rect(fitz.Rect(330, 80, 430, 180), color=(0, 0, 0))
    data = doc.tobytes()
    doc.close()
    return data


def test_vector_topology_detects_junction_open_endpoints_and_closed_loop():
    doc = fitz.open(stream=_network_pdf(), filetype="pdf")
    try:
        topology = build_vector_topology(doc[0], 0, tolerance_pt=2.0)
    finally:
        doc.close()
    assert topology.nodes
    assert topology.edges
    assert any(component.junction_node_ids for component in topology.components)
    assert any(component.closed_loop for component in topology.components)
    branched = next(component for component in topology.components if component.junction_node_ids)
    assert len(branched.open_endpoint_ids) == 3


def test_connected_line_trace_returns_whole_component_not_single_segment():
    doc = fitz.open(stream=_network_pdf(), filetype="pdf")
    try:
        trace = trace_connected_line(doc[0], 0, (0.25, 0.25), selection_radius_pt=20)
    finally:
        doc.close()
    assert trace.component_id
    assert len(trace.segments) == 3
    assert trace.raw_length_pt and trace.raw_length_pt > 300
    assert trace.status == "needs_review"  # branched scope requires reviewer confirmation
    assert trace.final_quantity is False


def test_project_prototype_versions_are_immutable_and_rollback_creates_new_version():
    doc = fitz.open(stream=_network_pdf(), filetype="pdf")
    try:
        box = BBox(x0=330 / 500, y0=80 / 400, x1=430 / 500, y1=180 / 400)
        descriptor, _ = descriptor_for_bbox(doc[0], box)
    finally:
        doc.close()
    sample = PrototypeSample(
        sample_id="s1", page_index=0, bbox=box.model_dump(mode="json"),
        descriptor=descriptor, label="positive",
    )
    registry = add_prototype_version(
        empty_registry("project-1", "package-1"),
        name="Kolom K1", category="column", source_document_sha256="abc",
        samples=[sample], actor_id="reviewer-1",
    )
    first = registry.versions[-1]
    registry = add_prototype_version(
        registry,
        name="Kolom K1", category="column", source_document_sha256="abc",
        samples=[sample], actor_id="reviewer-2",
    )
    active = latest_active(registry, first.prototype_id)
    assert active and active.version == 2
    assert next(version for version in registry.versions if version.version == 1).status == "superseded"

    rolled = rollback_prototype(
        registry, prototype_id=first.prototype_id, target_version=1, actor_id="reviewer-3"
    )
    restored = latest_active(rolled, first.prototype_id)
    assert restored and restored.version == 3
    assert restored.calibration["rollback_target_version"] == 1
