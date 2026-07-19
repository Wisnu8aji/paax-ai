"""add measurement supersession and typed assumptions

Revision ID: 0021
Revises: 0020
"""
from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("measurement_facts", sa.Column("supersedes_measurement_id", sa.String(), nullable=True))
    op.add_column("measurement_facts", sa.Column("superseded_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key("fk_measurement_facts_supersedes", "measurement_facts", "measurement_facts", ["supersedes_measurement_id"], ["measurement_id"], ondelete="SET NULL")
    op.create_index("ix_measurement_facts_supersedes_measurement_id", "measurement_facts", ["supersedes_measurement_id"])
    op.create_table("measurement_fact_audits",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("measurement_id", sa.String(), sa.ForeignKey("measurement_facts.measurement_id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(), nullable=False), sa.Column("actor", sa.String(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_measurement_fact_audits_measurement_id", "measurement_fact_audits", ["measurement_id"])
    for name, column in [
        ("snapshot_id", sa.String()), ("value", sa.Numeric(24, 9)), ("unit", sa.String()),
        ("scope", sa.JSON()), ("rationale", sa.Text()), ("owner", sa.String()),
        ("approval_status", sa.String()), ("expires_at", sa.DateTime(timezone=True)),
        ("stale_reason", sa.Text()), ("evidence_refs", sa.JSON()), ("explicit_human_source", sa.Boolean()),
    ]:
        op.add_column("quantity_assumptions", sa.Column(name, column, nullable=True))
    op.create_index("ix_quantity_assumptions_snapshot_id", "quantity_assumptions", ["snapshot_id"])
    op.create_index("ix_quantity_assumptions_approval_status", "quantity_assumptions", ["approval_status"])


def downgrade() -> None:
    op.drop_index("ix_quantity_assumptions_approval_status", table_name="quantity_assumptions")
    op.drop_index("ix_quantity_assumptions_snapshot_id", table_name="quantity_assumptions")
    for name in ["explicit_human_source", "evidence_refs", "stale_reason", "expires_at", "approval_status", "owner", "rationale", "scope", "unit", "value", "snapshot_id"]:
        op.drop_column("quantity_assumptions", name)
    op.drop_index("ix_measurement_fact_audits_measurement_id", table_name="measurement_fact_audits")
    op.drop_table("measurement_fact_audits")
    op.drop_index("ix_measurement_facts_supersedes_measurement_id", table_name="measurement_facts")
    op.drop_constraint("fk_measurement_facts_supersedes", "measurement_facts", type_="foreignkey")
    op.drop_column("measurement_facts", "superseded_at")
    op.drop_column("measurement_facts", "supersedes_measurement_id")
