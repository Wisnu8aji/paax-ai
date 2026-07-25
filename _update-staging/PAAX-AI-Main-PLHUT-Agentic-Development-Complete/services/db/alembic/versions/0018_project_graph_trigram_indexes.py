"""add project graph trigram indexes

Revision ID: 0018
Revises: 0017
Create Date: 2026-07-19 11:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_postgresql() -> bool:
    """Check if current bind is PostgreSQL."""
    try:
        bind = op.get_bind()
        return bind.dialect.name == "postgresql"
    except Exception:
        return False


def upgrade() -> None:
    if _is_postgresql():
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        op.create_index(
            "ix_project_graph_nodes_normalized_name_trgm",
            "project_graph_nodes",
            ["normalized_name"],
            postgresql_using="gin",
            postgresql_ops={"normalized_name": "gin_trgm_ops"}
        )
        op.create_index(
            "ix_project_graph_nodes_search_text_trgm",
            "project_graph_nodes",
            ["search_text"],
            postgresql_using="gin",
            postgresql_ops={"search_text": "gin_trgm_ops"}
        )


def downgrade() -> None:
    if _is_postgresql():
        op.drop_index("ix_project_graph_nodes_normalized_name_trgm", table_name="project_graph_nodes")
        op.drop_index("ix_project_graph_nodes_search_text_trgm", table_name="project_graph_nodes")
