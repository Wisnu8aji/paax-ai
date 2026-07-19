"""Add bounded, correlated observability metadata to usage events.

Revision ID: 0029_observability_contract
Revises: 0028_dem_artifact_retention
"""
from alembic import op
import sqlalchemy as sa


revision = "0029_observability_contract"
down_revision = "0028_dem_artifact_retention"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_usage_log", sa.Column("correlation_id", sa.String(length=128), nullable=True))
    op.add_column("ai_usage_log", sa.Column("run_id", sa.String(length=128), nullable=True))
    op.add_column("ai_usage_log", sa.Column("project_id", sa.String(length=128), nullable=True))
    op.add_column("ai_usage_log", sa.Column("snapshot_id", sa.String(length=128), nullable=True))
    op.add_column("ai_usage_log", sa.Column("calculation_id", sa.String(length=128), nullable=True))
    op.add_column("ai_usage_log", sa.Column("event_type", sa.String(length=120), nullable=False, server_default="usage"))
    op.add_column("ai_usage_log", sa.Column("status", sa.String(length=64), nullable=False, server_default="completed"))
    op.add_column("ai_usage_log", sa.Column("metric_count", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("ai_usage_log", sa.Column("cost_microunits", sa.Integer(), nullable=True))
    op.add_column("ai_usage_log", sa.Column("metadata_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))
    for name, columns in (
        ("ix_ai_usage_log_correlation_id", ["correlation_id"]),
        ("ix_ai_usage_log_run_id", ["run_id"]),
        ("ix_ai_usage_log_project_id", ["project_id"]),
        ("ix_ai_usage_log_snapshot_id", ["snapshot_id"]),
        ("ix_ai_usage_log_calculation_id", ["calculation_id"]),
    ):
        op.create_index(name, "ai_usage_log", columns)


def downgrade() -> None:
    for name in (
        "ix_ai_usage_log_calculation_id", "ix_ai_usage_log_snapshot_id", "ix_ai_usage_log_project_id",
        "ix_ai_usage_log_run_id", "ix_ai_usage_log_correlation_id",
    ):
        op.drop_index(name, table_name="ai_usage_log")
    for name in (
        "metadata_json", "cost_microunits", "metric_count", "status", "event_type", "calculation_id",
        "snapshot_id", "project_id", "run_id", "correlation_id",
    ):
        op.drop_column("ai_usage_log", name)
