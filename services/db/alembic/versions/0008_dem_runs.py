"""add dem_runs, dem_pages (DEM Phase 2 job orchestrator)

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dem_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", sa.String(), nullable=True),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("document_hash", sa.String(), nullable=False),
        sa.Column("file_name", sa.String(), nullable=False),
        sa.Column("total_pages", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="created"),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("prompt_version", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f("ix_dem_runs_project_id"), "dem_runs", ["project_id"], unique=False)
    op.create_index(op.f("ix_dem_runs_document_hash"), "dem_runs", ["document_hash"], unique=False)

    op.create_table(
        "dem_pages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("dem_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("page_index", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="queued"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failure_kind", sa.String(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("input_hash", sa.String(), nullable=True),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(op.f("ix_dem_pages_run_id"), "dem_pages", ["run_id"], unique=False)
    op.create_index("idx_dem_pages_run_page", "dem_pages", ["run_id", "page_index"], unique=True)


def downgrade() -> None:
    op.drop_index("idx_dem_pages_run_page", table_name="dem_pages")
    op.drop_index(op.f("ix_dem_pages_run_id"), table_name="dem_pages")
    op.drop_table("dem_pages")
    op.drop_index(op.f("ix_dem_runs_document_hash"), table_name="dem_runs")
    op.drop_index(op.f("ix_dem_runs_project_id"), table_name="dem_runs")
    op.drop_table("dem_runs")
