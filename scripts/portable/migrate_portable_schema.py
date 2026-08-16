"""Non-destructive Alembic bridge for legacy portable SQLite databases.

Legacy portable databases were created through SQLAlchemy ``create_all`` and
therefore have a real schema but no Alembic revision row.  This command audits
that schema, stamps the verified 0036 baseline, then applies only newer
revisions.  It never guesses that an arbitrary SQLite file is a PAAX database.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sqlite3
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config


REQUIRED_TABLES = {
    "projects", "dem_runs", "dem_pages", "project_graph_nodes",
    "project_graph_evidence", "measurement_facts", "rab_materialization_mappings",
}
REQUIRED_DEM_PAGE_COLUMNS = {"id", "run_id", "page_index", "status", "result"}
BASELINE = "0036"
PARTIAL_0038_PREDECESSOR = "0037_package_index_materialization"
PARTIAL_0038_REVISION = "0038_agent_review_recommendations"
REQUIRED_0038_COLUMNS = {
    "recommendation_id", "project_id", "snapshot_id", "target_type", "target_id",
    "recommendation", "rationale", "evidence_refs", "metadata",
    "created_by_service_identity", "idempotency_key", "created_at",
}


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def audit_legacy_baseline(database: Path) -> None:
    with sqlite3.connect(database) as connection:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        missing = sorted(REQUIRED_TABLES - tables)
        if missing:
            raise RuntimeError(f"Not a verified PAAX portable baseline; missing tables: {', '.join(missing)}")
        columns = {row[1] for row in connection.execute("PRAGMA table_info(dem_pages)")}
        missing_columns = sorted(REQUIRED_DEM_PAGE_COLUMNS - columns)
        if missing_columns:
            raise RuntimeError(f"Not a verified PAAX portable baseline; dem_pages misses: {', '.join(missing_columns)}")


def migration_config(repo_root: Path, database: Path) -> Config:
    config = Config(str(repo_root / "services" / "db" / "alembic.ini"))
    config.set_main_option("script_location", str(repo_root / "services" / "db" / "alembic"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database.as_posix()}")
    return config


def migration_start_revision(database: Path) -> str | None:
    """Return a safe stamp target for a known partially-applied portable DB.

    A prior portable repair created the 0038 table but left Alembic at 0037.
    Replaying 0038 would fail; stamping is safe only after the complete 0038
    table shape is verified. Unknown partial states remain fail-closed.
    """
    with sqlite3.connect(database) as connection:
        has_version = connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version'"
        ).fetchone()
        if not has_version:
            return BASELINE
        version = connection.execute("SELECT version_num FROM alembic_version").fetchone()
        if not version or version[0] != PARTIAL_0038_PREDECESSOR:
            return None
        has_receipt_recommendations = connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='agent_review_recommendations'"
        ).fetchone()
        if not has_receipt_recommendations:
            return None
        columns = {row[1] for row in connection.execute("PRAGMA table_info(agent_review_recommendations)")}
        if REQUIRED_0038_COLUMNS - columns:
            raise RuntimeError("Partial 0038 table shape is incomplete; refusing to stamp migration history")
    return PARTIAL_0038_REVISION


def migrate(repo_root: Path, database: Path, *, backup: bool) -> None:
    if not database.is_file():
        raise FileNotFoundError(database)
    audit_legacy_baseline(database)
    before = digest(database)
    backup_path = database.with_suffix(database.suffix + ".pre-cr2a.bak")
    if backup:
        shutil.copy2(database, backup_path)
        if digest(backup_path) != before:
            raise RuntimeError("Portable database backup checksum mismatch")
    config = migration_config(repo_root, database)
    # Alembic's environment module also accepts DATABASE_URL for service
    # migrations.  The portable bridge already supplies a validated sync
    # SQLite URL, so keep the ambient async service URL from overriding it.
    ambient_database_url = os.environ.pop("DATABASE_URL", None)
    try:
        if stamp := migration_start_revision(database):
            command.stamp(config, stamp)
        command.upgrade(config, "head")
    finally:
        if ambient_database_url is not None:
            os.environ["DATABASE_URL"] = ambient_database_url
    audit_legacy_baseline(database)
    with sqlite3.connect(database) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(dem_pages)")}
        required = {"paax_classification", "paax_discipline", "paax_level", "paax_classification_status"}
        if missing := required - columns:
            raise RuntimeError(f"Migration incomplete; missing columns: {sorted(missing)}")
        version = connection.execute("SELECT version_num FROM alembic_version").fetchone()
    print(f"Portable schema migrated: revision={version[0] if version else 'unknown'} backup={backup_path if backup else 'none'}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--no-backup", action="store_true")
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    migrate(repo_root, args.database.resolve(), backup=not args.no_backup)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Portable schema migration failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
