"""usage metering

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-07 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # ai_usage_log
    op.create_table(
        'ai_usage_log',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('tenant_id', sa.String(), nullable=True),
        sa.Column('service', sa.String(), nullable=False),
        sa.Column('operation', sa.String(), nullable=False),
        sa.Column('cache_hit', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('tokens_in', sa.Integer(), nullable=True),
        sa.Column('tokens_out', sa.Integer(), nullable=True),
        sa.Column('latency_ms', sa.Integer(), nullable=True),
        sa.Column('success', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('idx_usage_tenant_date', 'ai_usage_log', ['tenant_id', 'created_at'])

    # tenant_quota
    op.create_table(
        'tenant_quota',
        sa.Column('tenant_id', sa.String(), primary_key=True),
        sa.Column('plan', sa.String(), nullable=False),
        sa.Column('monthly_ai_calls_limit', sa.Integer(), nullable=False),
        sa.Column('monthly_ai_calls_used', sa.Integer(), server_default='0', nullable=False),
        sa.Column('reset_at', sa.DateTime(timezone=True), nullable=False),
    )

def downgrade() -> None:
    op.drop_table('tenant_quota')
    op.drop_index('idx_usage_tenant_date', table_name='ai_usage_log')
    op.drop_table('ai_usage_log')
