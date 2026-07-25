from pathlib import Path

import pytest

from scripts.live_test.fixture_paths import resolve_plhut_fixture_dir


def test_prefers_portable_plhut_fixture_directory(tmp_path: Path) -> None:
    preferred = tmp_path / "fixtures" / "plhut" / "dem-pages"
    preferred.mkdir(parents=True)
    (preferred / "page-0000.json").write_text("{}", encoding="utf-8")

    assert resolve_plhut_fixture_dir(tmp_path) == preferred


def test_falls_back_to_legacy_report_fixture_directory(tmp_path: Path) -> None:
    legacy = tmp_path / "report" / "report_drawing_intelligence" / "dem_extraction_88pages" / "pages"
    legacy.mkdir(parents=True)
    (legacy / "page-0000.json").write_text("{}", encoding="utf-8")

    assert resolve_plhut_fixture_dir(tmp_path) == legacy


def test_raises_clear_error_when_fixture_is_missing(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="PLHUT 88-page fixture"):
        resolve_plhut_fixture_dir(tmp_path)
