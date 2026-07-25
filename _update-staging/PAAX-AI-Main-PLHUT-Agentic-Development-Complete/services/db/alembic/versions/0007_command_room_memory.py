"""command room memory layer (conversations/messages/durable_memories/memory_graph_map)

Fase 4, PLAN.md §5 dan §9 Fase 4
(skill command-room-intelligence PLAN.md).

Substrate memory blueprint §9.1 (raw/summarized/durable/graph mapping layer)
diwujudkan di services/db yang sudah ada (Postgres+Alembic) -- bukan Supabase
baru, sesuai revisi PLAN.md §5. Ini source of truth SERVER-SIDE untuk chat
Command Room; localStorage (apps/web/src/lib/chat/chat-history.ts) tetap ada
sebagai cache/offline fallback (TIDAK dihapus -- lihat PLAN.md §8.3), sinkron
dua arah dulu sebelum localStorage jadi read-only cache.

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-12 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0007'
down_revision: Union[str, None] = '0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'conversations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', sa.String(), nullable=True),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('model_alias', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('archived', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('pinned', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index(op.f('ix_conversations_user_id'), 'conversations', ['user_id'], unique=False)
    op.create_index(op.f('ix_conversations_project_id'), 'conversations', ['project_id'], unique=False)

    op.create_table(
        'messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('conversation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('conversations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('sequence', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index(op.f('ix_messages_conversation_id'), 'messages', ['conversation_id'], unique=False)
    op.create_index('idx_messages_conversation_sequence', 'messages', ['conversation_id', 'sequence'], unique=True)

    # scope/type enum blueprint §9.2/§9.3 -- disimpan sebagai String (bukan
    # Postgres ENUM type) supaya menambah varian baru tidak butuh migrasi ALTER
    # TYPE terpisah; validasi nilai dilakukan di application layer (schemas.py).
    op.create_table(
        'durable_memories',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('scope', sa.String(), nullable=False),
        sa.Column('scope_ref_id', sa.String(), nullable=True),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('entities', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
        sa.Column('importance', sa.Numeric(), nullable=False, server_default='0.5'),
        sa.Column('confidence', sa.Numeric(), nullable=False, server_default='1.0'),
        sa.Column('status', sa.String(), nullable=False, server_default='active'),
        sa.Column('source_type', sa.String(), nullable=False),
        sa.Column('source_id', sa.String(), nullable=True),
        sa.Column('supersedes', postgresql.UUID(as_uuid=True), sa.ForeignKey('durable_memories.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index(op.f('ix_durable_memories_scope'), 'durable_memories', ['scope'], unique=False)
    op.create_index(op.f('ix_durable_memories_scope_ref_id'), 'durable_memories', ['scope_ref_id'], unique=False)
    op.create_index(op.f('ix_durable_memories_status'), 'durable_memories', ['status'], unique=False)

    op.create_table(
        'memory_graph_map',
        sa.Column('memory_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('durable_memories.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('graph_node_id', sa.String(), primary_key=True),
        sa.Column('graph_version', sa.String(), nullable=True),
        sa.Column('indexed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('memory_graph_map')
    op.drop_index(op.f('ix_durable_memories_status'), table_name='durable_memories')
    op.drop_index(op.f('ix_durable_memories_scope_ref_id'), table_name='durable_memories')
    op.drop_index(op.f('ix_durable_memories_scope'), table_name='durable_memories')
    op.drop_table('durable_memories')
    op.drop_index('idx_messages_conversation_sequence', table_name='messages')
    op.drop_index(op.f('ix_messages_conversation_id'), table_name='messages')
    op.drop_table('messages')
    op.drop_index(op.f('ix_conversations_project_id'), table_name='conversations')
    op.drop_index(op.f('ix_conversations_user_id'), table_name='conversations')
    op.drop_table('conversations')
