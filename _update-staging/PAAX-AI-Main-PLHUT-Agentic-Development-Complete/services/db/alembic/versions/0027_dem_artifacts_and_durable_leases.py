"""replace DEM host paths with portable artifact keys and job lease metadata

Revision ID: 0027
Revises: 0026
"""
from alembic import op
import sqlalchemy as sa

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dem_runs", sa.Column("artifact_key", sa.String(), nullable=True))
    # Preserve legacy values for forensic compatibility but no new code reads them.
    op.add_column("durable_jobs", sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("durable_jobs", sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("durable_jobs", sa.Column("cancel_requested_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("durable_jobs", sa.Column("poisoned_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_durable_jobs_lease_expires_at", "durable_jobs", ["lease_expires_at"])
    op.create_index("ix_durable_jobs_next_attempt_at", "durable_jobs", ["next_attempt_at"])


def downgrade() -> None:
    op.drop_index("ix_durable_jobs_next_attempt_at", table_name="durable_jobs")
    op.drop_index("ix_durable_jobs_lease_expires_at", table_name="durable_jobs")
    for column in ("poisoned_at", "cancel_requested_at", "next_attempt_at", "lease_expires_at"):
        op.drop_column("durable_jobs", column)
    op.drop_column("dem_runs", "artifact_key")
