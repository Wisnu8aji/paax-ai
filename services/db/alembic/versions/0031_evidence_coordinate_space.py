"""Add explicit coordinate-space provenance to project_graph_evidence

Revision ID: 0031_evidence_coordinate_space
Revises: 0030_evidence_hash_index

Target 4 (final remediation wave): a prior bug guessed a bbox's coordinate
space purely from whether a PageTransform happened to be present, and
unconditionally re-transformed already-normalized bboxes as if they were
PDF-point coordinates. bbox_space makes the actual space an explicit,
stored fact (see app/perception/bbox_canonicalize.py); bbox_quarantine_reason
records why a bbox could not be canonicalized (Target 5 excludes quarantined
evidence from authoritative retrieval); coordinate_schema_version and
transform_version let a future canonicalization change be told apart from
data produced under an older contract.
"""
from alembic import op
import sqlalchemy as sa


revision = "0031_evidence_coordinate_space"
down_revision = "0030_evidence_hash_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("project_graph_evidence", sa.Column("bbox_space", sa.String(), nullable=True))
    op.add_column("project_graph_evidence", sa.Column("bbox_quarantine_reason", sa.Text(), nullable=True))
    op.add_column("project_graph_evidence", sa.Column("coordinate_schema_version", sa.String(), nullable=True))
    op.add_column("project_graph_evidence", sa.Column("transform_version", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("project_graph_evidence", "transform_version")
    op.drop_column("project_graph_evidence", "coordinate_schema_version")
    op.drop_column("project_graph_evidence", "bbox_quarantine_reason")
    op.drop_column("project_graph_evidence", "bbox_space")
