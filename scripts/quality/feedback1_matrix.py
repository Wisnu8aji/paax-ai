#!/usr/bin/env python3
"""
Phase 10A Feedback 1 Matrix Validator Script.
Usage: python scripts/quality/feedback1_matrix.py --check
"""

import sys
import json
import argparse
import pathlib

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
MATRIX_JSON_PATH = REPO_ROOT / "scripts" / "quality" / "feedback1_matrix.json"


def validate_matrix(matrix_path: pathlib.Path) -> bool:
    """Fail-closed validation of Feedback 1 Matrix."""
    print(f"[MATRIX CHECK] Validating {matrix_path}...")
    if not matrix_path.exists():
        print(f"[ERROR] Matrix file does not exist: {matrix_path}")
        return False

    try:
        with open(matrix_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"[ERROR] Failed to parse JSON matrix: {e}")
        return False

    matrix = data.get("matrix", data) if isinstance(data, dict) else data
    if not isinstance(matrix, list):
        print(f"[ERROR] Matrix payload must be a list of objects")
        return False

    # 1. Paragraph completeness & duplicate check (P2..P62)
    paragraphs = [item.get("paragraph") for item in matrix if isinstance(item, dict)]
    if len(paragraphs) != len(set(paragraphs)):
        print(f"[ERROR] Duplicate paragraph IDs found in matrix: {paragraphs}")
        return False

    for p_num in range(2, 63):
        p_id = f"P{p_num}"
        if p_id not in paragraphs:
            print(f"[ERROR] Missing required paragraph {p_id} in matrix")
            return False

    # 2. Required non-empty fields & status validation
    required_fields = ["paragraph", "requirement", "command", "artifact", "status", "limitation"]
    valid_statuses = {"passed", "failed", "pending", "blocked", "offline_verified"}

    matrix_map = {}
    for item in matrix:
        p_id = item.get("paragraph", "UNKNOWN")
        matrix_map[p_id] = item

        for field in required_fields:
            val = item.get(field)
            if not val or not isinstance(val, str) or not val.strip():
                print(f"[ERROR] Entry {p_id} has missing or empty field '{field}'")
                return False

        status = item.get("status")
        if status not in valid_statuses:
            print(f"[ERROR] Entry {p_id} has invalid status '{status}' (must be one of {valid_statuses})")
            return False

        # Fail-closed artifact path existence check for passed/offline_verified
        if status in {"passed", "offline_verified"}:
            art_path = REPO_ROOT / item["artifact"]
            if not art_path.exists():
                print(f"[ERROR] Entry {p_id} status is '{status}' but artifact file does not exist: {art_path}")
                return False

    # 3. Phase 10A Browser placeholders check (P2..P8 and P59..P61 must be pending/blocked)
    browser_placeholders = [f"P{i}" for i in range(2, 9)] + [f"P{i}" for i in range(59, 62)]
    for p_id in browser_placeholders:
        entry = matrix_map.get(p_id, {})
        st = entry.get("status")
        if st not in {"pending", "blocked"}:
            print(f"[ERROR] Phase 10A browser placeholder {p_id} status must be 'pending' or 'blocked', got '{st}'")
            return False

    # 4. Core Engine authority mapping check for P5, P7, P60
    for p_id in ["P5", "P7", "P60"]:
        entry = matrix_map.get(p_id, {})
        text = f"{entry.get('requirement', '')} {entry.get('command', '')} {entry.get('limitation', '')}".lower()
        if "engine" not in text and "core_engine" not in text:
            print(f"[ERROR] Core Engine authority mapping missing for {p_id}")
            return False

    # 5. P62 Benchmark Ledger Schema Check
    p62 = matrix_map.get("P62", {})
    p62_text = f"{p62.get('requirement', '')} {p62.get('limitation', '')}".lower()
    ledger_fields = [
        "model", "feature", "case", "attempt", "prompt_version",
        "token", "cost", "latency", "proposal", "deterministic_validation",
        "outcome", "reason"
    ]
    for lf in ledger_fields:
        if lf not in p62_text:
            print(f"[ERROR] P62 missing ledger schema field '{lf}' in limitation specification")
            return False

    print(f"[SUCCESS] Feedback 1 Matrix verified: {len(matrix)} entries (P2..P62 lossless coverage)")
    return True


def main():
    parser = argparse.ArgumentParser(description="Phase 10A Feedback 1 Matrix Validator")
    parser.add_argument("--check", action="store_true", help="Validate matrix json fail-closed")
    args = parser.parse_args()

    if args.check:
        success = validate_matrix(MATRIX_JSON_PATH)
        if not success:
            sys.exit(1)
        sys.exit(0)
    else:
        print("Usage: python scripts/quality/feedback1_matrix.py --check")
        sys.exit(1)


if __name__ == "__main__":
    main()
