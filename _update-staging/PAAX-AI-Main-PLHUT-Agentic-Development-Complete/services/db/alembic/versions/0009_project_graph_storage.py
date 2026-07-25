"""add immutable project graph storage

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-15 22:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    jsonb = postgresql.JSONB(astext_type=sa.Text())
    op.create_table(
        "project_graph_snapshots",
        sa.Column("snapshot_id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("schema_version", sa.String(), nullable=False),
        sa.Column("source_manifest_hash", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("generation_metadata", jsonb, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("activated_at", sa.DateTime(timezone=True)),
        sa.Column("superseded_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_project_graph_snapshots_project_status", "project_graph_snapshots", ["project_id", "status"])
    op.create_table(
        "project_graph_nodes",
        sa.Column("snapshot_id", sa.String(), sa.ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("node_id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_type", sa.String(), nullable=False),
        sa.Column("canonical_name", sa.String(), nullable=False),
        sa.Column("normalized_name", sa.String(), nullable=False),
        sa.Column("discipline", sa.String(), nullable=False),
        sa.Column("level_id", sa.String()),
        sa.Column("verification_status", sa.String(), nullable=False),
        sa.Column("confidence", sa.Numeric(), nullable=False),
        sa.Column("properties", jsonb, nullable=False),
        sa.Column("search_text", sa.Text(), nullable=False),
    )
    op.create_index("ix_project_graph_nodes_scope_name", "project_graph_nodes", ["project_id", "snapshot_id", "normalized_name"])
    op.create_index("ix_project_graph_nodes_type", "project_graph_nodes", ["node_type"])
    op.create_index("ix_project_graph_nodes_discipline", "project_graph_nodes", ["discipline"])
    op.create_index("ix_project_graph_nodes_level", "project_graph_nodes", ["level_id"])
    op.create_index("ix_project_graph_nodes_properties_gin", "project_graph_nodes", ["properties"], postgresql_using="gin")
    op.create_table(
        "project_graph_edges",
        sa.Column("snapshot_id", sa.String(), sa.ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("edge_id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_node_id", sa.String(), nullable=False),
        sa.Column("target_node_id", sa.String(), nullable=False),
        sa.Column("relation", sa.String(), nullable=False),
        sa.Column("confidence_class", sa.String(), nullable=False),
        sa.Column("confidence", sa.Numeric(), nullable=False),
        sa.Column("properties", jsonb, nullable=False),
    )
    op.create_index("ix_project_graph_edges_scope", "project_graph_edges", ["project_id", "snapshot_id"])
    op.create_index("ix_project_graph_edges_relation", "project_graph_edges", ["relation"])
    op.create_index("ix_project_graph_edges_source", "project_graph_edges", ["source_node_id"])
    op.create_index("ix_project_graph_edges_target", "project_graph_edges", ["target_node_id"])
    op.create_table(
        "project_graph_evidence",
        sa.Column("snapshot_id", sa.String(), sa.ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("evidence_id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("page_index", sa.Integer(), nullable=False),
        sa.Column("sheet_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("bbox", jsonb),
        sa.Column("source_dem_id", sa.String()),
    )
    op.create_table(
        "project_graph_node_evidence",
        sa.Column("snapshot_id", sa.String(), sa.ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("node_id", sa.String(), primary_key=True),
        sa.Column("evidence_id", sa.String(), primary_key=True),
        sa.Column("role", sa.String(), nullable=False),
    )
    op.create_table(
        "project_graph_edge_evidence",
        sa.Column("snapshot_id", sa.String(), sa.ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("edge_id", sa.String(), primary_key=True),
        sa.Column("evidence_id", sa.String(), primary_key=True),
        sa.Column("role", sa.String(), nullable=False),
    )
    op.create_table(
        "project_graph_aliases",
        sa.Column("snapshot_id", sa.String(), sa.ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("alias_normalized", sa.String(), primary_key=True),
        sa.Column("alias_raw", sa.String(), primary_key=True),
        sa.Column("node_id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("alias_type", sa.String(), nullable=False),
        sa.Column("confidence", sa.Numeric(), nullable=False),
    )
    op.create_index("ix_project_graph_aliases_scope", "project_graph_aliases", ["project_id", "snapshot_id", "alias_normalized"])
    op.create_table(
        "project_graph_communities",
        sa.Column("snapshot_id", sa.String(), sa.ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("community_id", sa.String(), primary_key=True),
        sa.Column("community_type", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("member_count", sa.Integer(), nullable=False),
    )
    op.create_table(
        "project_graph_query_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("snapshot_id", sa.String(), sa.ForeignKey("project_graph_snapshots.snapshot_id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", sa.String()),
        sa.Column("user_query", sa.Text(), nullable=False),
        sa.Column("query_plan", jsonb, nullable=False),
        sa.Column("selected_seed_ids", jsonb, nullable=False),
        sa.Column("traversed_node_ids", jsonb, nullable=False),
        sa.Column("traversed_edge_ids", jsonb, nullable=False),
        sa.Column("context_token_estimate", sa.Integer(), nullable=False),
        sa.Column("answer_model", sa.String()),
        sa.Column("latency_ms", sa.Integer()),
        sa.Column("outcome", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    for table_name in (
        "project_graph_query_logs",
        "project_graph_communities",
        "project_graph_aliases",
        "project_graph_edge_evidence",
        "project_graph_node_evidence",
        "project_graph_evidence",
        "project_graph_edges",
        "project_graph_nodes",
        "project_graph_snapshots",
    ):
        op.drop_table(table_name)
