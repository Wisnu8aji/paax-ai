"""fix(db): db-level calculation_authority check constraint and composite project enforcement

Revision ID: 0035_calculation_authority_constraints
Revises: 0034_contextual_integrity
Create Date: 2026-07-29 00:00:00.000000

Adds:
  1. CHECK (calculation_authority = 'none') on canonical_facts — DB rejects any
     row that violates the Golden Rule (§1 AGENTS.md) at the storage level.
  2. CHECK (calculation_authority = 'none') on resolution_decisions — same Golden
     Rule enforcement at DB level.
  3. Composite unique constraint (decision_id, project_id) on
     resolution_decision_fact_links for same-project relational integrity.
  4. Index on canonical_fact_evidence_links.fact_id (if not already present)
     and region_id column for lineage traversal performance.
"""
from alembic import op
import sqlalchemy as sa

revision = "0035_calculation_authority_constraints"
down_revision = "0034_contextual_integrity"
branch_labels = None
depends_on = None


def upgrade():
    # 1. DB-level Golden Rule enforcement on canonical_facts
    op.create_check_constraint(
        "ck_canonical_facts_calculation_authority_none",
        "canonical_facts",
        "calculation_authority = 'none'",
    )

    # 2. DB-level Golden Rule enforcement on resolution_decisions
    op.create_check_constraint(
        "ck_resolution_decisions_calculation_authority_none",
        "resolution_decisions",
        "calculation_authority = 'none'",
    )

    # 3. Composite unique (decision_id, project_id) on resolution_decision_fact_links
    #    ensures a decision can only reference facts within its own project.
    op.create_unique_constraint(
        "uq_resolution_decision_fact_links_decision_project",
        "resolution_decision_fact_links",
        ["decision_id", "project_id"],
    )

    # 4. Index on canonical_fact_evidence_links.region_id for lineage traversal
    op.create_index(
        "ix_canonical_fact_evidence_links_region_id",
        "canonical_fact_evidence_links",
        ["region_id"],
    )


def downgrade():
    op.drop_index("ix_canonical_fact_evidence_links_region_id", table_name="canonical_fact_evidence_links")
    op.drop_constraint(
        "uq_resolution_decision_fact_links_decision_project",
        "resolution_decision_fact_links",
        type_="unique",
    )
    op.drop_constraint(
        "ck_resolution_decisions_calculation_authority_none",
        "resolution_decisions",
        type_="check",
    )
    op.drop_constraint(
        "ck_canonical_facts_calculation_authority_none",
        "canonical_facts",
        type_="check",
    )
