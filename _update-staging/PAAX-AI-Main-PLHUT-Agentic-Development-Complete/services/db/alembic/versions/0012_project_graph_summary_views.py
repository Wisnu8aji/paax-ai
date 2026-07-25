"""add project graph summary views

Revision ID: 0012
Revises: 0011
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    jsonb = postgresql.JSONB(astext_type=sa.Text())
    op.create_table(
        "project_graph_summary_views",
        sa.Column("snapshot_id", sa.String(), sa.ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("view_id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("view_kind", sa.String(), nullable=False),
        sa.Column("level_id", sa.String(), nullable=True),
        sa.Column("payload", jsonb, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_project_graph_summary_views_project_id", "project_graph_summary_views", ["project_id"])
    op.create_index("ix_project_graph_summary_views_view_kind", "project_graph_summary_views", ["view_kind"])
    op.create_index("ix_project_graph_summary_views_level_id", "project_graph_summary_views", ["level_id"])


def downgrade() -> None:
    op.drop_index("ix_project_graph_summary_views_level_id", table_name="project_graph_summary_views")
    op.drop_index("ix_project_graph_summary_views_view_kind", table_name="project_graph_summary_views")
    op.drop_index("ix_project_graph_summary_views_project_id", table_name="project_graph_summary_views")
    op.drop_table("project_graph_summary_views")
