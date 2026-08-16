"""Persist Command Room v1.5 ordered message parts and model metadata."""
from alembic import op
import sqlalchemy as sa

revision = "0040_command_room_chat_v15_parts"
down_revision = "0039_calculation_receipts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("parts", sa.JSON(), nullable=True))
    op.add_column("messages", sa.Column("model_alias", sa.String(), nullable=True))
    op.add_column("messages", sa.Column("turn_id", sa.String(), nullable=True))
    op.create_index("ix_messages_turn_id", "messages", ["turn_id"], unique=False)
    op.execute(sa.text("UPDATE messages SET parts = '[]' WHERE parts IS NULL"))
    op.alter_column("messages", "parts", existing_type=sa.JSON(), nullable=False)


def downgrade() -> None:
    op.drop_index("ix_messages_turn_id", table_name="messages")
    op.drop_column("messages", "turn_id")
    op.drop_column("messages", "model_alias")
    op.drop_column("messages", "parts")
