"""Rename evidence artifact_hash to source_document_hash and drop global uniqueness

Revision ID: 0030_evidence_hash_index
Revises: 0029_observability_contract

The column previously named artifact_hash on project_graph_evidence is
populated with the source document's hash, not a per-evidence/crop hash.
Every evidence row extracted from the same document legitimately shares
this value, so migration 0017's partial unique index collides as soon as
a document produces more than one evidence row. Rename the column to
reflect its real semantics and replace the unique index with a plain
lookup index.
"""
from alembic import op
import sqlalchemy as sa


revision = "0030_evidence_hash_index"
down_revision = "0029_observability_contract"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_project_graph_evidence_artifact_hash_unique", table_name="project_graph_evidence")
    op.alter_column(
        "project_graph_evidence",
        "artifact_hash",
        new_column_name="source_document_hash",
    )
    op.create_index(
        "ix_project_graph_evidence_source_document_hash",
        "project_graph_evidence",
        ["source_document_hash"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_project_graph_evidence_source_document_hash", table_name="project_graph_evidence")
    op.alter_column(
        "project_graph_evidence",
        "source_document_hash",
        new_column_name="artifact_hash",
    )
    op.create_index(
        "ix_project_graph_evidence_artifact_hash_unique",
        "project_graph_evidence",
        ["artifact_hash"],
        unique=True,
        postgresql_where=sa.text("artifact_hash IS NOT NULL"),
        sqlite_where=sa.text("artifact_hash IS NOT NULL"),
    )
