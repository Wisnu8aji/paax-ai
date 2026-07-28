"""fix(db): db-level calculation_authority check constraint and composite project enforcement

Revision ID: 0035_calculation_authority
Revises: 0034_contextual_integrity
Create Date: 2026-07-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0035_calculation_authority"
down_revision = "0034_contextual_integrity"
branch_labels = None
depends_on = None

def upgrade():
    # Drop old foreign keys that don't include project_id
    op.drop_constraint("raw_evidence_regions_artifact_id_fkey", "raw_evidence_regions", type_="foreignkey")
    op.drop_constraint("source_authority_entries_supersedes_authority_id_fkey", "source_authority_entries", type_="foreignkey")
    op.drop_constraint("canonical_facts_snapshot_id_fkey", "canonical_facts", type_="foreignkey")
    op.drop_constraint("canonical_facts_source_authority_id_fkey", "canonical_facts", type_="foreignkey")
    op.drop_constraint("canonical_facts_supersedes_fact_id_fkey", "canonical_facts", type_="foreignkey")
    op.drop_constraint("canonical_fact_evidence_links_fact_id_fkey", "canonical_fact_evidence_links", type_="foreignkey")
    op.drop_constraint("canonical_fact_evidence_links_artifact_id_fkey", "canonical_fact_evidence_links", type_="foreignkey")
    op.drop_constraint("canonical_fact_evidence_links_region_id_fkey", "canonical_fact_evidence_links", type_="foreignkey")
    
    # Add project_id to canonical_fact_evidence_links
    op.add_column("canonical_fact_evidence_links", sa.Column("project_id", sa.String(length=128), nullable=True))
    op.execute("UPDATE canonical_fact_evidence_links SET project_id = ''")
    op.alter_column("canonical_fact_evidence_links", "project_id", nullable=False)
    op.create_index("ix_canonical_fact_evidence_links_project_id", "canonical_fact_evidence_links", ["project_id"])
    
    op.drop_constraint("resolution_decisions_snapshot_id_fkey", "resolution_decisions", type_="foreignkey")
    op.drop_constraint("resolution_decisions_selected_fact_id_fkey", "resolution_decisions", type_="foreignkey")
    op.drop_constraint("resolution_decisions_supersedes_decision_id_fkey", "resolution_decisions", type_="foreignkey")
    op.drop_constraint("resolution_decision_fact_links_decision_id_fkey", "resolution_decision_fact_links", type_="foreignkey")
    op.drop_constraint("resolution_decision_fact_links_fact_id_fkey", "resolution_decision_fact_links", type_="foreignkey")
    
    # Add Composite Unique constraints
    op.create_unique_constraint("uq_raw_evidence_regions_id_project", "raw_evidence_regions", ["region_id", "project_id"])
    op.create_unique_constraint("uq_resolution_decisions_id_project", "resolution_decisions", ["decision_id", "project_id"])
    op.create_unique_constraint("uq_canonical_fact_evidence_links_id_project", "canonical_fact_evidence_links", ["link_id", "project_id"])
    op.create_unique_constraint("uq_resolution_decision_fact_links_decision_project", "resolution_decision_fact_links", ["decision_id", "project_id"])

    # Recreate foreign keys as composite
    op.create_foreign_key("raw_evidence_regions_artifact_id_fkey", "raw_evidence_regions", "raw_evidence_artifacts", ["artifact_id", "project_id"], ["artifact_id", "project_id"], ondelete="RESTRICT")
    
    op.create_foreign_key("source_authority_entries_supersedes_authority_id_fkey", "source_authority_entries", "source_authority_entries", ["supersedes_authority_id", "project_id"], ["authority_id", "project_id"], ondelete="RESTRICT")
    
    op.create_foreign_key("canonical_facts_snapshot_id_fkey", "canonical_facts", "project_graph_snapshots", ["snapshot_id", "project_id"], ["snapshot_id", "project_id"], ondelete="RESTRICT")
    op.create_foreign_key("canonical_facts_source_authority_id_fkey", "canonical_facts", "source_authority_entries", ["source_authority_id", "project_id"], ["authority_id", "project_id"], ondelete="RESTRICT")
    op.create_foreign_key("canonical_facts_supersedes_fact_id_fkey", "canonical_facts", "canonical_facts", ["supersedes_fact_id", "project_id"], ["fact_id", "project_id"], ondelete="RESTRICT")
    
    op.create_foreign_key("canonical_fact_evidence_links_fact_id_fkey", "canonical_fact_evidence_links", "canonical_facts", ["fact_id", "project_id"], ["fact_id", "project_id"], ondelete="RESTRICT")
    op.create_foreign_key("canonical_fact_evidence_links_artifact_id_fkey", "canonical_fact_evidence_links", "raw_evidence_artifacts", ["artifact_id", "project_id"], ["artifact_id", "project_id"], ondelete="RESTRICT")
    op.create_foreign_key("canonical_fact_evidence_links_region_id_fkey", "canonical_fact_evidence_links", "raw_evidence_regions", ["region_id", "project_id"], ["region_id", "project_id"], ondelete="RESTRICT")
    
    op.create_foreign_key("resolution_decisions_snapshot_id_fkey", "resolution_decisions", "project_graph_snapshots", ["snapshot_id", "project_id"], ["snapshot_id", "project_id"], ondelete="RESTRICT")
    op.create_foreign_key("resolution_decisions_selected_fact_id_fkey", "resolution_decisions", "canonical_facts", ["selected_fact_id", "project_id"], ["fact_id", "project_id"], ondelete="RESTRICT")
    op.create_foreign_key("resolution_decisions_supersedes_decision_id_fkey", "resolution_decisions", "resolution_decisions", ["supersedes_decision_id", "project_id"], ["decision_id", "project_id"], ondelete="RESTRICT")
    
    op.create_foreign_key("resolution_decision_fact_links_decision_id_fkey", "resolution_decision_fact_links", "resolution_decisions", ["decision_id", "project_id"], ["decision_id", "project_id"], ondelete="RESTRICT")
    op.create_foreign_key("resolution_decision_fact_links_fact_id_fkey", "resolution_decision_fact_links", "canonical_facts", ["fact_id", "project_id"], ["fact_id", "project_id"], ondelete="RESTRICT")
    
    # Check constraints
    op.create_check_constraint("ck_canonical_facts_calculation_authority_none", "canonical_facts", "calculation_authority = 'none'")
    op.create_check_constraint("ck_resolution_decisions_calculation_authority_none", "resolution_decisions", "calculation_authority = 'none'")
    op.create_check_constraint(
        "ck_resolution_decisions_approval_requirements",
        "resolution_decisions",
        "(status != 'approved') OR (decided_by IS NOT NULL AND selected_fact_id IS NOT NULL)"
    )
    op.create_index("ix_canonical_fact_evidence_links_region_id", "canonical_fact_evidence_links", ["region_id"])


def downgrade():
    op.drop_index("ix_canonical_fact_evidence_links_region_id", table_name="canonical_fact_evidence_links")
    op.drop_constraint("ck_resolution_decisions_approval_requirements", "resolution_decisions", type_="check")
    op.drop_constraint("ck_resolution_decisions_calculation_authority_none", "resolution_decisions", type_="check")
    op.drop_constraint("ck_canonical_facts_calculation_authority_none", "canonical_facts", type_="check")
    
    op.drop_constraint("resolution_decision_fact_links_fact_id_fkey", "resolution_decision_fact_links", type_="foreignkey")
    op.drop_constraint("resolution_decision_fact_links_decision_id_fkey", "resolution_decision_fact_links", type_="foreignkey")
    op.drop_constraint("resolution_decisions_supersedes_decision_id_fkey", "resolution_decisions", type_="foreignkey")
    op.drop_constraint("resolution_decisions_selected_fact_id_fkey", "resolution_decisions", type_="foreignkey")
    op.drop_constraint("resolution_decisions_snapshot_id_fkey", "resolution_decisions", type_="foreignkey")
    op.drop_constraint("canonical_fact_evidence_links_region_id_fkey", "canonical_fact_evidence_links", type_="foreignkey")
    op.drop_constraint("canonical_fact_evidence_links_artifact_id_fkey", "canonical_fact_evidence_links", type_="foreignkey")
    op.drop_constraint("canonical_fact_evidence_links_fact_id_fkey", "canonical_fact_evidence_links", type_="foreignkey")
    op.drop_constraint("canonical_facts_supersedes_fact_id_fkey", "canonical_facts", type_="foreignkey")
    op.drop_constraint("canonical_facts_source_authority_id_fkey", "canonical_facts", type_="foreignkey")
    op.drop_constraint("canonical_facts_snapshot_id_fkey", "canonical_facts", type_="foreignkey")
    op.drop_constraint("source_authority_entries_supersedes_authority_id_fkey", "source_authority_entries", type_="foreignkey")
    op.drop_constraint("raw_evidence_regions_artifact_id_fkey", "raw_evidence_regions", type_="foreignkey")
    
    op.drop_constraint("uq_resolution_decision_fact_links_decision_project", "resolution_decision_fact_links", type_="unique")
    op.drop_constraint("uq_canonical_fact_evidence_links_id_project", "canonical_fact_evidence_links", type_="unique")
    op.drop_constraint("uq_resolution_decisions_id_project", "resolution_decisions", type_="unique")
    op.drop_constraint("uq_raw_evidence_regions_id_project", "raw_evidence_regions", type_="unique")
    
    op.create_foreign_key("resolution_decision_fact_links_fact_id_fkey", "resolution_decision_fact_links", "canonical_facts", ["fact_id"], ["fact_id"], ondelete="RESTRICT")
    op.create_foreign_key("resolution_decision_fact_links_decision_id_fkey", "resolution_decision_fact_links", "resolution_decisions", ["decision_id"], ["decision_id"], ondelete="RESTRICT")
    op.create_foreign_key("resolution_decisions_supersedes_decision_id_fkey", "resolution_decisions", "resolution_decisions", ["supersedes_decision_id"], ["decision_id"], ondelete="RESTRICT")
    op.create_foreign_key("resolution_decisions_selected_fact_id_fkey", "resolution_decisions", "canonical_facts", ["selected_fact_id"], ["fact_id"], ondelete="RESTRICT")
    op.create_foreign_key("resolution_decisions_snapshot_id_fkey", "resolution_decisions", "project_graph_snapshots", ["snapshot_id"], ["snapshot_id"], ondelete="RESTRICT")
    op.create_foreign_key("canonical_fact_evidence_links_region_id_fkey", "canonical_fact_evidence_links", "raw_evidence_regions", ["region_id"], ["region_id"], ondelete="RESTRICT")
    op.create_foreign_key("canonical_fact_evidence_links_artifact_id_fkey", "canonical_fact_evidence_links", "raw_evidence_artifacts", ["artifact_id"], ["artifact_id"], ondelete="RESTRICT")
    op.create_foreign_key("canonical_fact_evidence_links_fact_id_fkey", "canonical_fact_evidence_links", "canonical_facts", ["fact_id"], ["fact_id"], ondelete="RESTRICT")
    op.create_foreign_key("canonical_facts_supersedes_fact_id_fkey", "canonical_facts", "canonical_facts", ["supersedes_fact_id"], ["fact_id"], ondelete="RESTRICT")
    op.create_foreign_key("canonical_facts_source_authority_id_fkey", "canonical_facts", "source_authority_entries", ["source_authority_id"], ["authority_id"], ondelete="RESTRICT")
    op.create_foreign_key("canonical_facts_snapshot_id_fkey", "canonical_facts", "project_graph_snapshots", ["snapshot_id"], ["snapshot_id"], ondelete="RESTRICT")
    op.create_foreign_key("source_authority_entries_supersedes_authority_id_fkey", "source_authority_entries", "source_authority_entries", ["supersedes_authority_id"], ["authority_id"], ondelete="RESTRICT")
    op.create_foreign_key("raw_evidence_regions_artifact_id_fkey", "raw_evidence_regions", "raw_evidence_artifacts", ["artifact_id"], ["artifact_id"], ondelete="RESTRICT")
    
    op.drop_index("ix_canonical_fact_evidence_links_project_id", table_name="canonical_fact_evidence_links")
    op.drop_column("canonical_fact_evidence_links", "project_id")
