from __future__ import annotations

import hashlib
import math
from collections import defaultdict, deque
from typing import Iterable

import fitz
from pydantic import BaseModel, Field

from .models import BBox


class TopologyNode(BaseModel):
    node_id: str
    x: float
    y: float
    degree: int = Field(default=0, ge=0)


class TopologyEdge(BaseModel):
    edge_id: str
    start_node_id: str
    end_node_id: str
    start: tuple[float, float]
    end: tuple[float, float]
    length_pt: float = Field(ge=0)
    source_path_index: int = Field(ge=0)
    source_kind: str


class TopologyComponent(BaseModel):
    component_id: str
    node_ids: list[str]
    edge_ids: list[str]
    total_length_pt: float = Field(ge=0)
    open_endpoint_ids: list[str] = Field(default_factory=list)
    junction_node_ids: list[str] = Field(default_factory=list)
    closed_loop: bool = False
    diagnostics: list[str] = Field(default_factory=list)


class VectorTopology(BaseModel):
    schema_version: str = "paax.drawing-intelligence.topology.v1"
    page_index: int
    tolerance_pt: float
    nodes: list[TopologyNode]
    edges: list[TopologyEdge]
    components: list[TopologyComponent]


class ConnectedLineTrace(BaseModel):
    schema_version: str = "paax.drawing-intelligence.connected-line.v1"
    page_index: int
    component_id: str | None = None
    segments: list[tuple[tuple[float, float], tuple[float, float]]] = Field(default_factory=list)
    geometry_space: str = "normalized"
    raw_length_pt: float | None = None
    confidence: float = Field(default=0.0, ge=0, le=1)
    status: str = "needs_review"
    diagnostics: list[str] = Field(default_factory=list)
    final_quantity: bool = False


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _distance_to_segment(point: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    px, py = point; ax, ay = a; bx, by = b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return _distance(point, a)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _drawing_segments(drawing: dict) -> Iterable[tuple[tuple[float, float], tuple[float, float], str]]:
    for item in drawing.get("items") or []:
        kind = item[0]
        if kind == "l":
            a, b = item[1], item[2]
            yield (float(a.x), float(a.y)), (float(b.x), float(b.y)), "line"
        elif kind == "re":
            rect = fitz.Rect(item[1])
            points = [
                (rect.x0, rect.y0), (rect.x1, rect.y0),
                (rect.x1, rect.y1), (rect.x0, rect.y1), (rect.x0, rect.y0),
            ]
            for a, b in zip(points, points[1:]):
                yield a, b, "rectangle"
        elif kind == "qu":
            quad = item[1]
            points = [quad.ul, quad.ur, quad.lr, quad.ll, quad.ul]
            values = [(float(point.x), float(point.y)) for point in points]
            for a, b in zip(values, values[1:]):
                yield a, b, "quad"
        elif kind == "c":
            points = [point for point in item[1:] if hasattr(point, "x")]
            if len(points) >= 2:
                # Curves remain one topological edge.  Their geometric length
                # is conservatively approximated by the control polygon and is
                # never promoted to a scaled final quantity.
                values = [(float(point.x), float(point.y)) for point in points]
                yield values[0], values[-1], "curve"


def build_vector_topology(
    page: fitz.Page,
    page_index: int,
    *,
    tolerance_pt: float = 1.5,
    scope: BBox | None = None,
    max_edges: int = 50_000,
) -> VectorTopology:
    if tolerance_pt <= 0:
        raise ValueError("tolerance_pt must be positive")
    scope_rect = None
    if scope is not None:
        if scope.space != "normalized":
            raise ValueError("topology scope must be normalized")
        scope_rect = fitz.Rect(
            page.rect.x0 + scope.x0 * page.rect.width,
            page.rect.y0 + scope.y0 * page.rect.height,
            page.rect.x0 + scope.x1 * page.rect.width,
            page.rect.y0 + scope.y1 * page.rect.height,
        )

    node_points: list[tuple[float, float]] = []
    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)

    def resolve_node(point: tuple[float, float]) -> int:
        bx = int(math.floor(point[0] / tolerance_pt))
        by = int(math.floor(point[1] / tolerance_pt))
        best: tuple[float, int] | None = None
        for ix in range(bx - 1, bx + 2):
            for iy in range(by - 1, by + 2):
                for index in buckets.get((ix, iy), []):
                    distance = _distance(point, node_points[index])
                    if distance <= tolerance_pt and (best is None or distance < best[0]):
                        best = (distance, index)
        if best is not None:
            return best[1]
        index = len(node_points)
        node_points.append(point)
        buckets[(bx, by)].append(index)
        return index

    raw_edges: list[tuple[int, int, tuple[float, float], tuple[float, float], int, str]] = []
    try:
        drawings = page.get_drawings()
    except Exception:
        drawings = []
    for path_index, drawing in enumerate(drawings):
        rect = fitz.Rect(drawing.get("rect") or (0, 0, 0, 0))
        if scope_rect is not None and not rect.intersects(scope_rect):
            continue
        for start, end, kind in _drawing_segments(drawing):
            if _distance(start, end) <= max(0.05, tolerance_pt * 0.05):
                continue
            start_index = resolve_node(start)
            end_index = resolve_node(end)
            if start_index == end_index:
                continue
            raw_edges.append((start_index, end_index, start, end, path_index, kind))
            if len(raw_edges) >= max_edges:
                break
        if len(raw_edges) >= max_edges:
            break

    degrees = CounterLike()
    adjacency: dict[int, list[int]] = defaultdict(list)
    edges: list[TopologyEdge] = []
    for index, (start_index, end_index, start, end, path_index, kind) in enumerate(raw_edges):
        degrees[start_index] += 1; degrees[end_index] += 1
        adjacency[start_index].append(index); adjacency[end_index].append(index)
        digest = hashlib.sha1(f"{page_index}|{path_index}|{index}|{start}|{end}".encode()).hexdigest()[:12]
        edges.append(TopologyEdge(
            edge_id=f"edge-{digest}",
            start_node_id=f"node-{start_index}", end_node_id=f"node-{end_index}",
            start=start, end=end, length_pt=_distance(start, end),
            source_path_index=path_index, source_kind=kind,
        ))

    nodes = [
        TopologyNode(node_id=f"node-{index}", x=point[0], y=point[1], degree=degrees[index])
        for index, point in enumerate(node_points)
    ]

    components: list[TopologyComponent] = []
    visited_edges: set[int] = set()
    for seed in range(len(edges)):
        if seed in visited_edges:
            continue
        queue = deque([seed]); component_edges: set[int] = set(); component_nodes: set[int] = set()
        while queue:
            edge_index = queue.popleft()
            if edge_index in visited_edges:
                continue
            visited_edges.add(edge_index); component_edges.add(edge_index)
            raw = raw_edges[edge_index]
            for node_index in (raw[0], raw[1]):
                component_nodes.add(node_index)
                for neighbor in adjacency[node_index]:
                    if neighbor not in visited_edges:
                        queue.append(neighbor)
        open_nodes = sorted(index for index in component_nodes if degrees[index] == 1)
        junctions = sorted(index for index in component_nodes if degrees[index] > 2)
        closed = bool(component_edges) and not open_nodes and not junctions and all(degrees[index] == 2 for index in component_nodes)
        diagnostics = []
        if open_nodes:
            diagnostics.append(f"{len(open_nodes)} open endpoint(s)")
        if junctions:
            diagnostics.append(f"{len(junctions)} junction(s)")
        if closed:
            diagnostics.append("closed loop")
        component_id = f"component-{page_index}-{min(component_edges)}"
        components.append(TopologyComponent(
            component_id=component_id,
            node_ids=[f"node-{index}" for index in sorted(component_nodes)],
            edge_ids=[edges[index].edge_id for index in sorted(component_edges)],
            total_length_pt=sum(edges[index].length_pt for index in component_edges),
            open_endpoint_ids=[f"node-{index}" for index in open_nodes],
            junction_node_ids=[f"node-{index}" for index in junctions],
            closed_loop=closed,
            diagnostics=diagnostics,
        ))

    return VectorTopology(
        page_index=page_index,
        tolerance_pt=tolerance_pt,
        nodes=nodes,
        edges=edges,
        components=components,
    )


class CounterLike(defaultdict):
    def __init__(self) -> None:
        super().__init__(int)


def trace_connected_line(
    page: fitz.Page,
    page_index: int,
    point: tuple[float, float],
    *,
    tolerance_pt: float = 1.5,
    selection_radius_pt: float = 12.0,
) -> ConnectedLineTrace:
    topology = build_vector_topology(page, page_index, tolerance_pt=tolerance_pt)
    if not topology.edges:
        return ConnectedLineTrace(page_index=page_index, diagnostics=["no vector edges found"])
    pdf_point = (
        page.rect.x0 + point[0] * page.rect.width,
        page.rect.y0 + point[1] * page.rect.height,
    )
    nearest = min(topology.edges, key=lambda edge: _distance_to_segment(pdf_point, edge.start, edge.end))
    distance = _distance_to_segment(pdf_point, nearest.start, nearest.end)
    if distance > selection_radius_pt:
        return ConnectedLineTrace(
            page_index=page_index,
            diagnostics=[f"nearest vector edge is {distance:.2f} pt from selection"],
        )
    component = next(component for component in topology.components if nearest.edge_id in component.edge_ids)
    edge_by_id = {edge.edge_id: edge for edge in topology.edges}
    segments = []
    for edge_id in component.edge_ids:
        edge = edge_by_id[edge_id]
        segments.append((
            ((edge.start[0] - page.rect.x0) / page.rect.width, (edge.start[1] - page.rect.y0) / page.rect.height),
            ((edge.end[0] - page.rect.x0) / page.rect.width, (edge.end[1] - page.rect.y0) / page.rect.height),
        ))
    diagnostics = list(component.diagnostics)
    if component.junction_node_ids:
        diagnostics.append("branched network requires reviewer scope confirmation")
    confidence = max(0.45, min(0.96, 1.0 - distance / max(selection_radius_pt, 1e-9)))
    return ConnectedLineTrace(
        page_index=page_index,
        component_id=component.component_id,
        segments=segments,
        raw_length_pt=component.total_length_pt,
        confidence=confidence,
        status="candidate" if not component.junction_node_ids else "needs_review",
        diagnostics=diagnostics,
    )
