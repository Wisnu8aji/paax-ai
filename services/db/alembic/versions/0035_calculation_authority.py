"""fix(db): db-level calculation_authority check constraint and composite project enforcement

Revision ID: 0035_calculation_authority
Revises: 0034_contextual_integrity
Create Date: 2026-07-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = "0035_calculation_authority"
down_revision = "0034_contextual_integrity"
branch_labels = None
depends_on = None

def has_check_constraint(insp, table_name, name):
    if insp.bind.dialect.name == "sqlite": return False
    try:
        return any(c.get("name") == name for c in insp.get_check_constraints(table_name))
    except Exception:
        return False

def has_unique_constraint(insp, table_name, name):
    if insp.bind.dialect.name == "sqlite": return False
    try:
        return any(u.get("name") == name for u in insp.get_unique_constraints(table_name))
    except Exception:
        return False

def has_index(insp, table_name, name):
    try:
        return any(i.get("name") == name for i in insp.get_indexes(table_name))
    except Exception:
        return False

def upgrade():
    bind = op.get_bind()
    insp = Inspector.from_engine(bind)
    
    # 1. raw_evidence_artifacts
    with op.batch_alter_table("raw_evidence_artifacts") as batch_op:
        if not has_unique_constraint(insp, "raw_evidence_artifacts", "uq_raw_evidence_artifacts_id_project"):
            batch_op.create_unique_constraint("uq_raw_evidence_artifacts_id_project", ["artifact_id", "project_id"])

    # 2. raw_evidence_regions
    with op.batch_alter_table("raw_evidence_regions") as batch_op:
        # Postgres requires explicit constraint drop if exists, but we assume it always exists if the old schema is there
        # SQLite batch alter will handle it.
        # Wait, if we drop a foreign key in Postgres, it's safe if it exists.
        # But to be safe, we can just catch errors if we do it directly, or use batch_alter_table.
        batch_op.drop_constraint("raw_evidence_regions_artifact_id_fkey", type_="foreignkey")
        if not has_unique_constraint(insp, "raw_evidence_regions", "uq_raw_evidence_regions_id_project"):
            batch_op.create_unique_constraint("uq_raw_evidence_regions_id_project", ["region_id", "project_id"])
        batch_op.create_foreign_key(
            "raw_evidence_regions_artifact_id_fkey", 
            "raw_evidence_artifacts", 
            ["artifact_id", "project_id"], ["artifact_id", "project_id"], 
            ondelete="RESTRICT"
        )

    # 3. source_authority_entries
    with op.batch_alter_table("source_authority_entries") as batch_op:
        batch_op.drop_constraint("source_authority_entries_supersedes_authority_id_fkey", type_="foreignkey")
        if not has_unique_constraint(insp, "source_authority_entries", "uq_source_authority_entries_id_project"):
            batch_op.create_unique_constraint("uq_source_authority_entries_id_project", ["authority_id", "project_id"])
        batch_op.create_foreign_key(
            "source_authority_entries_supersedes_authority_id_fkey",
            "source_authority_entries",
            ["supersedes_authority_id", "project_id"], ["authority_id", "project_id"],
            ondelete="RESTRICT"
        )

    # 4. project_graph_snapshots
    with op.batch_alter_table("project_graph_snapshots") as batch_op:
        if not has_unique_constraint(insp, "project_graph_snapshots", "uq_project_graph_snapshots_id_project"):
            batch_op.create_unique_constraint("uq_project_graph_snapshots_id_project", ["snapshot_id", "project_id"])

    # 5. canonical_facts
    with op.batch_alter_table("canonical_facts") as batch_op:
        batch_op.drop_constraint("canonical_facts_snapshot_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("canonical_facts_source_authority_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("canonical_facts_supersedes_fact_id_fkey", type_="foreignkey")
        
        if not has_unique_constraint(insp, "canonical_facts", "uq_canonical_facts_id_project"):
            batch_op.create_unique_constraint("uq_canonical_facts_id_project", ["fact_id", "project_id"])
            
        if not has_check_constraint(insp, "canonical_facts", "ck_canonical_facts_calculation_authority_none"):
            batch_op.create_check_constraint("ck_canonical_facts_calculation_authority_none", "calculation_authority = 'none'")
            
        batch_op.create_foreign_key("canonical_facts_snapshot_id_fkey", "project_graph_snapshots", ["snapshot_id", "project_id"], ["snapshot_id", "project_id"], ondelete="RESTRICT")
        batch_op.create_foreign_key("canonical_facts_source_authority_id_fkey", "source_authority_entries", ["source_authority_id", "project_id"], ["authority_id", "project_id"], ondelete="RESTRICT")
        batch_op.create_foreign_key("canonical_facts_supersedes_fact_id_fkey", "canonical_facts", ["supersedes_fact_id", "project_id"], ["fact_id", "project_id"], ondelete="RESTRICT")

    # 6. canonical_fact_evidence_links
    columns = [c["name"] for c in insp.get_columns("canonical_fact_evidence_links")]
    if "project_id" not in columns:
        op.add_column("canonical_fact_evidence_links", sa.Column("project_id", sa.String(length=128), nullable=True))
        op.execute("UPDATE canonical_fact_evidence_links SET project_id = ''")
    
    with op.batch_alter_table("canonical_fact_evidence_links") as batch_op:
        batch_op.alter_column("project_id", existing_type=sa.String(length=128), nullable=False)
        batch_op.drop_constraint("canonical_fact_evidence_links_fact_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("canonical_fact_evidence_links_artifact_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("canonical_fact_evidence_links_region_id_fkey", type_="foreignkey")
        
        if not has_unique_constraint(insp, "canonical_fact_evidence_links", "uq_canonical_fact_evidence_links_id_project"):
            batch_op.create_unique_constraint("uq_canonical_fact_evidence_links_id_project", ["link_id", "project_id"])
            
        if not has_index(insp, "canonical_fact_evidence_links", "ix_canonical_fact_evidence_links_project_id"):
            batch_op.create_index("ix_canonical_fact_evidence_links_project_id", ["project_id"])
        if not has_index(insp, "canonical_fact_evidence_links", "ix_canonical_fact_evidence_links_region_id"):
            batch_op.create_index("ix_canonical_fact_evidence_links_region_id", ["region_id"])
        
        batch_op.create_foreign_key("canonical_fact_evidence_links_fact_id_fkey", "canonical_facts", ["fact_id", "project_id"], ["fact_id", "project_id"], ondelete="RESTRICT")
        batch_op.create_foreign_key("canonical_fact_evidence_links_artifact_id_fkey", "raw_evidence_artifacts", ["artifact_id", "project_id"], ["artifact_id", "project_id"], ondelete="RESTRICT")
        batch_op.create_foreign_key("canonical_fact_evidence_links_region_id_fkey", "raw_evidence_regions", ["region_id", "project_id"], ["region_id", "project_id"], ondelete="RESTRICT")

    # 7. resolution_decisions
    with op.batch_alter_table("resolution_decisions") as batch_op:
        batch_op.drop_constraint("resolution_decisions_snapshot_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("resolution_decisions_selected_fact_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("resolution_decisions_supersedes_decision_id_fkey", type_="foreignkey")
        
        if not has_unique_constraint(insp, "resolution_decisions", "uq_resolution_decisions_id_project"):
            batch_op.create_unique_constraint("uq_resolution_decisions_id_project", ["decision_id", "project_id"])
            
        if not has_check_constraint(insp, "resolution_decisions", "ck_resolution_decisions_calculation_authority_none"):
            batch_op.create_check_constraint("ck_resolution_decisions_calculation_authority_none", "calculation_authority = 'none'")
            
        if not has_check_constraint(insp, "resolution_decisions", "ck_resolution_decisions_approval_requirements"):
            batch_op.create_check_constraint(
                "ck_resolution_decisions_approval_requirements",
                "(status != 'approved') OR (decided_by IS NOT NULL AND selected_fact_id IS NOT NULL)"
            )
            
        batch_op.create_foreign_key("resolution_decisions_snapshot_id_fkey", "project_graph_snapshots", ["snapshot_id", "project_id"], ["snapshot_id", "project_id"], ondelete="RESTRICT")
        batch_op.create_foreign_key("resolution_decisions_selected_fact_id_fkey", "canonical_facts", ["selected_fact_id", "project_id"], ["fact_id", "project_id"], ondelete="RESTRICT")
        batch_op.create_foreign_key("resolution_decisions_supersedes_decision_id_fkey", "resolution_decisions", ["supersedes_decision_id", "project_id"], ["decision_id", "project_id"], ondelete="RESTRICT")

    # 8. resolution_decision_fact_links
    with op.batch_alter_table("resolution_decision_fact_links") as batch_op:
        batch_op.drop_constraint("resolution_decision_fact_links_decision_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("resolution_decision_fact_links_fact_id_fkey", type_="foreignkey")
        
        if not has_unique_constraint(insp, "resolution_decision_fact_links", "uq_resolution_decision_fact_links_decision_project"):
            batch_op.create_unique_constraint("uq_resolution_decision_fact_links_decision_project", ["decision_id", "project_id"])
            
        batch_op.create_foreign_key("resolution_decision_fact_links_decision_id_fkey", "resolution_decisions", ["decision_id", "project_id"], ["decision_id", "project_id"], ondelete="RESTRICT")
        batch_op.create_foreign_key("resolution_decision_fact_links_fact_id_fkey", "canonical_facts", ["fact_id", "project_id"], ["fact_id", "project_id"], ondelete="RESTRICT")


def downgrade():
    bind = op.get_bind()
    insp = Inspector.from_engine(bind)

    # 8. resolution_decision_fact_links
    with op.batch_alter_table("resolution_decision_fact_links") as batch_op:
        batch_op.drop_constraint("resolution_decision_fact_links_fact_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("resolution_decision_fact_links_decision_id_fkey", type_="foreignkey")
        if has_unique_constraint(insp, "resolution_decision_fact_links", "uq_resolution_decision_fact_links_decision_project"):
            batch_op.drop_constraint("uq_resolution_decision_fact_links_decision_project", type_="unique")
        batch_op.create_foreign_key("resolution_decision_fact_links_decision_id_fkey", "resolution_decisions", ["decision_id"], ["decision_id"], ondelete="RESTRICT")
        batch_op.create_foreign_key("resolution_decision_fact_links_fact_id_fkey", "canonical_facts", ["fact_id"], ["fact_id"], ondelete="RESTRICT")

    # 7. resolution_decisions
    with op.batch_alter_table("resolution_decisions") as batch_op:
        batch_op.drop_constraint("resolution_decisions_supersedes_decision_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("resolution_decisions_selected_fact_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("resolution_decisions_snapshot_id_fkey", type_="foreignkey")
        if has_check_constraint(insp, "resolution_decisions", "ck_resolution_decisions_approval_requirements"):
            batch_op.drop_constraint("ck_resolution_decisions_approval_requirements", type_="check")
        if has_check_constraint(insp, "resolution_decisions", "ck_resolution_decisions_calculation_authority_none"):
            batch_op.drop_constraint("ck_resolution_decisions_calculation_authority_none", type_="check")
        if has_unique_constraint(insp, "resolution_decisions", "uq_resolution_decisions_id_project"):
            batch_op.drop_constraint("uq_resolution_decisions_id_project", type_="unique")
        batch_op.create_foreign_key("resolution_decisions_snapshot_id_fkey", "project_graph_snapshots", ["snapshot_id"], ["snapshot_id"], ondelete="RESTRICT")
        batch_op.create_foreign_key("resolution_decisions_selected_fact_id_fkey", "canonical_facts", ["selected_fact_id"], ["fact_id"], ondelete="RESTRICT")
        batch_op.create_foreign_key("resolution_decisions_supersedes_decision_id_fkey", "resolution_decisions", ["supersedes_decision_id"], ["decision_id"], ondelete="RESTRICT")

    # 6. canonical_fact_evidence_links
    with op.batch_alter_table("canonical_fact_evidence_links") as batch_op:
        batch_op.drop_constraint("canonical_fact_evidence_links_region_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("canonical_fact_evidence_links_artifact_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("canonical_fact_evidence_links_fact_id_fkey", type_="foreignkey")
        if has_index(insp, "canonical_fact_evidence_links", "ix_canonical_fact_evidence_links_region_id"):
            batch_op.drop_index("ix_canonical_fact_evidence_links_region_id")
        if has_index(insp, "canonical_fact_evidence_links", "ix_canonical_fact_evidence_links_project_id"):
            batch_op.drop_index("ix_canonical_fact_evidence_links_project_id")
        if has_unique_constraint(insp, "canonical_fact_evidence_links", "uq_canonical_fact_evidence_links_id_project"):
            batch_op.drop_constraint("uq_canonical_fact_evidence_links_id_project", type_="unique")
        batch_op.create_foreign_key("canonical_fact_evidence_links_fact_id_fkey", "canonical_facts", ["fact_id"], ["fact_id"], ondelete="RESTRICT")
        batch_op.create_foreign_key("canonical_fact_evidence_links_artifact_id_fkey", "raw_evidence_artifacts", ["artifact_id"], ["artifact_id"], ondelete="RESTRICT")
        batch_op.create_foreign_key("canonical_fact_evidence_links_region_id_fkey", "raw_evidence_regions", ["region_id"], ["region_id"], ondelete="RESTRICT")
        batch_op.drop_column("project_id")

    # 5. canonical_facts
    with op.batch_alter_table("canonical_facts") as batch_op:
        batch_op.drop_constraint("canonical_facts_supersedes_fact_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("canonical_facts_source_authority_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("canonical_facts_snapshot_id_fkey", type_="foreignkey")
        if has_check_constraint(insp, "canonical_facts", "ck_canonical_facts_calculation_authority_none"):
            batch_op.drop_constraint("ck_canonical_facts_calculation_authority_none", type_="check")
        batch_op.create_foreign_key("canonical_facts_snapshot_id_fkey", "project_graph_snapshots", ["snapshot_id"], ["snapshot_id"], ondelete="RESTRICT")
        batch_op.create_foreign_key("canonical_facts_source_authority_id_fkey", "source_authority_entries", ["source_authority_id"], ["authority_id"], ondelete="RESTRICT")
        batch_op.create_foreign_key("canonical_facts_supersedes_fact_id_fkey", "canonical_facts", ["supersedes_fact_id"], ["fact_id"], ondelete="RESTRICT")

    # 3. source_authority_entries
    with op.batch_alter_table("source_authority_entries") as batch_op:
        batch_op.drop_constraint("source_authority_entries_supersedes_authority_id_fkey", type_="foreignkey")
        batch_op.create_foreign_key("source_authority_entries_supersedes_authority_id_fkey", "source_authority_entries", ["supersedes_authority_id"], ["authority_id"], ondelete="RESTRICT")

    # 2. raw_evidence_regions
    with op.batch_alter_table("raw_evidence_regions") as batch_op:
        batch_op.drop_constraint("raw_evidence_regions_artifact_id_fkey", type_="foreignkey")
        batch_op.create_foreign_key("raw_evidence_regions_artifact_id_fkey", "raw_evidence_artifacts", ["artifact_id"], ["artifact_id"], ondelete="RESTRICT")
