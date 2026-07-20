"""Deterministic Alembic graph checks that run without a database server."""
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory


def _script_directory() -> ScriptDirectory:
    service_root = Path(__file__).resolve().parents[1]
    config = Config(str(service_root / "alembic.ini"))
    config.set_main_option("script_location", str(service_root / "alembic"))
    return ScriptDirectory.from_config(config)


def test_alembic_revision_graph_is_complete_and_has_one_head():
    script = _script_directory()
    revisions = list(script.walk_revisions())
    service_root = Path(__file__).resolve().parents[1]
    version_files = [
        path for path in (service_root / "alembic" / "versions").glob("*.py")
        if path.name != "__init__.py"
    ]

    # One head prevents accidental branch divergence. Comparing the discovered
    # revisions with committed migration files catches broken/misspelled
    # down_revision links without hard-coding a count that every future
    # migration would need to edit.
    assert len(script.get_heads()) == 1
    assert len(revisions) == len(version_files)
    assert len({revision.revision for revision in revisions}) == len(revisions)


def test_correction_status_alignment_preserves_runtime_stale_state():
    script = _script_directory()
    revision = script.get_revision("0032_correction_status")
    source = Path(revision.path).read_text(encoding="utf-8")

    assert revision.down_revision == "0031_evidence_coordinate_space"
    assert "'stale'" in source
    assert "ck_project_graph_corrections_status" in source
