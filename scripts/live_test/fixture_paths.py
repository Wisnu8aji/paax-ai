"""Locations for checked-in, non-secret PLHUT local-demo fixture data."""
from __future__ import annotations

from pathlib import Path


def resolve_plhut_fixture_dir(repo_root: Path) -> Path:
    """Return the portable fixture directory, with legacy-layout compatibility."""
    candidates = (
        repo_root / "fixtures" / "plhut" / "dem-pages",
        repo_root / "report" / "report_drawing_intelligence" / "dem_extraction_88pages" / "pages",
    )
    for candidate in candidates:
        if candidate.is_dir() and any(candidate.glob("page-*.json")):
            return candidate
    raise FileNotFoundError(
        "PLHUT 88-page fixture is missing. Expected fixtures/plhut/dem-pages."
    )
