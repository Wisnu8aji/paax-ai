"""Deterministic structural validation for project graph synthesis."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from app.project_graph.models import ProjectGraphEdge, ProjectGraphNode, ProjectGraphSnapshot


@dataclass(frozen=True)
class GraphValidationIssue:
    code: str
    message: str
    node_id: str | None = None
    edge_id: str | None = None


@dataclass(frozen=True)
class GraphValidationReport:
    issues: tuple[GraphValidationIssue, ...]

    @property
    def is_valid(self) -> bool:
        return not self.issues

    def raise_if_invalid(self) -> None:
        if not self.is_valid:
            raise ProjectGraphValidationError(self)


class ProjectGraphValidationError(ValueError):
    """Raised when synthesis attempts to use a structurally invalid graph."""

    def __init__(self, report: GraphValidationReport):
        self.report = report
        details = "; ".join(f"{issue.code}: {issue.message}" for issue in report.issues)
        super().__init__(details)


def validate_project_graph(
    nodes: Sequence[ProjectGraphNode], edges: Sequence[ProjectGraphEdge]
) -> GraphValidationReport:
    """Return every supported graph invariant violation in stable order.

    The sequences are read only. Synthesis can inspect the report for audit
    output, or call :func:`assert_valid_project_graph` to reject invalid input.
    """
    ordered_nodes = tuple(sorted(nodes, key=lambda node: (node.node_id, node.type, node.canonical_name)))
    ordered_edges = tuple(sorted(edges, key=lambda edge: (edge.edge_id, edge.source, edge.target, edge.relation)))
    node_counts: dict[str, int] = {}
    node_types: dict[str, str] = {}
    issues: list[GraphValidationIssue] = []

    for node in ordered_nodes:
        node_counts[node.node_id] = node_counts.get(node.node_id, 0) + 1
        node_types.setdefault(node.node_id, node.type)

    for node_id in sorted(node_id for node_id, count in node_counts.items() if count > 1):
        issues.append(
            GraphValidationIssue(
                code="duplicate_node_id",
                message=f"node_id {node_id!r} occurs {node_counts[node_id]} times",
                node_id=node_id,
            )
        )

    located_on_counts: dict[str, int] = {}
    located_on_targets: dict[str, set[str]] = {}
    locatable_types = {
        "element_occurrence", "physical_element_candidate", "physical_element"
    }
    for edge in ordered_edges:
        for endpoint_id in (edge.source, edge.target):
            if endpoint_id not in node_counts:
                issues.append(
                    GraphValidationIssue(
                        code="dangling_edge_endpoint",
                        message=f"edge {edge.edge_id!r} references missing node {endpoint_id!r}",
                        node_id=endpoint_id,
                        edge_id=edge.edge_id,
                    )
                )

        if edge.relation != "LOCATED_ON":
            continue
        source_exists = edge.source in node_types
        target_exists = edge.target in node_types
        if source_exists and node_types[edge.source] not in locatable_types:
            issues.append(
                GraphValidationIssue(
                    code="invalid_located_on_source",
                    message=(
                        f"LOCATED_ON edge {edge.edge_id!r} must originate from an "
                        "element_occurrence or physical element"
                    ),
                    node_id=edge.source,
                    edge_id=edge.edge_id,
                )
            )
        if target_exists and node_types[edge.target] != "level":
            issues.append(
                GraphValidationIssue(
                    code="invalid_located_on_target",
                    message=(
                        f"LOCATED_ON edge {edge.edge_id!r} must target a level"
                    ),
                    node_id=edge.target,
                    edge_id=edge.edge_id,
                )
            )
        if (
            source_exists
            and target_exists
            and node_types[edge.source] in locatable_types
        ):
            located_on_counts[edge.source] = located_on_counts.get(edge.source, 0) + 1
        if source_exists and target_exists and node_types[edge.source] in locatable_types:
            located_on_targets.setdefault(edge.source, set()).add(edge.target)

    for source_id in sorted(located_on_counts):
        targets = located_on_targets[source_id]
        if located_on_counts[source_id] > 1:
            issues.append(
                GraphValidationIssue(
                    code="multiple_located_on_targets",
                    message=(
                        f"locatable element {source_id!r} has {located_on_counts[source_id]} "
                        "LOCATED_ON edges targeting: "
                        f"{', '.join(sorted(targets))}"
                    ),
                    node_id=source_id,
                )
            )

    return GraphValidationReport(
        issues=tuple(sorted(issues, key=lambda issue: (issue.code, issue.node_id or "", issue.edge_id or "")))
    )


def validate_project_graph_snapshot(snapshot: ProjectGraphSnapshot) -> GraphValidationReport:
    """Validate a model-backed snapshot without mutating it."""
    return validate_project_graph(snapshot.nodes, snapshot.edges)


def assert_valid_project_graph(
    nodes: Sequence[ProjectGraphNode], edges: Sequence[ProjectGraphEdge]
) -> None:
    """Reject invalid synthesis output while retaining a report API for audits."""
    validate_project_graph(nodes, edges).raise_if_invalid()
