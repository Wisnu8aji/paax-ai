"""add pdf_path to dem_runs

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-17 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("dem_runs", sa.Column("pdf_path", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("dem_runs", "pdf_path")
