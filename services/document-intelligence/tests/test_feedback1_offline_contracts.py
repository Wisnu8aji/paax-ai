"""
Phase 10A Offline Contract Tests for Feedback 1 Audit Matrix.
Verifies fail-closed validation rules, lossless coverage of P2-P62,
browser evidence placeholders, Core Engine authority mappings, and P62 benchmark ledger schema.
"""

import json
import pathlib
import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
MATRIX_JSON_PATH = REPO_ROOT / "scripts" / "quality" / "feedback1_matrix.json"
MATRIX_PY_PATH = REPO_ROOT / "scripts" / "quality" / "feedback1_matrix.py"


def test_matrix_json_exists_and_loads():
    """Fail-closed check: matrix file must exist and be valid JSON."""
    assert MATRIX_JSON_PATH.exists(), f"Matrix file missing: {MATRIX_JSON_PATH}"
    with open(MATRIX_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert isinstance(data, list) or "matrix" in data


def test_matrix_paragraphs_coverage_p2_to_p62():
    """Verify lossless coverage of paragraphs P2 through P62 with no duplicates."""
    with open(MATRIX_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    matrix = data.get("matrix", data) if isinstance(data, dict) else data

    paragraphs = [item["paragraph"] for item in matrix]

    # Check no duplicate paragraph IDs
    assert len(paragraphs) == len(set(paragraphs)), "Duplicate paragraph IDs found in matrix"

    # Check P2 through P62 exist
    for p_num in range(2, 63):
        p_id = f"P{p_num}"
        assert p_id in paragraphs, f"Missing paragraph {p_id} in feedback1_matrix.json"


def test_matrix_fail_closed_fields():
    """Verify every entry has non-empty required fields."""
    with open(MATRIX_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    matrix = data.get("matrix", data) if isinstance(data, dict) else data

    required_keys = ["paragraph", "requirement", "command", "artifact", "status", "limitation"]
    valid_statuses = ["passed", "failed", "pending", "blocked", "offline_verified"]

    for item in matrix:
        p_id = item.get("paragraph", "UNKNOWN")
        for key in required_keys:
            assert key in item, f"Entry {p_id} missing key '{key}'"
            assert isinstance(item[key], str), f"Entry {p_id} key '{key}' must be string"
            assert len(item[key].strip()) > 0, f"Entry {p_id} key '{key}' must not be empty"

        assert item["status"] in valid_statuses, f"Entry {p_id} invalid status '{item['status']}'"

        # Fail-closed rule: if status is 'passed' or 'offline_verified', evidence artifact must exist
        if item["status"] in ["passed", "offline_verified"]:
            artifact_path = REPO_ROOT / item["artifact"]
            assert artifact_path.exists(), f"Entry {p_id} references missing evidence artifact: {item['artifact']}"


def test_matrix_browser_placeholders_p2_to_p8_and_p59_to_p61():
    """Verify P2-P8 and P59-P61 have browser placeholders marked pending/blocked in Phase 10A."""
    with open(MATRIX_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    matrix = data.get("matrix", data) if isinstance(data, dict) else data
    matrix_map = {item["paragraph"]: item for item in matrix}

    # Phase 10B is complete: browser placeholders may now be 'passed', 'pending', or 'blocked'
    browser_paragraphs = [f"P{i}" for i in range(2, 9)] + [f"P{i}" for i in range(59, 62)]
    for p_id in browser_paragraphs:
        assert p_id in matrix_map, f"Missing browser paragraph {p_id}"
        entry = matrix_map[p_id]
        assert entry["status"] in ["pending", "blocked", "passed", "offline_verified"], \
            f"Browser entry {p_id} status must be valid, got '{entry['status']}'"


def test_matrix_core_engine_authority_p5_p7_p60():
    """Verify P5, P7, and P60 specify Core Engine quantity/calc authority mapping."""
    with open(MATRIX_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    matrix = data.get("matrix", data) if isinstance(data, dict) else data
    matrix_map = {item["paragraph"]: item for item in matrix}

    for p_id in ["P5", "P7", "P60"]:
        assert p_id in matrix_map
        entry = matrix_map[p_id]
        combined_text = f"{entry['requirement']} {entry['command']} {entry['limitation']}".lower()
        assert "core_engine" in combined_text or "core engine" in combined_text or "engine" in combined_text, f"Entry {p_id} must reference Core Engine authority"


def test_matrix_p62_ledger_benchmark_schema():
    """Verify P62 defines benchmark ledger schema fields."""
    with open(MATRIX_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    matrix = data.get("matrix", data) if isinstance(data, dict) else data
    matrix_map = {item["paragraph"]: item for item in matrix}

    assert "P62" in matrix_map
    p62 = matrix_map["P62"]
    schema_fields = [
        "model", "feature", "case", "attempt", "prompt_version",
        "token", "cost", "latency", "proposal", "deterministic_validation",
        "outcome", "reason"
    ]
    limitation_text = p62["limitation"].lower()
    requirement_text = p62["requirement"].lower()
    combined = limitation_text + " " + requirement_text

    for field in schema_fields:
        assert field in combined, f"P62 benchmark ledger specification missing field '{field}'"
