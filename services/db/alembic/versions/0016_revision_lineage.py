"""revision lineage and effective snapshot scope

Revision ID: 0016
Revises: 0015
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    jsonb = postgresql.JSONB(astext_type=sa.Text())
    op.add_column(
        "project_graph_snapshots",
        sa.Column("effective_sheet_revision_ids", jsonb, nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.create_table(
        "document_revisions",
        sa.Column("revision_id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("issue_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("issue_purpose", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("supersedes_revision_id", sa.String(), sa.ForeignKey("document_revisions.revision_id", ondelete="SET NULL"), nullable=True),
        sa.Column("superseded_by_revision_id", sa.String(), sa.ForeignKey("document_revisions.revision_id", ondelete="SET NULL"), nullable=True),
        sa.Column("effective_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_document_revisions_project_document_active", "document_revisions", ["project_id", "document_id", "is_active"])
    op.create_table(
        "sheet_revisions",
        sa.Column("revision_id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("document_revision_id", sa.String(), sa.ForeignKey("document_revisions.revision_id", ondelete="CASCADE"), nullable=False),
        sa.Column("sheet_id", sa.String(), nullable=False),
        sa.Column("issue_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("issue_purpose", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("supersedes_revision_id", sa.String(), sa.ForeignKey("sheet_revisions.revision_id", ondelete="SET NULL"), nullable=True),
        sa.Column("superseded_by_revision_id", sa.String(), sa.ForeignKey("sheet_revisions.revision_id", ondelete="SET NULL"), nullable=True),
        sa.Column("revision_cloud_regions", jsonb, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("effective_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_sheet_revisions_project_sheet_active", "sheet_revisions", ["project_id", "document_id", "sheet_id", "is_active"])


def downgrade() -> None:
    op.drop_index("ix_sheet_revisions_project_sheet_active", table_name="sheet_revisions")
    op.drop_table("sheet_revisions")
    op.drop_index("ix_document_revisions_project_document_active", table_name="document_revisions")
    op.drop_table("document_revisions")
    op.drop_column("project_graph_snapshots", "effective_sheet_revision_ids")
