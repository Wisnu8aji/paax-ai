"""durable_workspace_and_reference_bootstrap

Revision ID: 0036
Revises: 0035
Create Date: 2026-07-29 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import paax_db.models

# revision identifiers, used by Alembic.
revision = '0036'
down_revision = ('0035_calculation_authority', '0035_calculation_authority_constraints', '0035_calculation_authority_const')
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table('bootstrap_ledger',
        sa.Column('reference_key', sa.String(), nullable=False),
        sa.Column('fixture_version', sa.String(), nullable=False),
        sa.Column('fixture_hash', sa.String(), nullable=False),
        sa.Column('applied_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('result', paax_db.models.JSON_DOCUMENT, nullable=False),
        sa.PrimaryKeyConstraint('reference_key', 'fixture_version')
    )
    
    op.create_table('project_references',
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('reference_key', sa.String(), nullable=False),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('project_id')
    )
    op.create_index(op.f('ix_project_references_reference_key'), 'project_references', ['reference_key'], unique=False)
    # The partial unique index handles postgres vs sqlite (where we might just omit the partial part or use a regular unique for testing)
    # In alembic, we can conditionally add postgres-specific syntax:
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        op.create_index('ix_project_references_default', 'project_references', ['is_default'], unique=True, postgresql_where=sa.text('is_default = true'))
    else:
        # SQLite doesn't natively support partial indexes in the same way via SQLAlchemy create_index easily, but we can do it via execute
        op.execute("CREATE UNIQUE INDEX ix_project_references_default ON project_references (is_default) WHERE is_default = 1")
    
    op.create_table('actor_workspace_head',
        sa.Column('actor_id', sa.String(), nullable=False),
        sa.Column('active_project_id', sa.String(), nullable=True),
        sa.Column('active_module', sa.String(), nullable=True),
        sa.Column('active_tab', sa.String(), nullable=True),
        sa.Column('schema_version', sa.String(), nullable=False, server_default='1.0'),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['active_project_id'], ['projects.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('actor_id')
    )

    op.create_table('project_workspace_sessions',
        sa.Column('actor_id', sa.String(), nullable=False),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('active_document_id', sa.String(), nullable=True),
        sa.Column('active_sheet_id', sa.String(), nullable=True),
        sa.Column('selected_sheet_ids', paax_db.models.JSON_DOCUMENT, nullable=False, server_default='[]'),
        sa.Column('preferences', paax_db.models.JSON_DOCUMENT, nullable=False, server_default='{}'),
        sa.Column('open_conflict_group', sa.String(), nullable=True),
        sa.Column('quantity_mode', sa.String(), nullable=True),
        sa.Column('last_viewed_job_id', sa.String(), nullable=True),
        sa.Column('schema_version', sa.String(), nullable=False, server_default='1.0'),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('actor_id', 'project_id')
    )


def downgrade() -> None:
    op.drop_table('project_workspace_sessions')
    op.drop_table('actor_workspace_head')
    
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        op.drop_index('ix_project_references_default', table_name='project_references')
    else:
        op.execute("DROP INDEX ix_project_references_default")
    
    op.drop_index(op.f('ix_project_references_reference_key'), table_name='project_references')
    op.drop_table('project_references')
    op.drop_table('bootstrap_ledger')
