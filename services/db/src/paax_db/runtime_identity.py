"""PAAX Runtime Identity Module — Single Source of Truth for Build & Runtime Metadata."""
import datetime
import os
import subprocess
from pathlib import Path
from typing import Any, Dict

_START_TIME = datetime.datetime.now(datetime.timezone.utc).isoformat()


def _get_git_info(repo_root: Path) -> tuple[str, str, bool]:
    """Retrieve current commit hash, branch name, and dirty status."""
    commit = os.environ.get("PAAX_COMMIT", "")
    branch = os.environ.get("PAAX_BRANCH", "")
    dirty_str = os.environ.get("PAAX_DIRTY", "")

    if not commit or not branch:
        try:
            cmd_commit = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=str(repo_root),
                capture_output=True,
                text=True,
                timeout=5,
            )
            if cmd_commit.returncode == 0:
                commit = cmd_commit.stdout.strip()
        except Exception:
            commit = "unknown"

        try:
            cmd_branch = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=str(repo_root),
                capture_output=True,
                text=True,
                timeout=5,
            )
            if cmd_branch.returncode == 0:
                branch = cmd_branch.stdout.strip()
        except Exception:
            branch = "unknown"

    if dirty_str == "":
        try:
            cmd_dirty = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=str(repo_root),
                capture_output=True,
                text=True,
                timeout=5,
            )
            dirty = bool(cmd_dirty.stdout.strip()) if cmd_dirty.returncode == 0 else False
        except Exception:
            dirty = False
    else:
        dirty = dirty_str.lower() in ("1", "true", "yes")

    return commit or "unknown", branch or "unknown", dirty


def get_runtime_identity(service_name: str) -> Dict[str, Any]:
    """Build standardized runtime identity dictionary for diagnostics & startup validation."""
    env_repo = os.environ.get("PAAX_REPO_ROOT")
    if env_repo:
        repo_root = Path(env_repo).resolve()
    else:
        # Resolve relative to paax_db package: paax_db -> src -> db -> services -> REPO_ROOT
        repo_root = Path(__file__).resolve().parents[4]

    commit, branch, dirty = _get_git_info(repo_root)

    data_root = os.environ.get("PAAX_DATA_ROOT", r"G:\PAAX-Data")

    return {
        "repo_root": str(repo_root),
        "commit": commit,
        "branch": branch,
        "dirty": dirty,
        "service_name": service_name,
        "pid": os.getpid(),
        "process_start_time": _START_TIME,
        "data_root": str(Path(data_root).resolve()) if os.path.exists(data_root) else str(data_root),
    }
