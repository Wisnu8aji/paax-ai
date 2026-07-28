from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

EXPECTED = [f"P{i}" for i in range(2, 63)]
ALLOWED = {"passed_offline", "implemented_pending_live_evidence", "blocked", "not_applicable"}


def validate(path: Path, require_complete: bool = False) -> list[str]:
    errors: list[str] = []
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("paragraphs")
    if not isinstance(rows, list):
        return ["paragraphs must be a list"]
    ids = [row.get("paragraph_id") for row in rows]
    if ids != EXPECTED:
        errors.append("paragraphs must contain P2-P62 exactly once and in order")
    for row in rows:
        pid = row.get("paragraph_id", "unknown")
        if row.get("status") not in ALLOWED:
            errors.append(f"{pid}: invalid status")
        if "source_excerpt" not in row or "note" not in row:
            errors.append(f"{pid}: source_excerpt and note are required")
        if not isinstance(row.get("evidence"), list) or not isinstance(row.get("browser_evidence"), list):
            errors.append(f"{pid}: evidence fields must be lists")
        if require_complete and row.get("status") in {"implemented_pending_live_evidence", "blocked"}:
            errors.append(f"{pid}: final evidence is not complete")
    if require_complete and payload.get("final_gate", {}).get("status") != "passed":
        errors.append("final_gate is not passed")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", default="scripts/quality/feedback1_matrix.json")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args()
    errors = validate(Path(args.path), require_complete=args.require_complete)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"Feedback 1 matrix valid: {len(EXPECTED)} authoritative paragraph rows")
    return 0

if __name__ == "__main__":
    sys.exit(main())
