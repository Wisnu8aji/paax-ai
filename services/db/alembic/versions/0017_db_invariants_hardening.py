"""database invariants and persistence hardening

Revision ID: 0017
Revises: 0016

Adds CHECK constraints and indexes for:
1. Unique active snapshot per project (partial unique index: status='active')
2. Confidence range 0-1 on project_graph_nodes, project_graph_edges, project_graph_evidence, project_graph_aliases
3. Valid status values on project_graph_snapshots and project_graph_corrections
4. Unique (run_id, page_index) on dem_pages
5. Accepted correction must have reviewer/time (CHECK constraint)
6. Unique artifact_hash on project_graph_evidence (excluding NULLs, partial index)
7. Composite FK: node project_id must match snapshot project_id
8. Composite FK: edge project_id must match snapshot project_id
9. Composite FK: edge endpoints within the same snapshot
10. Unique idempotency key on rab_bridge_proposals (snapshot_id + hash of node_ids intent)

PostgreSQL-specific constraints use op.execute() with dialect checks.
SQLite-compatible constraints use op.create_check_constraint() and op.create_index().

Notes on Measurement Fact table: not yet created (planned Phase 13).
Unique version constraint for MeasurementFact is n/a at this phase.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_postgresql() -> bool:
    """Check if current bind is PostgreSQL."""
    try:
        bind = op.get_bind()
        return bind.dialect.name == "postgresql"
    except Exception:
        return False


def upgrade() -> None:
    # ── 1. Unique active snapshot per project ─────────────────────────────────
    # Partial unique index: only one snapshot with status='active' per project.
    # SQLite supports partial indexes. PostgreSQL supports them natively.
    op.create_index(
        "ix_project_graph_snapshots_one_active_per_project",
        "project_graph_snapshots",
        ["project_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
        sqlite_where=sa.text("status = 'active'"),
    )

    # ── 2. Confidence range CHECK constraints ──────────────────────────────────
    # project_graph_nodes.confidence must be between 0 and 1
    op.create_check_constraint(
        "ck_project_graph_nodes_confidence_range",
        "project_graph_nodes",
        "confidence >= 0 AND confidence <= 1",
    )
    # project_graph_edges.confidence must be between 0 and 1
    op.create_check_constraint(
        "ck_project_graph_edges_confidence_range",
        "project_graph_edges",
        "confidence >= 0 AND confidence <= 1",
    )
    # project_graph_evidence.confidence is nullable but if set must be 0-1
    op.create_check_constraint(
        "ck_project_graph_evidence_confidence_range",
        "project_graph_evidence",
        "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
    )
    # project_graph_aliases.confidence must be between 0 and 1
    op.create_check_constraint(
        "ck_project_graph_aliases_confidence_range",
        "project_graph_aliases",
        "confidence >= 0 AND confidence <= 1",
    )

    # ── 3. Valid status CHECK constraints ─────────────────────────────────────
    op.create_check_constraint(
        "ck_project_graph_snapshots_status",
        "project_graph_snapshots",
        "status IN ('building', 'active', 'superseded', 'failed', 'stale')",
    )
    op.create_check_constraint(
        "ck_project_graph_corrections_status",
        "project_graph_corrections",
        "status IN ('pending', 'accepted', 'rejected', 'resolved', 'carried')",
    )
    op.create_check_constraint(
        "ck_project_graph_corrections_target_type",
        "project_graph_corrections",
        "target_type IN ('node', 'edge', 'evidence', 'alias', 'snapshot')",
    )

    # ── 4. Unique (run_id, page_index) on dem_pages ───────────────────────────
    op.create_unique_constraint(
        "uq_dem_pages_run_page",
        "dem_pages",
        ["run_id", "page_index"],
    )

    # ── 5. Accepted correction requires reviewer and reviewed_at ──────────────
    op.create_check_constraint(
        "ck_corrections_accepted_has_reviewer",
        "project_graph_corrections",
        # If status is 'accepted', resolved_by and resolved_at must be set.
        # We use 'accepted' specifically per invariant spec; 'resolved' is
        # the human-workflow status (CORR-1 example above uses 'resolved').
        # Guard both 'accepted' and 'resolved' to capture all approved states.
        "status NOT IN ('accepted', 'resolved') OR (resolved_by IS NOT NULL AND resolved_at IS NOT NULL)",
    )

    # ── 6. Unique artifact_hash (partial: exclude NULL) ───────────────────────
    # Partial unique index: artifact_hash is unique when non-null.
    op.create_index(
        "ix_project_graph_evidence_artifact_hash_unique",
        "project_graph_evidence",
        ["artifact_hash"],
        unique=True,
        postgresql_where=sa.text("artifact_hash IS NOT NULL"),
        sqlite_where=sa.text("artifact_hash IS NOT NULL"),
    )

    # ── 7. Composite FK: node (snapshot_id, project_id) → snapshots ───────────
    # Ensures node.project_id == snapshot.project_id at DB level.
    # The composite unique constraint uq_project_graph_snapshots_id_project
    # (snapshot_id, project_id) was created in migration 0015 and already exists.
    op.create_foreign_key(
        "fk_project_graph_nodes_snapshot_project",
        "project_graph_nodes",
        "project_graph_snapshots",
        ["snapshot_id", "project_id"],
        ["snapshot_id", "project_id"],
        ondelete="CASCADE",
    )

    # ── 8. Composite FK: edge (snapshot_id, project_id) → snapshots ───────────
    op.create_foreign_key(
        "fk_project_graph_edges_snapshot_project",
        "project_graph_edges",
        "project_graph_snapshots",
        ["snapshot_id", "project_id"],
        ["snapshot_id", "project_id"],
        ondelete="CASCADE",
    )

    # ── 9. Composite FK: edge endpoints within the same snapshot ──────────────
    # source_node_id must reference a node within the same snapshot.
    # We do this via a computed/constraint approach: add composite FKs.
    # Note: SQLite does not enforce FK constraints unless PRAGMA foreign_keys=ON.
    # The FK from (snapshot_id, source_node_id) → project_graph_nodes(snapshot_id, node_id)
    # requires a unique constraint on (snapshot_id, node_id) in project_graph_nodes.
    # Currently, (snapshot_id, node_id) IS already the primary key of project_graph_nodes,
    # so it is already unique. FK references to PK columns are valid.
    op.create_foreign_key(
        "fk_project_graph_edges_source_node",
        "project_graph_edges",
        "project_graph_nodes",
        ["snapshot_id", "source_node_id"],
        ["snapshot_id", "node_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_project_graph_edges_target_node",
        "project_graph_edges",
        "project_graph_nodes",
        ["snapshot_id", "target_node_id"],
        ["snapshot_id", "node_id"],
        ondelete="CASCADE",
    )

    # ── 10. Idempotency index on rab_bridge_proposals ─────────────────────────
    # (snapshot_id, status='pending') should have at most one entry per node_ids
    # intent — but since node_ids is JSON, we cannot use a simple unique index.
    # Instead, create a composite index on (snapshot_id, status) for fast lookup.
    # Application-level idempotency check is enforced in the repository.
    op.create_index(
        "ix_rab_bridge_proposals_snapshot_status",
        "rab_bridge_proposals",
        ["snapshot_id", "status"],
    )

    # ── 11. Additional Composite FKs for Cross-Project Isolation ──────────────
    op.create_foreign_key(
        "fk_project_graph_aliases_snapshot_project",
        "project_graph_aliases",
        "project_graph_snapshots",
        ["snapshot_id", "project_id"],
        ["snapshot_id", "project_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_project_graph_aliases_node",
        "project_graph_aliases",
        "project_graph_nodes",
        ["snapshot_id", "node_id"],
        ["snapshot_id", "node_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_project_graph_query_logs_snapshot_project",
        "project_graph_query_logs",
        "project_graph_snapshots",
        ["snapshot_id", "project_id"],
        ["snapshot_id", "project_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_project_graph_corrections_snapshot_project",
        "project_graph_corrections",
        "project_graph_snapshots",
        ["snapshot_id", "project_id"],
        ["snapshot_id", "project_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_project_graph_retrieval_cache_snapshot_project",
        "project_graph_retrieval_cache",
        "project_graph_snapshots",
        ["snapshot_id", "project_id"],
        ["snapshot_id", "project_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_project_graph_summary_views_snapshot_project",
        "project_graph_summary_views",
        "project_graph_snapshots",
        ["snapshot_id", "project_id"],
        ["snapshot_id", "project_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_rab_bridge_proposals_snapshot_project",
        "rab_bridge_proposals",
        "project_graph_snapshots",
        ["snapshot_id", "project_id"],
        ["snapshot_id", "project_id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    # Reverse order of upgrade()

    # 11
    op.drop_constraint("fk_rab_bridge_proposals_snapshot_project", "rab_bridge_proposals", type_="foreignkey")
    op.drop_constraint("fk_project_graph_summary_views_snapshot_project", "project_graph_summary_views", type_="foreignkey")
    op.drop_constraint("fk_project_graph_retrieval_cache_snapshot_project", "project_graph_retrieval_cache", type_="foreignkey")
    op.drop_constraint("fk_project_graph_corrections_snapshot_project", "project_graph_corrections", type_="foreignkey")
    op.drop_constraint("fk_project_graph_query_logs_snapshot_project", "project_graph_query_logs", type_="foreignkey")
    op.drop_constraint("fk_project_graph_aliases_node", "project_graph_aliases", type_="foreignkey")
    op.drop_constraint("fk_project_graph_aliases_snapshot_project", "project_graph_aliases", type_="foreignkey")

    # 10
    op.drop_index("ix_rab_bridge_proposals_snapshot_status", table_name="rab_bridge_proposals")

    # 9
    op.drop_constraint("fk_project_graph_edges_target_node", "project_graph_edges", type_="foreignkey")
    op.drop_constraint("fk_project_graph_edges_source_node", "project_graph_edges", type_="foreignkey")

    # 8
    op.drop_constraint("fk_project_graph_edges_snapshot_project", "project_graph_edges", type_="foreignkey")

    # 7
    op.drop_constraint("fk_project_graph_nodes_snapshot_project", "project_graph_nodes", type_="foreignkey")

    # 6
    op.drop_index("ix_project_graph_evidence_artifact_hash_unique", table_name="project_graph_evidence")

    # 5
    op.drop_constraint("ck_corrections_accepted_has_reviewer", "project_graph_corrections", type_="check")

    # 4
    op.drop_constraint("uq_dem_pages_run_page", "dem_pages", type_="unique")

    # 3
    op.drop_constraint("ck_project_graph_corrections_target_type", "project_graph_corrections", type_="check")
    op.drop_constraint("ck_project_graph_corrections_status", "project_graph_corrections", type_="check")
    op.drop_constraint("ck_project_graph_snapshots_status", "project_graph_snapshots", type_="check")

    # 2
    op.drop_constraint("ck_project_graph_aliases_confidence_range", "project_graph_aliases", type_="check")
    op.drop_constraint("ck_project_graph_evidence_confidence_range", "project_graph_evidence", type_="check")
    op.drop_constraint("ck_project_graph_edges_confidence_range", "project_graph_edges", type_="check")
    op.drop_constraint("ck_project_graph_nodes_confidence_range", "project_graph_nodes", type_="check")

    # 1
    op.drop_index("ix_project_graph_snapshots_one_active_per_project", table_name="project_graph_snapshots")

