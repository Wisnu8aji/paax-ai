"""Persist immutable deterministic Core Engine calculation receipts."""
from alembic import op
import sqlalchemy as sa

revision = "0039_calculation_receipts"
down_revision = "0038_agent_review_recommendations"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("rab_materialization_mappings", sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("rab_materialization_mapping_audits", sa.Column("revision_before", sa.Integer(), nullable=True))
    op.add_column("rab_materialization_mapping_audits", sa.Column("revision_after", sa.Integer(), nullable=True))
    op.create_table(
        "calculation_receipts",
        sa.Column("receipt_id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("snapshot_id", sa.String(), nullable=False, index=True), sa.Column("mapping_id", sa.String(), nullable=False, index=True),
        sa.Column("mapping_revision", sa.Integer(), nullable=False), sa.Column("work_item_node_id", sa.String(), nullable=False),
        sa.Column("measurement_fact_ids", sa.JSON(), nullable=False), sa.Column("fact_lineage", sa.JSON(), nullable=False),
        sa.Column("calculation_type", sa.String(), nullable=False), sa.Column("rule_id", sa.String()), sa.Column("engine_version", sa.String()),
        sa.Column("canonical_request", sa.JSON(), nullable=False), sa.Column("input_hash", sa.String(64), nullable=False, index=True),
        sa.Column("engine_calculation_id", sa.String()), sa.Column("status", sa.String(), nullable=False, index=True),
        sa.Column("result", sa.Numeric(24, 9)), sa.Column("unit", sa.String()), sa.Column("formula_id", sa.String()), sa.Column("substituted_formula", sa.Text()),
        sa.Column("evidence_refs", sa.JSON(), nullable=False), sa.Column("human_approval_event_id", sa.String(), sa.ForeignKey("rab_materialization_mapping_audits.id", ondelete="RESTRICT")), sa.Column("approved_by", sa.String()),
        sa.Column("requested_by_service", sa.String(), nullable=False), sa.Column("requested_by_actor", sa.String()), sa.Column("idempotency_key", sa.String(), nullable=False),
        sa.Column("parent_receipt_id", sa.String(), sa.ForeignKey("calculation_receipts.receipt_id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("superseded_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("project_id", "idempotency_key", name="uq_calculation_receipt_idempotency"),
        sa.CheckConstraint("status IN ('complete','blocked','needs_input','superseded')", name="ck_calculation_receipt_status"),
        sa.CheckConstraint("status != 'complete' OR (result IS NOT NULL AND unit IS NOT NULL)", name="ck_calculation_receipt_complete_result"),
        sa.CheckConstraint("status NOT IN ('blocked','needs_input') OR result IS NULL", name="ck_calculation_receipt_noncomplete_no_result"),
    )
    op.create_index("uq_calculation_receipt_complete_input_mapping_revision", "calculation_receipts", ["project_id", "mapping_id", "mapping_revision", "input_hash"], unique=True, postgresql_where=sa.text("status = 'complete'"), sqlite_where=sa.text("status = 'complete'"))
    op.create_table("calculation_receipt_audits", sa.Column("audit_id", sa.String(), primary_key=True), sa.Column("receipt_id", sa.String(), sa.ForeignKey("calculation_receipts.receipt_id", ondelete="CASCADE"), nullable=False, index=True), sa.Column("action", sa.String(), nullable=False), sa.Column("actor", sa.String()), sa.Column("metadata", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))

def downgrade() -> None:
    op.drop_index("uq_calculation_receipt_complete_input_mapping_revision", table_name="calculation_receipts")
    op.drop_table("calculation_receipt_audits")
    op.drop_table("calculation_receipts")
    op.drop_column("rab_materialization_mapping_audits", "revision_after")
    op.drop_column("rab_materialization_mapping_audits", "revision_before")
    op.drop_column("rab_materialization_mappings", "revision")
