"""persist RAB Bridge V2 candidate provenance

Revision ID: 0024
Revises: 0023
"""
from alembic import op
import sqlalchemy as sa


revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rab_bridge_candidate_sets",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("snapshot_id", sa.String(), sa.ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), nullable=False),
        sa.Column("physical_element_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False), sa.Column("provenance", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("project_id", "snapshot_id", "physical_element_id", name="uq_rab_bridge_candidate_set_element"),
    )
    op.create_index("ix_rab_bridge_candidate_sets_project_id", "rab_bridge_candidate_sets", ["project_id"])
    op.create_index("ix_rab_bridge_candidate_sets_snapshot_id", "rab_bridge_candidate_sets", ["snapshot_id"])
    op.create_index("ix_rab_bridge_candidate_sets_status", "rab_bridge_candidate_sets", ["status"])


def downgrade() -> None:
    op.drop_index("ix_rab_bridge_candidate_sets_status", table_name="rab_bridge_candidate_sets")
    op.drop_index("ix_rab_bridge_candidate_sets_snapshot_id", table_name="rab_bridge_candidate_sets")
    op.drop_index("ix_rab_bridge_candidate_sets_project_id", table_name="rab_bridge_candidate_sets")
    op.drop_table("rab_bridge_candidate_sets")
