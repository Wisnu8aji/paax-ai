"""Align correction status constraint with carry-forward lifecycle.

Revision ID: 0032_correction_status
Revises: 0031_evidence_coordinate_space

The application creates ``stale`` correction records when an accepted human
correction cannot be carried safely into a newer snapshot. Migration 0017's
status check pre-dated that lifecycle and rejected ``stale`` on PostgreSQL.
Replace the constraint instead of rewriting the historical migration.
"""
from alembic import op


revision = "0032_correction_status"
down_revision = "0031_evidence_coordinate_space"
branch_labels = None
depends_on = None


_NEW_STATUS_CHECK = (
    "status IN ('pending', 'accepted', 'rejected', 'resolved', 'carried', 'stale')"
)
_OLD_STATUS_CHECK = (
    "status IN ('pending', 'accepted', 'rejected', 'resolved', 'carried')"
)


def upgrade() -> None:
    with op.batch_alter_table("project_graph_corrections") as batch_op:
        batch_op.drop_constraint("ck_project_graph_corrections_status", type_="check")
        batch_op.create_check_constraint(
            "ck_project_graph_corrections_status", _NEW_STATUS_CHECK
        )


def downgrade() -> None:
    with op.batch_alter_table("project_graph_corrections") as batch_op:
        batch_op.drop_constraint("ck_project_graph_corrections_status", type_="check")
        batch_op.create_check_constraint(
            "ck_project_graph_corrections_status", _OLD_STATUS_CHECK
        )
