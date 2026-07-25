"""add portable durable job queue state

Revision ID: 0026
Revises: 0025
"""
from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table("durable_jobs", sa.Column("id", sa.String(), primary_key=True), sa.Column("job_type", sa.String(), nullable=False), sa.Column("payload", sa.JSON(), nullable=False), sa.Column("idempotency_key", sa.String(), nullable=False, unique=True), sa.Column("status", sa.String(), nullable=False), sa.Column("lease_owner", sa.String(), nullable=True), sa.Column("attempt_count", sa.Integer(), nullable=False), sa.Column("last_error", sa.Text(), nullable=True), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False))
    for column in ["job_type", "status", "lease_owner"]: op.create_index(f"ix_durable_jobs_{column}", "durable_jobs", [column])

def downgrade() -> None:
    for column in ["lease_owner", "status", "job_type"]: op.drop_index(f"ix_durable_jobs_{column}", table_name="durable_jobs")
    op.drop_table("durable_jobs")
