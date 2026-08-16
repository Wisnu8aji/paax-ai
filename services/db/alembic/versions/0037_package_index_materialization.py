"""Persist the project/run-scoped canonical drawing package index.

Revision ID: 0037_package_index_materialization
Revises: 0036
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0037_package_index_materialization"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Alembic creates version_num as VARCHAR(32), while this revision ID is
    # longer than that limit. Widen the metadata column before Alembic stamps
    # the new revision so PostgreSQL upgrades remain valid.
    if op.get_bind().dialect.name == "postgresql":
        op.alter_column(
            "alembic_version",
            "version_num",
            existing_type=sa.String(length=32),
            type_=sa.String(length=64),
            existing_nullable=False,
        )

    inspector = inspect(op.get_bind())
    existing = {column["name"] for column in inspector.get_columns("dem_pages")}
    fields = (
        ("paax_classification", sa.String()),
        ("paax_discipline", sa.String()),
        ("paax_level", sa.String()),
        ("paax_non_level_category", sa.String()),
        ("paax_classification_status", sa.String()),
        ("paax_classification_source", sa.String()),
        ("paax_rule_version", sa.String()),
        ("paax_review_decision", sa.String()),
    )
    missing = [(name, kind) for name, kind in fields if name not in existing]
    if missing:
        with op.batch_alter_table("dem_pages") as batch:
            for name, kind in missing:
                batch.add_column(sa.Column(name, kind, nullable=True))
    indexes = {index["name"] for index in inspect(op.get_bind()).get_indexes("dem_pages")}
    if "ix_dem_pages_paax_classification_status" not in indexes:
        op.create_index("ix_dem_pages_paax_classification_status", "dem_pages", ["paax_classification_status"])


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    indexes = {index["name"] for index in inspector.get_indexes("dem_pages")}
    if "ix_dem_pages_paax_classification_status" in indexes:
        op.drop_index("ix_dem_pages_paax_classification_status", table_name="dem_pages")
    existing = {column["name"] for column in inspect(op.get_bind()).get_columns("dem_pages")}
    with op.batch_alter_table("dem_pages") as batch:
        for name in ("paax_review_decision", "paax_rule_version", "paax_classification_source",
                     "paax_classification_status", "paax_non_level_category", "paax_level",
                     "paax_discipline", "paax_classification"):
            if name in existing:
                batch.drop_column(name)
