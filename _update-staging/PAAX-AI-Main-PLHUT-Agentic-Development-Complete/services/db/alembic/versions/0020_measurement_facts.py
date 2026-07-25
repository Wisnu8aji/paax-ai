"""add authoritative measurement facts

Revision ID: 0020
Revises: 0019
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "measurement_facts",
        sa.Column("measurement_id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("snapshot_id", sa.String(), sa.ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), nullable=False),
        sa.Column("measurement_type", sa.String(), nullable=False),
        sa.Column("value", sa.Numeric(24, 9), nullable=False),
        sa.Column("unit", sa.String(), nullable=False),
        sa.Column("source_method", sa.String(), nullable=False),
        sa.Column("element_ids", sa.JSON(), nullable=False),
        sa.Column("evidence_refs", sa.JSON(), nullable=False),
        sa.Column("formula_inputs", sa.JSON(), nullable=False),
        sa.Column("verification_status", sa.String(), nullable=False, server_default="candidate"),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("audit_metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("value >= 0", name="ck_measurement_facts_value_nonnegative"),
    )
    op.create_index("ix_measurement_facts_project_id", "measurement_facts", ["project_id"])
    op.create_index("ix_measurement_facts_snapshot_id", "measurement_facts", ["snapshot_id"])
    op.create_index("ix_measurement_facts_measurement_type", "measurement_facts", ["measurement_type"])
    op.create_index("ix_measurement_facts_verification_status", "measurement_facts", ["verification_status"])


def downgrade() -> None:
    op.drop_index("ix_measurement_facts_verification_status", table_name="measurement_facts")
    op.drop_index("ix_measurement_facts_measurement_type", table_name="measurement_facts")
    op.drop_index("ix_measurement_facts_snapshot_id", table_name="measurement_facts")
    op.drop_index("ix_measurement_facts_project_id", table_name="measurement_facts")
    op.drop_table("measurement_facts")
