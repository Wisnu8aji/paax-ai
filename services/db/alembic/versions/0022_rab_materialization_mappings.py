"""add approved typed measurement mappings for RAB materialization

Revision ID: 0022
Revises: 0021
"""
from alembic import op
import sqlalchemy as sa


revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rab_materialization_mappings",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("snapshot_id", sa.String(), sa.ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), nullable=False),
        sa.Column("work_item_node_id", sa.String(), nullable=False),
        sa.Column("measurement_fact_ids", sa.JSON(), nullable=False),
        sa.Column("calculation_type", sa.String(), nullable=False),
        sa.Column("evidence_refs", sa.JSON(), nullable=False),
        sa.Column("approval_status", sa.String(), nullable=False),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("reviewed_by", sa.String(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("project_id", "snapshot_id", "work_item_node_id", name="uq_rab_materialization_mapping_work_item"),
    )
    op.create_index("ix_rab_materialization_mappings_project_id", "rab_materialization_mappings", ["project_id"])
    op.create_index("ix_rab_materialization_mappings_snapshot_id", "rab_materialization_mappings", ["snapshot_id"])
    op.create_index("ix_rab_materialization_mappings_approval_status", "rab_materialization_mappings", ["approval_status"])


def downgrade() -> None:
    op.drop_index("ix_rab_materialization_mappings_approval_status", table_name="rab_materialization_mappings")
    op.drop_index("ix_rab_materialization_mappings_snapshot_id", table_name="rab_materialization_mappings")
    op.drop_index("ix_rab_materialization_mappings_project_id", table_name="rab_materialization_mappings")
    op.drop_table("rab_materialization_mappings")
