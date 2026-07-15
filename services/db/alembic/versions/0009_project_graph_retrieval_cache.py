"""add shared project graph retrieval cache

Revision ID: 0009
Revises: 0008
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table("project_graph_retrieval_cache",
        sa.Column("cache_key", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("snapshot_id", sa.String(), sa.ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_project_graph_retrieval_cache_scope", "project_graph_retrieval_cache", ["project_id", "snapshot_id", "expires_at"])

def downgrade() -> None:
    op.drop_index("ix_project_graph_retrieval_cache_scope", table_name="project_graph_retrieval_cache")
    op.drop_table("project_graph_retrieval_cache")
