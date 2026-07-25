"""add correction carry-forward audit

Revision ID: 0019
Revises: 0018
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        "project_graph_correction_audits",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("correction_id", sa.String(), sa.ForeignKey("project_graph_corrections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_snapshot_id", sa.String(), nullable=False),
        sa.Column("target_snapshot_id", sa.String(), nullable=False),
        sa.Column("decision", sa.String(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_project_graph_correction_audits_correction_id", "project_graph_correction_audits", ["correction_id"])
    op.create_index("ix_project_graph_correction_audits_project_id", "project_graph_correction_audits", ["project_id"])

def downgrade() -> None:
    op.drop_index("ix_project_graph_correction_audits_project_id", table_name="project_graph_correction_audits")
    op.drop_index("ix_project_graph_correction_audits_correction_id", table_name="project_graph_correction_audits")
    op.drop_table("project_graph_correction_audits")
