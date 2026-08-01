"""Persist agent recommendations without granting human-review authority."""
from alembic import op
import sqlalchemy as sa

revision = "0038_agent_review_recommendations"
down_revision = "0037_package_index_materialization"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        "agent_review_recommendations",
        sa.Column("recommendation_id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("snapshot_id", sa.String(), nullable=False, index=True),
        sa.Column("target_type", sa.String(), nullable=False),
        sa.Column("target_id", sa.String(), nullable=False),
        sa.Column("recommendation", sa.String(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("evidence_refs", sa.JSON(), nullable=False),
        sa.Column("agent_run_id", sa.String(), nullable=True),
        sa.Column("tool_call_id", sa.String(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_by_service_identity", sa.String(), nullable=False),
        sa.Column("idempotency_key", sa.String(), nullable=False),
        sa.Column("superseded_by", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_id", "idempotency_key", name="uq_agent_review_recommendation_idempotency"),
        sa.CheckConstraint("target_type IN ('project_graph_correction','rab_bridge_proposal','rab_materialization_mapping')", name="ck_agent_review_recommendation_target"),
        sa.CheckConstraint("recommendation IN ('recommend_accept','recommend_reject','needs_human_review')", name="ck_agent_review_recommendation_value"),
    )

def downgrade() -> None:
    op.drop_table("agent_review_recommendations")
