"""fix(db): enforce contextual evidence integrity

Revision ID: 0034_contextual_evidence_integrity
Revises: 0033_contextual_foundation
Create Date: 2026-07-28 21:40:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0034_contextual_evidence_integrity"
down_revision = "0033_contextual_foundation"
branch_labels = None
depends_on = None

JSON_DOCUMENT = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade():
    # 1. Add composite unique constraints for relational integrity across project boundaries
    op.create_unique_constraint(
        "uq_raw_evidence_artifacts_id_project",
        "raw_evidence_artifacts",
        ["artifact_id", "project_id"],
    )
    op.create_unique_constraint(
        "uq_source_authority_entries_id_project",
        "source_authority_entries",
        ["authority_id", "project_id"],
    )
    op.create_unique_constraint(
        "uq_canonical_facts_id_project",
        "canonical_facts",
        ["fact_id", "project_id"],
    )

    # 2. Add relational resolution decision target fact links table
    op.create_table(
        "resolution_decision_fact_links",
        sa.Column("link_id", sa.String(length=128), nullable=False),
        sa.Column("decision_id", sa.String(length=128), nullable=False),
        sa.Column("fact_id", sa.String(length=128), nullable=False),
        sa.Column("project_id", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["decision_id"], ["resolution_decisions.decision_id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["fact_id"], ["canonical_facts.fact_id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("link_id"),
        sa.UniqueConstraint("decision_id", "fact_id", name="uq_resolution_decision_fact_links_pair"),
    )
    op.create_index("ix_resolution_decision_fact_links_decision_id", "resolution_decision_fact_links", ["decision_id"])
    op.create_index("ix_resolution_decision_fact_links_fact_id", "resolution_decision_fact_links", ["fact_id"])
    op.create_index("ix_resolution_decision_fact_links_project_id", "resolution_decision_fact_links", ["project_id"])


def downgrade():
    op.drop_index("ix_resolution_decision_fact_links_project_id", table_name="resolution_decision_fact_links")
    op.drop_index("ix_resolution_decision_fact_links_fact_id", table_name="resolution_decision_fact_links")
    op.drop_index("ix_resolution_decision_fact_links_decision_id", table_name="resolution_decision_fact_links")
    op.drop_table("resolution_decision_fact_links")

    op.drop_constraint("uq_canonical_facts_id_project", "canonical_facts", type_="unique")
    op.drop_constraint("uq_source_authority_entries_id_project", "source_authority_entries", type_="unique")
    op.drop_constraint("uq_raw_evidence_artifacts_id_project", "raw_evidence_artifacts", type_="unique")
