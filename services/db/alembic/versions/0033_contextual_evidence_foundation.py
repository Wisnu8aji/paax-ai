"""feat(db): add append-only contextual evidence storage

Revision ID: 0033_contextual_foundation
Revises: 0032_correction_status
Create Date: 2026-07-28 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql, sqlite

revision = "0033_contextual_foundation"
down_revision = "0032_correction_status"
branch_labels = None
depends_on = None

# Portable JSON document type matching existing migrations
JSON_DOCUMENT = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade():
    # 1. raw_evidence_artifacts
    op.create_table(
        "raw_evidence_artifacts",
        sa.Column("artifact_id", sa.String(length=128), nullable=False),
        sa.Column("project_id", sa.String(length=128), nullable=False),
        sa.Column("document_id", sa.String(length=128), nullable=False),
        sa.Column("document_revision_id", sa.String(length=128), nullable=True),
        sa.Column("artifact_kind", sa.String(length=64), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("storage_ref", sa.String(length=512), nullable=False),
        sa.Column("media_type", sa.String(length=128), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("artifact_id"),
        sa.CheckConstraint(
            "artifact_kind IN ('original_document', 'json1_raw', 'dem_page', 'extracted_text', 'extracted_vector')",
            name="ck_raw_evidence_artifacts_kind",
        ),
    )
    op.create_index("ix_raw_evidence_artifacts_project_id", "raw_evidence_artifacts", ["project_id"])
    op.create_index("ix_raw_evidence_artifacts_document_id", "raw_evidence_artifacts", ["document_id"])
    op.create_index("ix_raw_evidence_artifacts_sha256", "raw_evidence_artifacts", ["content_sha256"])

    # 2. raw_evidence_regions
    op.create_table(
        "raw_evidence_regions",
        sa.Column("region_id", sa.String(length=128), nullable=False),
        sa.Column("artifact_id", sa.String(length=128), nullable=False),
        sa.Column("project_id", sa.String(length=128), nullable=False),
        sa.Column("page_index", sa.Integer(), nullable=False),
        sa.Column("sheet_id", sa.String(length=128), nullable=True),
        sa.Column("sheet_revision_id", sa.String(length=128), nullable=True),
        sa.Column("view_id", sa.String(length=128), nullable=True),
        sa.Column("zone_id", sa.String(length=128), nullable=True),
        sa.Column("bbox_space", sa.String(length=32), nullable=False, server_default="none"),
        sa.Column("bbox_x", sa.Float(), nullable=True),
        sa.Column("bbox_y", sa.Float(), nullable=True),
        sa.Column("bbox_w", sa.Float(), nullable=True),
        sa.Column("bbox_h", sa.Float(), nullable=True),
        sa.Column("project_graph_snapshot_id", sa.String(length=128), nullable=True),
        sa.Column("project_graph_evidence_id", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["artifact_id"], ["raw_evidence_artifacts.artifact_id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("region_id"),
        sa.CheckConstraint(
            "bbox_space IN ('pdf_points', 'normalized_page', 'pixel', 'none')",
            name="ck_raw_evidence_regions_space",
        ),
    )
    op.create_index("ix_raw_evidence_regions_artifact_id", "raw_evidence_regions", ["artifact_id"])
    op.create_index("ix_raw_evidence_regions_project_id", "raw_evidence_regions", ["project_id"])
    op.create_index("ix_raw_evidence_regions_sheet_id", "raw_evidence_regions", ["sheet_id"])

    # 3. source_authority_entries
    op.create_table(
        "source_authority_entries",
        sa.Column("authority_id", sa.String(length=128), nullable=False),
        sa.Column("project_id", sa.String(length=128), nullable=False),
        sa.Column("source_kind", sa.String(length=64), nullable=False),
        sa.Column("source_ref", sa.String(length=128), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("scope", JSON_DOCUMENT, nullable=False),
        sa.Column("evidence_refs", JSON_DOCUMENT, nullable=False),
        sa.Column("supersedes_authority_id", sa.String(length=128), nullable=True),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["supersedes_authority_id"], ["source_authority_entries.authority_id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("authority_id"),
    )
    op.create_index("ix_source_authority_entries_project_id", "source_authority_entries", ["project_id"])

    # 4. canonical_facts
    op.create_table(
        "canonical_facts",
        sa.Column("fact_id", sa.String(length=128), nullable=False),
        sa.Column("project_id", sa.String(length=128), nullable=False),
        sa.Column("snapshot_id", sa.String(length=128), nullable=False),
        sa.Column("fact_type", sa.String(length=64), nullable=False),
        sa.Column("subject_ref", sa.String(length=128), nullable=False),
        sa.Column("predicate", sa.String(length=128), nullable=False),
        sa.Column("value", JSON_DOCUMENT, nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="candidate"),
        sa.Column("source_authority_id", sa.String(length=128), nullable=True),
        sa.Column("supersedes_fact_id", sa.String(length=128), nullable=True),
        sa.Column("calculation_authority", sa.String(length=32), nullable=False, server_default="none"),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["snapshot_id"], ["project_graph_snapshots.snapshot_id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["source_authority_id"], ["source_authority_entries.authority_id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["supersedes_fact_id"], ["canonical_facts.fact_id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("fact_id"),
        sa.CheckConstraint(
            "status IN ('candidate', 'human_verified', 'superseded', 'stale')",
            name="ck_canonical_facts_status",
        ),
        sa.CheckConstraint(
            "calculation_authority = 'none'",
            name="ck_canonical_facts_calc_authority",
        ),
    )
    op.create_index("ix_canonical_facts_project_id", "canonical_facts", ["project_id"])
    op.create_index("ix_canonical_facts_snapshot_id", "canonical_facts", ["snapshot_id"])
    op.create_index("ix_canonical_facts_subject_ref", "canonical_facts", ["subject_ref"])

    # 5. canonical_fact_evidence_links
    op.create_table(
        "canonical_fact_evidence_links",
        sa.Column("link_id", sa.String(length=128), nullable=False),
        sa.Column("fact_id", sa.String(length=128), nullable=False),
        sa.Column("artifact_id", sa.String(length=128), nullable=False),
        sa.Column("region_id", sa.String(length=128), nullable=True),
        sa.Column("project_graph_snapshot_id", sa.String(length=128), nullable=True),
        sa.Column("project_graph_evidence_id", sa.String(length=128), nullable=True),
        sa.Column("role", sa.String(length=32), nullable=False, server_default="source"),
        sa.ForeignKeyConstraint(["fact_id"], ["canonical_facts.fact_id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["artifact_id"], ["raw_evidence_artifacts.artifact_id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["region_id"], ["raw_evidence_regions.region_id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("link_id"),
        sa.CheckConstraint(
            "role IN ('source', 'corroborating', 'contradicting', 'decision')",
            name="ck_canonical_fact_evidence_links_role",
        ),
    )
    op.create_index("ix_canonical_fact_evidence_links_fact_id", "canonical_fact_evidence_links", ["fact_id"])
    op.create_index("ix_canonical_fact_evidence_links_artifact_id", "canonical_fact_evidence_links", ["artifact_id"])

    # 6. resolution_decisions
    op.create_table(
        "resolution_decisions",
        sa.Column("decision_id", sa.String(length=128), nullable=False),
        sa.Column("project_id", sa.String(length=128), nullable=False),
        sa.Column("snapshot_id", sa.String(length=128), nullable=False),
        sa.Column("target_fact_ids", JSON_DOCUMENT, nullable=False),
        sa.Column("selected_fact_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="proposed"),
        sa.Column("scope", JSON_DOCUMENT, nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("decided_by", sa.String(length=128), nullable=True),
        sa.Column("supersedes_decision_id", sa.String(length=128), nullable=True),
        sa.Column("calculation_authority", sa.String(length=32), nullable=False, server_default="none"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["snapshot_id"], ["project_graph_snapshots.snapshot_id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["selected_fact_id"], ["canonical_facts.fact_id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["supersedes_decision_id"], ["resolution_decisions.decision_id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("decision_id"),
        sa.CheckConstraint(
            "status IN ('proposed', 'approved', 'rejected', 'stale', 'superseded')",
            name="ck_resolution_decisions_status",
        ),
        sa.CheckConstraint(
            "calculation_authority = 'none'",
            name="ck_resolution_decisions_calc_authority",
        ),
    )
    op.create_index("ix_resolution_decisions_project_id", "resolution_decisions", ["project_id"])
    op.create_index("ix_resolution_decisions_snapshot_id", "resolution_decisions", ["snapshot_id"])


def downgrade():
    op.drop_index("ix_resolution_decisions_snapshot_id", table_name="resolution_decisions")
    op.drop_index("ix_resolution_decisions_project_id", table_name="resolution_decisions")
    op.drop_table("resolution_decisions")

    op.drop_index("ix_canonical_fact_evidence_links_artifact_id", table_name="canonical_fact_evidence_links")
    op.drop_index("ix_canonical_fact_evidence_links_fact_id", table_name="canonical_fact_evidence_links")
    op.drop_table("canonical_fact_evidence_links")

    op.drop_index("ix_canonical_facts_subject_ref", table_name="canonical_facts")
    op.drop_index("ix_canonical_facts_snapshot_id", table_name="canonical_facts")
    op.drop_index("ix_canonical_facts_project_id", table_name="canonical_facts")
    op.drop_table("canonical_facts")

    op.drop_index("ix_source_authority_entries_project_id", table_name="source_authority_entries")
    op.drop_table("source_authority_entries")

    op.drop_index("ix_raw_evidence_regions_sheet_id", table_name="raw_evidence_regions")
    op.drop_index("ix_raw_evidence_regions_project_id", table_name="raw_evidence_regions")
    op.drop_index("ix_raw_evidence_regions_artifact_id", table_name="raw_evidence_regions")
    op.drop_table("raw_evidence_regions")

    op.drop_index("ix_raw_evidence_artifacts_sha256", table_name="raw_evidence_artifacts")
    op.drop_index("ix_raw_evidence_artifacts_document_id", table_name="raw_evidence_artifacts")
    op.drop_index("ix_raw_evidence_artifacts_project_id", table_name="raw_evidence_artifacts")
    op.drop_table("raw_evidence_artifacts")
