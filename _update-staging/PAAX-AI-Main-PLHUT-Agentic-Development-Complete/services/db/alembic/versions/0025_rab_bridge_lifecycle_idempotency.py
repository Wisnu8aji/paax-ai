"""add RAB Bridge V2 lifecycle result and idempotency fields

Revision ID: 0025
Revises: 0024
"""
from alembic import op
import sqlalchemy as sa

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("rab_bridge_proposals", sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("rab_bridge_proposals", sa.Column("materialization_key", sa.String(), nullable=True))
    op.add_column("rab_bridge_proposals", sa.Column("materialization_result", sa.JSON(), nullable=True))
    op.add_column("rab_bridge_proposals", sa.Column("materialized_by", sa.String(), nullable=True))
    op.add_column("rab_bridge_proposals", sa.Column("materialized_at", sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint("uq_rab_bridge_proposals_materialization_key", "rab_bridge_proposals", ["materialization_key"])

def downgrade() -> None:
    op.drop_constraint("uq_rab_bridge_proposals_materialization_key", "rab_bridge_proposals", type_="unique")
    for name in ["materialized_at", "materialized_by", "materialization_result", "materialization_key", "revision"]:
        op.drop_column("rab_bridge_proposals", name)
