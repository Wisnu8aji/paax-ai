"""paax_db.data_root — Canonical external data-root resolver.

Resolution precedence (documented contract):
  1. Explicit override argument (caller-supplied ``root_override``).
  2. ``PAAX_DATA_ROOT`` environment variable (if non-empty).
  3. Windows portable default: ``%LOCALAPPDATA%\\PAAX-AI\\data``.

If no root can be determined, ``DataRootError`` is raised.  The resolved root
is **always** an absolute path outside the calling installation tree and outside
any recognised repository root.  Relative paths are never accepted silently.

Layout produced by ``ensure_data_root_layout(root)`` (idempotent):

    <root>/
    ├── db/
    ├── objects/
    ├── uploads/
    ├── jobs/
    ├── cache/
    ├── models/
    ├── runtime/
    ├── backups/
    ├── migration/
    └── bootstrap/

A ``data-root.json`` version manifest is written on first call and validated on
subsequent calls.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Optional

LAYOUT_SUBDIRS: tuple[str, ...] = (
    "db",
    "objects",
    "uploads",
    "jobs",
    "cache",
    "models",
    "runtime",
    "backups",
    "migration",
    "bootstrap",
)

DATA_ROOT_SCHEMA_VERSION = "1.0"


class DataRootError(RuntimeError):
    """Raised when the data root cannot be resolved or is invalid."""


def _find_installation_roots() -> list[Path]:
    """Return a list of known installation / repository roots to guard against."""
    roots: list[Path] = []
    # The package lives at services/db/src/paax_db/data_root.py
    here = Path(__file__).resolve()
    # Walk up to find the repository root (the directory containing services/)
    for ancestor in here.parents:
        if (ancestor / "services").is_dir() and (ancestor / "apps").is_dir():
            roots.append(ancestor)
            break
    return roots


_INSTALLATION_ROOTS: list[Path] = _find_installation_roots()


def _is_inside_installation(p: Path) -> bool:
    """Return True if *p* is inside any known installation/repository root."""
    resolved = p.resolve()
    for root in _INSTALLATION_ROOTS:
        try:
            resolved.relative_to(root)
            return True
        except ValueError:
            pass
    return False


def resolve_data_root(root_override: Optional[str] = None) -> Path:
    """Resolve and validate the external PAAX data root.

    Parameters
    ----------
    root_override:
        Explicit path supplied by the caller (e.g. via a ``-DataRoot`` CLI
        argument).  Takes highest precedence.

    Returns
    -------
    Path
        The resolved absolute data-root directory (not yet created).

    Raises
    ------
    DataRootError
        If no valid path can be determined, or if the resolved path is
        relative, inside the installation tree, or is ``LOCALAPPDATA`` itself.
    """
    candidate: Optional[str] = None

    if root_override is not None and root_override.strip():
        candidate = root_override.strip()
        source = "explicit -DataRoot argument"
    elif os.environ.get("PAAX_DATA_ROOT", "").strip():
        candidate = os.environ["PAAX_DATA_ROOT"].strip()
        source = "PAAX_DATA_ROOT environment variable"
    else:
        local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
        if local_app_data:
            candidate = str(Path(local_app_data) / "PAAX-AI" / "data")
            source = "Windows LOCALAPPDATA default"
        else:
            raise DataRootError(
                "Cannot determine PAAX_DATA_ROOT: no explicit path, no PAAX_DATA_ROOT env var, "
                "and LOCALAPPDATA is not set.  Pass -DataRoot explicitly or set PAAX_DATA_ROOT."
            )

    p = Path(candidate)
    if not p.is_absolute():
        raise DataRootError(
            f"PAAX data root must be an absolute path, got a relative path from {source}: {candidate!r}.  "
            "Set PAAX_DATA_ROOT to an absolute path or pass -DataRoot with an absolute path."
        )

    resolved = p.resolve()

    if _is_inside_installation(resolved):
        raise DataRootError(
            f"PAAX data root ({resolved}) is inside the installation/repository tree.  "
            "The data root must live outside the installation directory to survive updates and reinstalls.  "
            f"Source: {source}."
        )

    return resolved


def ensure_data_root_layout(root: Path) -> dict[str, Path]:
    """Create the required directory layout under *root* and write/validate the version manifest.

    This operation is **idempotent** — running it multiple times produces the
    same result and never deletes existing subdirectories or the manifest.

    Parameters
    ----------
    root:
        The resolved absolute data-root path (from ``resolve_data_root``).

    Returns
    -------
    dict[str, Path]
        Mapping from sub-directory name to its absolute ``Path``.

    Raises
    ------
    DataRootError
        If *root* is not writable, or if the existing manifest has an
        incompatible schema version.
    """
    try:
        root.mkdir(parents=True, exist_ok=True)
    except PermissionError as exc:
        raise DataRootError(f"PAAX data root {root} is not writable: {exc}") from exc

    # Write / validate version manifest
    manifest_path = root / "data-root.json"
    if manifest_path.exists():
        try:
            existing = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise DataRootError(f"data-root.json at {root} is corrupt: {exc}") from exc
        existing_version = existing.get("schema_version", "")
        if existing_version != DATA_ROOT_SCHEMA_VERSION:
            raise DataRootError(
                f"data-root.json schema_version mismatch: expected {DATA_ROOT_SCHEMA_VERSION!r}, "
                f"found {existing_version!r} at {root}.  Manual migration may be required."
            )
    else:
        manifest_path.write_text(
            json.dumps(
                {
                    "schema_version": DATA_ROOT_SCHEMA_VERSION,
                    "layout": list(LAYOUT_SUBDIRS),
                    "created_at": _utcnow_iso(),
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    paths: dict[str, Path] = {}
    for name in LAYOUT_SUBDIRS:
        sub = root / name
        sub.mkdir(exist_ok=True)
        paths[name] = sub

    return paths


def get_subdirectory(root: Path, name: str) -> Path:
    """Return the absolute path for a named data-root subdirectory.

    Raises ``DataRootError`` if *name* is not a recognised layout directory.
    """
    if name not in LAYOUT_SUBDIRS:
        raise DataRootError(
            f"Unknown data-root subdirectory {name!r}.  "
            f"Valid names: {sorted(LAYOUT_SUBDIRS)}"
        )
    return root / name


# ──────────────────────────────────────────────────────────────────────────────
# Mutable-path helpers consumed by portable services
# ──────────────────────────────────────────────────────────────────────────────

def db_file(root: Path) -> Path:
    """Canonical DB file path below the external data root."""
    return get_subdirectory(root, "db") / "paax-portable.db"


def runtime_dir(root: Path) -> Path:
    """Directory for PID files, log files, and runtime keys."""
    return get_subdirectory(root, "runtime")


def internal_key_file(root: Path) -> Path:
    """Path for the internal service key (never printed; never inside repo)."""
    return runtime_dir(root) / "internal-service.key"


def agent_run_store(root: Path) -> Path:
    return root / "jobs" / "agent-runs.json"


def agent_event_journal(root: Path) -> Path:
    return root / "jobs" / "agent-events.jsonl"


def agent_dead_letter(root: Path) -> Path:
    return root / "jobs" / "agent-dead-letter.jsonl"


def takeoff_store(root: Path) -> Path:
    return root / "jobs" / "takeoff-workspace.json"


def entity_link_store(root: Path) -> Path:
    return root / "jobs" / "entity-links.json"


def _utcnow_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(tz=timezone.utc).isoformat(timespec="seconds")
