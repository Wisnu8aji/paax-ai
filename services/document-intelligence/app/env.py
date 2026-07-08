from __future__ import annotations

import os
from pathlib import Path


def load_repo_env_local() -> None:
    """Load simple KEY=VALUE entries from the repo .env.local for local services."""
    repo_root = Path(__file__).resolve().parents[3]
    env_file = repo_root / ".env.local"
    if not env_file.exists():
        return

    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        os.environ[key] = value.strip().strip('"').strip("'")
