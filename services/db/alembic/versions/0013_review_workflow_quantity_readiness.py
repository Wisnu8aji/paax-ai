"""persist C7 corrections lineage and C8 bridge/assumption registries

Revision ID: 0013
Revises: 0012
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("project_graph_corrections", sa.Column("created_by", sa.String(), nullable=True))
    op.add_column("project_graph_corrections", sa.Column("resolved_by", sa.String(), nullable=True))
    op.add_column("project_graph_corrections", sa.Column("carried_from", sa.String(), nullable=True))
    op.create_index("ix_project_graph_corrections_carried_from", "project_graph_corrections", ["carried_from"])

    jsonb = postgresql.JSONB(astext_type=sa.Text())
    op.create_table(
        "rab_bridge_proposals",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("snapshot_id", sa.String(), sa.ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_ids", jsonb, nullable=False),
        sa.Column("payload", jsonb, nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("reviewed_by", sa.String(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_rab_bridge_proposals_scope", "rab_bridge_proposals", ["project_id", "snapshot_id", "status"])

    op.create_table(
        "quantity_assumptions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("element_type_id", sa.String(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("source_role", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_quantity_assumptions_scope", "quantity_assumptions", ["project_id", "element_type_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_quantity_assumptions_scope", table_name="quantity_assumptions")
    op.drop_table("quantity_assumptions")
    op.drop_index("ix_rab_bridge_proposals_scope", table_name="rab_bridge_proposals")
    op.drop_table("rab_bridge_proposals")
    op.drop_index("ix_project_graph_corrections_carried_from", table_name="project_graph_corrections")
    op.drop_column("project_graph_corrections", "carried_from")
    op.drop_column("project_graph_corrections", "resolved_by")
    op.drop_column("project_graph_corrections", "created_by")
