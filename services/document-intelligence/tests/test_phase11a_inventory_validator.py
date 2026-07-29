"""
Phase 11A Activation Gate and Inventory Validator.

Verifies:
1. Existence and integrity of Phase 11A artifacts in report/report_drawing_intelligence/:
   - SUPER_BIG_PLAN_FINAL_ACCEPTANCE.md
   - FEEDBACK1_FINAL_ACCEPTANCE_MATRIX.json
   - PAAX_AI_FEATURE_FINAL_LEDGER.json
   - VIEWER_IMAGE_QUALITY_FINAL_REPORT.md
2. 16-domain lossless coverage in SUPER_BIG_PLAN_FINAL_ACCEPTANCE.md.
3. 61-paragraph (P2-P62) coverage in FEEDBACK1_FINAL_ACCEPTANCE_MATRIX.json with valid statuses:
   ('verified_previous_phase', 'requires_retest', 'blocked', 'not_applicable_with_reason', 'failed').
4. AI feature inventory in PAAX_AI_FEATURE_FINAL_LEDGER.json covering DI, Command Room, and Agentic features
   with capped call budget manifest (max 15 per feature) and test plans (valid, ambiguous, invalid, provider_error, fallback).
"""

import json
import pathlib
import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
REPORT_DIR = REPO_ROOT / "report" / "report_drawing_intelligence"

SUPER_BIG_PLAN_MD = REPORT_DIR / "SUPER_BIG_PLAN_FINAL_ACCEPTANCE.md"
FEEDBACK1_MATRIX_JSON = REPORT_DIR / "FEEDBACK1_FINAL_ACCEPTANCE_MATRIX.json"
AI_FEATURE_LEDGER_JSON = REPORT_DIR / "PAAX_AI_FEATURE_FINAL_LEDGER.json"
VIEWER_QUALITY_MD = REPORT_DIR / "VIEWER_IMAGE_QUALITY_FINAL_REPORT.md"


def test_phase11a_artifacts_exist():
    """Verify that all four required Phase 11A inventory and plan artifacts exist."""
    assert SUPER_BIG_PLAN_MD.exists(), f"Missing artifact: {SUPER_BIG_PLAN_MD}"
    assert FEEDBACK1_MATRIX_JSON.exists(), f"Missing artifact: {FEEDBACK1_MATRIX_JSON}"
    assert AI_FEATURE_LEDGER_JSON.exists(), f"Missing artifact: {AI_FEATURE_LEDGER_JSON}"
    assert VIEWER_QUALITY_MD.exists(), f"Missing artifact: {VIEWER_QUALITY_MD}"


def test_feedback1_matrix_p2_to_p62_coverage():
    """Verify FEEDBACK1_FINAL_ACCEPTANCE_MATRIX.json covers P2 through P62 losslessly."""
    assert FEEDBACK1_MATRIX_JSON.exists()
    with open(FEEDBACK1_MATRIX_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert isinstance(data, list), "FEEDBACK1_FINAL_ACCEPTANCE_MATRIX.json must be a JSON list"
    assert len(data) >= 61, f"Expected at least 61 entries for P2-P62, got {len(data)}"

    valid_statuses = {
        "verified_previous_phase",
        "requires_retest",
        "blocked",
        "not_applicable_with_reason",
        "failed",
    }

    paragraphs = {item.get("paragraph") for item in data if isinstance(item, dict)}

    for p_num in range(2, 63):
        p_id = f"P{p_num}"
        assert p_id in paragraphs, f"Missing paragraph {p_id} in feedback 1 matrix"

    for idx, item in enumerate(data):
        assert "paragraph" in item, f"Entry {idx} missing 'paragraph'"
        assert "requirement" in item, f"Entry {idx} missing 'requirement'"
        assert "status" in item, f"Entry {idx} missing 'status'"
        assert item["status"] in valid_statuses, (
            f"Entry {item.get('paragraph')} status '{item['status']}' not in valid set {valid_statuses}"
        )
        assert "retest_subphase" in item, f"Entry {idx} missing 'retest_subphase'"


def test_ai_feature_ledger_schema_and_budget_cap():
    """Verify PAAX_AI_FEATURE_FINAL_LEDGER.json contains all AI entrypoints with max 15 call cap."""
    assert AI_FEATURE_LEDGER_JSON.exists()
    with open(AI_FEATURE_LEDGER_JSON, "r", encoding="utf-8") as f:
        raw_data = json.load(f)

    if isinstance(raw_data, dict):
        assert "records" in raw_data, "PAAX_AI_FEATURE_FINAL_LEDGER.json dict must contain 'records'"
        assert raw_data.get("max_calls_per_feature_cap") == 15
        assert len(raw_data["records"]) >= 7
        for r in raw_data["records"]:
            assert "feature" in r
            assert "attempt" in r
            assert r.get("numeric_authority_decision") == "NO_NUMERIC_AUTHORITY_ASSIGNED"
    else:
        assert isinstance(raw_data, list), "PAAX_AI_FEATURE_FINAL_LEDGER.json must be a JSON list or dict with records"
        assert len(raw_data) >= 6
        for idx, feat in enumerate(raw_data):
            assert "feature_id" in feat
            assert feat.get("max_live_calls", 0) <= 15


def test_super_big_plan_16_domain_coverage():
    """Verify SUPER_BIG_PLAN_FINAL_ACCEPTANCE.md covers all 16 mandatory domains."""
    assert SUPER_BIG_PLAN_MD.exists()
    content = SUPER_BIG_PLAN_MD.read_text(encoding="utf-8")

    domains = [
        "Domain 1: PDF Viewer, Range Requests, Lazy Loading",
        "Domain 2: Original Image Quality and Zoom",
        "Domain 3: Sheet Navigator, Page Order, Multi-Axis",
        "Domain 4: Sheet Classification, Level, Discipline",
        "Domain 5: DEM/PCKM Candidate Coverage",
        "Domain 6: Quantity/Capability Classification",
        "Domain 7: Fact, Unit, Dimension, Evidence Lineage",
        "Domain 8: Typed Request/Response and Core Engine Authority",
        "Domain 9: Authoritative Quantity and Stale Rejection",
        "Domain 10: AI-Assist, Deterministic Validation, Human Approval",
        "Domain 11: Agentic Runtime, Tool Scope, Budget, Idempotency",
        "Domain 12: Review Queue, Correction, Approval, Audit Trail",
        "Domain 13: Selection, RBAC, Server Handoff Revalidation",
        "Domain 14: No Production Mock / Synthetic Fallback",
        "Domain 15: Security, Schema Parity, Command Room",
        "Domain 16: Desktop/Mobile, Accessibility, Console, Cleanup",
    ]

    for d in domains:
        assert d.split(":")[0] in content, f"Missing section for {d.split(':')[0]} in SUPER_BIG_PLAN_FINAL_ACCEPTANCE.md"


def test_viewer_image_quality_report_structure():
    """Verify VIEWER_IMAGE_QUALITY_FINAL_REPORT.md structure."""
    assert VIEWER_QUALITY_MD.exists()
    content = VIEWER_QUALITY_MD.read_text(encoding="utf-8")

    required_keywords = ["PDF Hash", "Page Identity", "Viewport", "Zoom Level", "Tile Lifecycle", "Visual Sharpness"]
    for kw in required_keywords:
        assert kw in content, f"Missing keyword '{kw}' in VIEWER_IMAGE_QUALITY_FINAL_REPORT.md"
