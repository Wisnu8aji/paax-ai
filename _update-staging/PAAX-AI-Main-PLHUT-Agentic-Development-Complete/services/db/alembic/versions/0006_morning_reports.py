"""add morning_reports

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-07 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0006'
down_revision: Union[str, None] = '0005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        'morning_reports',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('generated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('summary', sa.String(), nullable=False),
        sa.Column('highlights', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('concerns', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('metrics_snapshot', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('narrative_source', sa.String(), nullable=False)
    )
    op.create_index(op.f('ix_morning_reports_project_id'), 'morning_reports', ['project_id'], unique=False)
    op.create_index(op.f('ix_morning_reports_generated_at'), 'morning_reports', ['generated_at'], unique=False)

def downgrade() -> None:
    op.drop_index(op.f('ix_morning_reports_generated_at'), table_name='morning_reports')
    op.drop_index(op.f('ix_morning_reports_project_id'), table_name='morning_reports')
    op.drop_table('morning_reports')
