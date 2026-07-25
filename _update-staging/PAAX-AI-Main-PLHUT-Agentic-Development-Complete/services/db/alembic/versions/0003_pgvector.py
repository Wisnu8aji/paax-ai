"""pgvector

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-07 12:44:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: Union[str, Sequence[str], None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("""
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE knowledge_chunks (
        id UUID PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding VECTOR(768),
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_knowledge_embedding ON knowledge_chunks
        USING ivfflat (embedding vector_cosine_ops);
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("""
    DROP TABLE IF EXISTS knowledge_chunks;
    DROP EXTENSION IF EXISTS vector;
    """)
