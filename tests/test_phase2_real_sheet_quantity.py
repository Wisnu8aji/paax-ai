import os
import sqlite3
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "services" / "db" / "src"))
sys.path.insert(0, str(REPO_ROOT))

import pytest
from paax_db.package_index import build_package_index_from_db, classify_page
from paax_db.civil_work_items_live import build_live_civil_work_items
from scripts.quality.check_no_production_di_dummy import scan as scan_no_dummy
PORTABLE_DB_PATH = REPO_ROOT / "fixtures" / "plhut" / "portable.sqlite"
if not PORTABLE_DB_PATH.is_file():
    PORTABLE_DB_PATH = Path(os.environ.get("PAAX_DATA_ROOT", r"D:\paax-data")) / "db" / "portable.sqlite"
REFERENCE_RUN_ID = os.environ.get(
    "PAAX_REFERENCE_RUN_ID", "514fb7f2-26fd-5816-9f22-a4a2412688bf"
)


def test_package_index_88_pages_lossless_classification():
    """Verify package index preserves all 88 pages and reports review honestly."""
    conn = sqlite3.connect(str(PORTABLE_DB_PATH))
    cur = conn.cursor()
    cur.execute(
        "SELECT page_index, result FROM dem_pages WHERE run_id = ? ORDER BY page_index ASC",
        (REFERENCE_RUN_ID,),
    )
    rows = cur.fetchall()
    assert len(rows) == 88, f"Expected 88 DEM pages, got {len(rows)}"

    manifest = build_package_index_from_db(PORTABLE_DB_PATH, "PLHUT-SURAKARTA", REFERENCE_RUN_ID)

    assert manifest["total_pages"] == 88
    assert manifest["unassigned_count"] == 6, f"Expected 6 unassigned plans, got {manifest['unassigned_count']}"

    pages = manifest["pages"]
    assert len(pages) == 88

    # Verify 1-88 sequential page_number preservation
    page_numbers = [p["page_number"] for p in pages]
    assert page_numbers == list(range(1, 89))

    # Verify summary classifications
    by_cls = manifest["summary"]["by_classification"]
    assert by_cls["cover"] == 1
    assert by_cls["drawing_list"] == 3
    assert by_cls["plan"] == 41
    assert by_cls["detail"] == 20
    assert sum(by_cls.values()) == 88


def test_live_civil_work_items_pipeline_and_completeness():
    """Verify live civil work items pipeline extracts candidates and includes engine receipts."""
    payload = build_live_civil_work_items(PORTABLE_DB_PATH, "PLHUT-SURAKARTA")
    assert payload["project_id"] == "PLHUT-SURAKARTA"
    assert payload["generated_from"] == "measurement_facts_and_project_graph_nodes"

    summary = payload["summary"]
    assert summary["total_candidates"] >= 250
    assert summary["engine_verified_count"] == 0
    assert summary["measurement_verified_count"] >= 1
    assert summary["needs_review_count"] > 0
    assert summary["blocked_missing_evidence_count"] > 0

    items = payload["items"]
    assert len(items) == summary["total_candidates"]

    # Any future engine-verified item must carry a receipt from the database.
    verified_items = [i for i in items if i["status"] == "engine_verified"]
    assert len(verified_items) == 0
    for item in verified_items:
        assert item["source_authority"] == "core_engine"
        assert "engine_receipt" in item
        receipt = item["engine_receipt"]
        assert receipt["engine_version"] == "1.2.0-deterministic"
        assert "input_hash" in receipt

    # Verify domain coverage
    by_domain = summary["by_domain"]
    assert by_domain["Struktur Kolom"] > 0
    assert by_domain["Struktur Balok & Sloof"] > 0
    assert by_domain["Struktur Pelat & Tangga"] > 0
    assert by_domain["MEP & Sanitasi"] > 0


def test_quality_gate_no_production_dummy_data():
    """Verify quality gate passes and no production code reads static civil-work-items.json."""
    findings = scan_no_dummy()
    assert len(findings) == 0, f"Dummy quality gate failed with findings: {findings}"
