"""add RAB materialization mapping audit trail

Revision ID: 0023
Revises: 0022
"""
from alembic import op
import sqlalchemy as sa


revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rab_materialization_mapping_audits",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("mapping_id", sa.String(), sa.ForeignKey("rab_materialization_mappings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("actor", sa.String(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_rab_materialization_mapping_audits_mapping_id", "rab_materialization_mapping_audits", ["mapping_id"])


def downgrade() -> None:
    op.drop_index("ix_rab_materialization_mapping_audits_mapping_id", table_name="rab_materialization_mapping_audits")
    op.drop_table("rab_materialization_mapping_audits")
