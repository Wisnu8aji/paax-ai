"""Add durable DEM artifact retention tombstones.

Revision ID: 0028_dem_artifact_retention
Revises: 0027_dem_artifacts_and_durable_leases
"""
from alembic import op
import sqlalchemy as sa


revision = "0028_dem_artifact_retention"
down_revision = "0027_dem_artifacts_and_durable_leases"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dem_runs", sa.Column("artifact_deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("dem_runs", sa.Column("artifact_deleted_by", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("dem_runs", "artifact_deleted_by")
    op.drop_column("dem_runs", "artifact_deleted_at")
