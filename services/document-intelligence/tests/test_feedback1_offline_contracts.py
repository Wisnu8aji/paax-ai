from __future__ import annotations

import json
from pathlib import Path


def test_feedback1_matrix_covers_p2_to_p62_exactly_once():
    root = Path(__file__).resolve().parents[3]
    payload = json.loads((root / "scripts/quality/feedback1_matrix.json").read_text(encoding="utf-8"))
    assert [row["paragraph_id"] for row in payload["paragraphs"]] == [f"P{i}" for i in range(2, 63)]


def test_feedback1_matrix_does_not_claim_final_completion_without_live_evidence():
    root = Path(__file__).resolve().parents[3]
    payload = json.loads((root / "scripts/quality/feedback1_matrix.json").read_text(encoding="utf-8"))
    assert payload["final_gate"]["status"] == "pending"
    assert any(row["status"] == "implemented_pending_live_evidence" for row in payload["paragraphs"])
