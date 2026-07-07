"""audit_log

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-07 12:42:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("""
    CREATE TABLE tool_call_audit (
        id UUID PRIMARY KEY,
        conversation_id TEXT,
        project_id TEXT,
        tool_name TEXT NOT NULL,
        input_json JSONB NOT NULL,
        output_json JSONB,
        model TEXT,
        latency_ms INTEGER,
        tokens_in INTEGER,
        tokens_out INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_audit_conversation ON tool_call_audit(conversation_id);
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("""
    DROP TABLE IF EXISTS tool_call_audit;
    """)
