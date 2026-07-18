"""evidence model v2 and foreign key constraints

Revision ID: 0015
Revises: 0014
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    jsonb = postgresql.JSONB(astext_type=sa.Text())

    # Add columns to project_graph_evidence
    op.add_column("project_graph_evidence", sa.Column("revision_id", sa.String(), nullable=True))
    op.add_column("project_graph_evidence", sa.Column("run_id", sa.String(), nullable=True))
    op.add_column("project_graph_evidence", sa.Column("dem_page_id", sa.String(), nullable=True))
    op.add_column("project_graph_evidence", sa.Column("view_id", sa.String(), nullable=True))
    op.add_column("project_graph_evidence", sa.Column("zone_id", sa.String(), nullable=True))
    op.add_column("project_graph_evidence", sa.Column("modality", sa.String(), nullable=True))
    op.add_column("project_graph_evidence", sa.Column("raw_content", sa.Text(), nullable=True))
    op.add_column("project_graph_evidence", sa.Column("normalized_content", sa.Text(), nullable=True))
    op.add_column("project_graph_evidence", sa.Column("bbox_source", jsonb, nullable=True))
    op.add_column("project_graph_evidence", sa.Column("bbox_normalized", jsonb, nullable=True))
    op.add_column("project_graph_evidence", sa.Column("polygon_source", jsonb, nullable=True))
    op.add_column("project_graph_evidence", sa.Column("polygon_normalized", jsonb, nullable=True))
    op.add_column("project_graph_evidence", sa.Column("confidence", sa.Numeric(), nullable=True))
    op.add_column("project_graph_evidence", sa.Column("extractor", jsonb, nullable=True))
    op.add_column("project_graph_evidence", sa.Column("artifact_hash", sa.String(), nullable=True))
    op.add_column(
        "project_graph_evidence",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False
        )
    )

    # 1. Unique constraint on project_graph_snapshots for composite referencing
    op.create_unique_constraint(
        "uq_project_graph_snapshots_id_project",
        "project_graph_snapshots",
        ["snapshot_id", "project_id"]
    )

    # 2. Composite Foreign Key on project_graph_evidence: (snapshot_id, project_id) -> project_graph_snapshots(snapshot_id, project_id)
    op.create_foreign_key(
        "fk_project_graph_evidence_snapshot_project",
        "project_graph_evidence",
        "project_graph_snapshots",
        ["snapshot_id", "project_id"],
        ["snapshot_id", "project_id"],
        ondelete="CASCADE"
    )

    # 3. Composite Foreign Key on project_graph_node_evidence:
    # (snapshot_id, node_id) -> project_graph_nodes(snapshot_id, node_id)
    # (snapshot_id, evidence_id) -> project_graph_evidence(snapshot_id, evidence_id)
    op.create_foreign_key(
        "fk_node_evidence_node",
        "project_graph_node_evidence",
        "project_graph_nodes",
        ["snapshot_id", "node_id"],
        ["snapshot_id", "node_id"],
        ondelete="CASCADE"
    )
    op.create_foreign_key(
        "fk_node_evidence_evidence",
        "project_graph_node_evidence",
        "project_graph_evidence",
        ["snapshot_id", "evidence_id"],
        ["snapshot_id", "evidence_id"],
        ondelete="CASCADE"
    )

    # 4. Composite Foreign Key on project_graph_edge_evidence:
    # (snapshot_id, edge_id) -> project_graph_edges(snapshot_id, edge_id)
    # (snapshot_id, evidence_id) -> project_graph_evidence(snapshot_id, evidence_id)
    op.create_foreign_key(
        "fk_edge_evidence_edge",
        "project_graph_edge_evidence",
        "project_graph_edges",
        ["snapshot_id", "edge_id"],
        ["snapshot_id", "edge_id"],
        ondelete="CASCADE"
    )
    op.create_foreign_key(
        "fk_edge_evidence_evidence",
        "project_graph_edge_evidence",
        "project_graph_evidence",
        ["snapshot_id", "evidence_id"],
        ["snapshot_id", "evidence_id"],
        ondelete="CASCADE"
    )


def downgrade() -> None:
    # Drop composite FK constraints
    op.drop_constraint("fk_edge_evidence_evidence", "project_graph_edge_evidence", type_="foreignkey")
    op.drop_constraint("fk_edge_evidence_edge", "project_graph_edge_evidence", type_="foreignkey")
    op.drop_constraint("fk_node_evidence_evidence", "project_graph_node_evidence", type_="foreignkey")
    op.drop_constraint("fk_node_evidence_node", "project_graph_node_evidence", type_="foreignkey")
    op.drop_constraint("fk_project_graph_evidence_snapshot_project", "project_graph_evidence", type_="foreignkey")

    # Drop unique constraint
    op.drop_constraint("uq_project_graph_snapshots_id_project", "project_graph_snapshots", type_="unique")

    # Drop added columns from project_graph_evidence
    for col in [
        "created_at", "artifact_hash", "extractor", "confidence",
        "polygon_normalized", "polygon_source", "bbox_normalized", "bbox_source",
        "normalized_content", "raw_content", "modality", "zone_id",
        "view_id", "dem_page_id", "run_id", "revision_id"
    ]:
        op.drop_column("project_graph_evidence", col)
