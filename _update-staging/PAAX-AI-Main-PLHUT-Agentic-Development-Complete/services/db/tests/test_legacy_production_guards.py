"""Static regression guards for F20 compatibility boundaries (no source deletion)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]

def test_db_has_no_direct_core_engine_filesystem_import():
    source = "\n".join(path.read_text(encoding="utf-8") for path in (ROOT / "services/db/src/paax_db").glob("*.py"))
    assert "sys.path.append" not in source
    assert "from services.core_engine" not in source

def test_primary_project_navigation_does_not_import_legacy_tkg_workspace():
    layout = (ROOT / "apps/web/src/app/(dashboard)/proyek/[projectId]/layout.tsx").read_text(encoding="utf-8")
    assert "tkg-workspace" not in layout.lower()
    assert "href: '/drawing-intelligence'" in layout

def test_legacy_adapters_are_explicitly_marked_not_authoritative():
    source = (ROOT / "apps/web/src/lib/projects/tkg-repository.ts").read_text(encoding="utf-8")
    assert "Compatibility records are never the authority" in source
