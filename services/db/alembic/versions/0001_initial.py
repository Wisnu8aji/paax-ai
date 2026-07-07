"""initial

Revision ID: 0001
Revises: 
Create Date: 2026-07-07 12:18:42.840188

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("""
    CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        location TEXT,
        client TEXT,
        type TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        description TEXT,
        rab_value NUMERIC,
        progress INTEGER NOT NULL DEFAULT 0,
        warnings INTEGER NOT NULL DEFAULT 0,
        health INTEGER NOT NULL DEFAULT 100,
        last_activity TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_projects_owner ON projects(owner_id);

    CREATE TABLE rab_drafts (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE tkg_records (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE chat_folders (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE chat_conversations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        folder_id TEXT REFERENCES chat_folders(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        messages JSONB NOT NULL DEFAULT '[]',
        pinned BOOLEAN NOT NULL DEFAULT false,
        archived BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_conversations_project ON chat_conversations(project_id);
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("""
    DROP TABLE IF EXISTS chat_conversations;
    DROP TABLE IF EXISTS chat_folders;
    DROP TABLE IF EXISTS tkg_records;
    DROP TABLE IF EXISTS rab_drafts;
    DROP TABLE IF EXISTS projects;
    """)
