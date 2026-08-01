import importlib.util
import sqlite3
from pathlib import Path


def _bridge_module():
    path = Path(__file__).resolve().parents[3] / "scripts" / "portable" / "migrate_portable_schema.py"
    spec = importlib.util.spec_from_file_location("portable_migration_bridge", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_partial_0038_schema_is_stamped_before_0039_upgrade(tmp_path):
    database = tmp_path / "portable.sqlite"
    with sqlite3.connect(database) as connection:
        connection.executescript("""
            CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);
            INSERT INTO alembic_version VALUES ('0037_package_index_materialization');
            CREATE TABLE agent_review_recommendations (
              recommendation_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, snapshot_id TEXT NOT NULL,
              target_type TEXT NOT NULL, target_id TEXT NOT NULL, recommendation TEXT NOT NULL,
              rationale TEXT NOT NULL, evidence_refs TEXT NOT NULL, created_by_service_identity TEXT NOT NULL,
              idempotency_key TEXT NOT NULL, metadata TEXT NOT NULL, created_at TEXT NOT NULL
            );
        """)
    assert _bridge_module().migration_start_revision(database) == "0038_agent_review_recommendations"
