from __future__ import annotations

import hashlib
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path("G:/PAAX-Data/db/portable.sqlite")


def _counts(database: Path) -> dict[str, int]:
    with sqlite3.connect(database) as connection:
        return {
            table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in ("dem_pages", "project_graph_nodes", "project_graph_evidence", "measurement_facts", "rab_materialization_mappings")
        }


def _checksum(database: Path) -> str:
    digest = hashlib.sha256()
    with sqlite3.connect(database) as connection:
        queries = (
            "SELECT id, run_id, page_index, status, result FROM dem_pages ORDER BY rowid",
            "SELECT * FROM project_graph_nodes ORDER BY rowid",
            "SELECT * FROM project_graph_evidence ORDER BY rowid",
            "SELECT * FROM measurement_facts ORDER BY rowid",
            "SELECT * FROM rab_materialization_mappings ORDER BY rowid",
        )
        for query in queries:
            for row in connection.execute(query):
                digest.update(repr(row).encode("utf-8"))
    return digest.hexdigest()


def test_legacy_portable_copy_stamps_baseline_and_applies_0037(tmp_path: Path):
    assert SOURCE.is_file(), "Representational PLHUT portable database is required for CR2A migration test"
    target = tmp_path / "portable.sqlite"
    shutil.copy2(SOURCE, target)
    before_counts, before_checksum = _counts(target), _checksum(target)
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts/portable/migrate_portable_schema.py"), "--database", str(target)],
        cwd=ROOT, text=True, capture_output=True,
    )
    assert result.returncode == 0, result.stderr
    assert _counts(target) == before_counts
    assert _checksum(target) == before_checksum
    with sqlite3.connect(target) as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "0037_package_index_materialization"
        columns = {row[1] for row in connection.execute("PRAGMA table_info(dem_pages)")}
    assert {"paax_classification", "paax_discipline", "paax_level", "paax_classification_status"} <= columns

    second = subprocess.run(
        [sys.executable, str(ROOT / "scripts/portable/migrate_portable_schema.py"), "--database", str(target), "--no-backup"],
        cwd=ROOT, text=True, capture_output=True,
    )
    assert second.returncode == 0, second.stderr
    assert _counts(target) == before_counts
    assert _checksum(target) == before_checksum
