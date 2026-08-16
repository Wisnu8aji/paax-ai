"""Persist Command Room message provenance and queue state."""
from alembic import op
import sqlalchemy as sa

revision = "0041_command_room_chat_queue"
down_revision = "0040_command_room_chat_v15_parts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("sources", sa.JSON(), nullable=True))
    op.add_column("messages", sa.Column("artifacts", sa.JSON(), nullable=True))
    op.execute(sa.text("UPDATE messages SET sources = '[]' WHERE sources IS NULL"))
    op.execute(sa.text("UPDATE messages SET artifacts = '[]' WHERE artifacts IS NULL"))
    op.alter_column("messages", "sources", existing_type=sa.JSON(), nullable=False)
    op.alter_column("messages", "artifacts", existing_type=sa.JSON(), nullable=False)

    op.create_table(
        "chat_queue_entries",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("conversation_id", sa.Uuid(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("turn_id", sa.String(160), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(32), nullable=False, server_default="queued"),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("error", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "turn_id", name="uq_chat_queue_user_turn"),
    )
    op.create_index("ix_chat_queue_entries_conversation_id", "chat_queue_entries", ["conversation_id"], unique=False)
    op.create_index("ix_chat_queue_entries_user_id", "chat_queue_entries", ["user_id"], unique=False)
    op.create_index("ix_chat_queue_entries_turn_id", "chat_queue_entries", ["turn_id"], unique=False)
    op.create_index("ix_chat_queue_conversation_state", "chat_queue_entries", ["conversation_id", "state"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_chat_queue_conversation_state", table_name="chat_queue_entries")
    op.drop_index("ix_chat_queue_entries_turn_id", table_name="chat_queue_entries")
    op.drop_index("ix_chat_queue_entries_user_id", table_name="chat_queue_entries")
    op.drop_index("ix_chat_queue_entries_conversation_id", table_name="chat_queue_entries")
    op.drop_table("chat_queue_entries")
    op.drop_column("messages", "artifacts")
    op.drop_column("messages", "sources")
