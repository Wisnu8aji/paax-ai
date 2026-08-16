import os
import sqlite3
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "services" / "db" / "src"))
sys.path.insert(0, str(REPO_ROOT))

import pytest
from paax_db.package_index import build_package_index_from_db
from paax_db.civil_work_items_live import build_live_civil_work_items
from paax_db.runtime_identity import get_runtime_identity
from scripts.quality.check_no_production_di_dummy import scan as scan_no_dummy


PORTABLE_DB_PATH = REPO_ROOT / "fixtures" / "plhut" / "portable.sqlite"
if not PORTABLE_DB_PATH.is_file():
    PORTABLE_DB_PATH = Path(os.environ.get("PAAX_DATA_ROOT", r"D:\paax-data")) / "db" / "portable.sqlite"
REFERENCE_RUN_ID = os.environ.get(
    "PAAX_REFERENCE_RUN_ID", "514fb7f2-26fd-5816-9f22-a4a2412688bf"
)


def test_runtime_identity_and_commit():
    """Verify runtime identity resolves correctly to current repo root."""
    identity = get_runtime_identity("test-service")
    assert identity["service_name"] == "test-service"
    assert identity["repo_root"] == str(REPO_ROOT)
    assert len(identity["commit"]) >= 7


def test_agentic_workflow_receipt_and_completeness():
    """Verify live work items pipeline produces deterministic calculation receipts for engine verified items."""
    payload = build_live_civil_work_items(PORTABLE_DB_PATH, "PLHUT-SURAKARTA")
    assert payload["schema_version"] == "3.0-live-phase4"
    assert payload["project_id"] == "PLHUT-SURAKARTA"

    summary = payload["summary"]
    assert summary["total_candidates"] >= 250
    assert summary["engine_verified_count"] == 0
    assert summary["measurement_verified_count"] >= 1
    assert summary["needs_review_count"] > 0
    assert summary["blocked_missing_evidence_count"] > 0

    items = payload["items"]
    verified = [i for i in items if i["status"] == "engine_verified"]
    assert len(verified) == 0
    for item in verified:
        assert "engine_receipt" in item
        receipt = item["engine_receipt"]
        assert receipt["engine_version"] == "1.2.0-deterministic"
        assert "rule_id" in receipt
        assert "input_hash" in receipt


def test_drawing_package_index_completeness():
    """Verify the 88-page Drawing Package Index preserves review states."""
    conn = sqlite3.connect(str(PORTABLE_DB_PATH))
    cur = conn.cursor()
    cur.execute(
        "SELECT page_index, result FROM dem_pages WHERE run_id = ? ORDER BY page_index ASC",
        (REFERENCE_RUN_ID,),
    )
    rows = cur.fetchall()
    assert len(rows) == 88

    manifest = build_package_index_from_db(PORTABLE_DB_PATH, "PLHUT-SURAKARTA", REFERENCE_RUN_ID)

    assert manifest["total_pages"] == 88
    assert manifest["unassigned_count"] == 6

    pages = manifest["pages"]
    assert len(pages) == 88
    assert [p["page_number"] for p in pages] == list(range(1, 89))


def test_quality_gate_no_dummy():
    """Verify quality gate scans clear of any static fixture imports in production routes."""
    findings = scan_no_dummy()
    assert len(findings) == 0, f"Quality gate found dummy violations: {findings}"
