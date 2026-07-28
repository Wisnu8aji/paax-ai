"""Tests for paax_db.data_root — data-root resolver contract (Phase 03 Task 2.1).

All tests run without a live database.  They use temporary directories so they
are fully isolated and do not touch Wisnu's real runtime data.
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

import pytest

from paax_db.data_root import (
    DATA_ROOT_SCHEMA_VERSION,
    LAYOUT_SUBDIRS,
    DataRootError,
    agent_dead_letter,
    agent_event_journal,
    agent_run_store,
    db_file,
    ensure_data_root_layout,
    entity_link_store,
    get_subdirectory,
    internal_key_file,
    resolve_data_root,
    runtime_dir,
    takeoff_store,
)


# ─── resolve_data_root ────────────────────────────────────────────────────────


def test_explicit_override_wins_over_env(tmp_path, monkeypatch):
    """Explicit -DataRoot argument takes precedence over any env var."""
    outside = tmp_path / "explicit_root"
    outside.mkdir()
    monkeypatch.setenv("PAAX_DATA_ROOT", str(tmp_path / "env_root"))
    result = resolve_data_root(root_override=str(outside))
    assert result == outside.resolve()


def test_env_wins_over_localappdata_default(tmp_path, monkeypatch):
    """PAAX_DATA_ROOT env var wins when no explicit override is given."""
    outside = tmp_path / "env_root"
    outside.mkdir()
    monkeypatch.setenv("PAAX_DATA_ROOT", str(outside))
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "fakelocal"))
    result = resolve_data_root()
    assert result == outside.resolve()


def test_localappdata_default_used_when_no_env(tmp_path, monkeypatch):
    """LOCALAPPDATA/PAAX-AI/data is used when no override or env var is set."""
    local_app = tmp_path / "AppData" / "Local"
    local_app.mkdir(parents=True)
    monkeypatch.delenv("PAAX_DATA_ROOT", raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(local_app))
    result = resolve_data_root()
    assert result == (local_app / "PAAX-AI" / "data").resolve()


def test_no_env_and_no_localappdata_raises(monkeypatch):
    """If neither PAAX_DATA_ROOT nor LOCALAPPDATA is set, DataRootError is raised."""
    monkeypatch.delenv("PAAX_DATA_ROOT", raising=False)
    monkeypatch.delenv("LOCALAPPDATA", raising=False)
    with pytest.raises(DataRootError, match="no explicit path"):
        resolve_data_root()


def test_relative_path_is_rejected(monkeypatch):
    """A relative path is rejected with a clear error."""
    monkeypatch.setenv("PAAX_DATA_ROOT", "relative/path/here")
    with pytest.raises(DataRootError, match="absolute path"):
        resolve_data_root()


def test_relative_override_is_rejected(monkeypatch):
    """A relative root_override is rejected."""
    monkeypatch.delenv("PAAX_DATA_ROOT", raising=False)
    with pytest.raises(DataRootError, match="absolute path"):
        resolve_data_root(root_override="relative/path")


def test_path_inside_repo_is_rejected(tmp_path, monkeypatch):
    """A path inside the installation/repository tree is rejected."""
    import paax_db.data_root as dr_module

    # Patch _INSTALLATION_ROOTS to include tmp_path so we can test the guard
    # without relying on knowing where the real repo is.
    original = dr_module._INSTALLATION_ROOTS
    try:
        dr_module._INSTALLATION_ROOTS = [tmp_path.resolve()]
        inside = tmp_path / "data"
        inside.mkdir()
        monkeypatch.setenv("PAAX_DATA_ROOT", str(inside))
        with pytest.raises(DataRootError, match="inside the installation"):
            resolve_data_root()
    finally:
        dr_module._INSTALLATION_ROOTS = original


# ─── ensure_data_root_layout ─────────────────────────────────────────────────


def test_layout_creation_is_idempotent(tmp_path, monkeypatch):
    """ensure_data_root_layout creates subdirs and is safe to call twice."""
    monkeypatch.delenv("PAAX_DATA_ROOT", raising=False)
    root = tmp_path / "data_root"
    paths1 = ensure_data_root_layout(root)
    paths2 = ensure_data_root_layout(root)
    for name in LAYOUT_SUBDIRS:
        assert (root / name).is_dir()
    assert set(paths1) == set(LAYOUT_SUBDIRS)
    assert paths1 == paths2


def test_every_mutable_path_resolves_below_root(tmp_path):
    """All helper path functions return paths strictly under the data root."""
    root = tmp_path / "paax_data"
    ensure_data_root_layout(root)
    helpers = [
        db_file(root),
        runtime_dir(root),
        internal_key_file(root),
        agent_run_store(root),
        agent_event_journal(root),
        agent_dead_letter(root),
        takeoff_store(root),
        entity_link_store(root),
    ]
    for p in helpers:
        assert str(p).startswith(str(root)), f"{p} is not under {root}"


def test_manifest_written_on_first_call(tmp_path):
    """A data-root.json manifest is written on first layout call."""
    root = tmp_path / "first"
    ensure_data_root_layout(root)
    manifest_path = root / "data-root.json"
    assert manifest_path.exists()
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert data["schema_version"] == DATA_ROOT_SCHEMA_VERSION
    assert sorted(data["layout"]) == sorted(LAYOUT_SUBDIRS)


def test_manifest_version_mismatch_raises(tmp_path):
    """If data-root.json has a different schema_version, DataRootError is raised."""
    root = tmp_path / "versioned"
    root.mkdir()
    (root / "data-root.json").write_text(
        json.dumps({"schema_version": "99.0", "layout": [], "created_at": "2026-01-01T00:00:00+00:00"}),
        encoding="utf-8",
    )
    with pytest.raises(DataRootError, match="schema_version mismatch"):
        ensure_data_root_layout(root)


def test_get_subdirectory_rejects_unknown_names(tmp_path):
    """get_subdirectory raises DataRootError for names not in the layout."""
    root = tmp_path / "root"
    with pytest.raises(DataRootError, match="Unknown data-root subdirectory"):
        get_subdirectory(root, "nonexistent_subdir")


def test_get_subdirectory_accepts_known_names(tmp_path):
    """get_subdirectory returns correct paths for all known layout names."""
    root = tmp_path / "root"
    for name in LAYOUT_SUBDIRS:
        p = get_subdirectory(root, name)
        assert p == root / name


def test_db_file_resolves_inside_db_subdir(tmp_path):
    root = tmp_path / "root"
    p = db_file(root)
    assert p.parent == root / "db"
    assert p.name == "paax-portable.db"


def test_internal_key_file_resolves_inside_runtime_subdir(tmp_path):
    root = tmp_path / "root"
    p = internal_key_file(root)
    assert p.parent == root / "runtime"
    assert p.name == "internal-service.key"
