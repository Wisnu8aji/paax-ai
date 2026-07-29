"""
Phase 10C Benchmark Ledger and Audit Report Validator Contract Tests.
Verifies:
1. Non-secret benchmark ledger schema (FEEDBACK1_AI_BENCHMARK_2026-07-26.json).
2. Hard call limit cap: max 15 live calls per AI feature.
3. No final numeric calculation authority granted to AI (Core Engine authority invariant).
4. Lossless P2-P62 audit coverage in FEEDBACK1_ACCEPTANCE_AUDIT_2026-07-26.md.
"""

import json
import pathlib
import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
BENCHMARK_JSON_PATH = REPO_ROOT / "report" / "report_drawing_intelligence" / "FEEDBACK1_AI_BENCHMARK_2026-07-26.json"
AUDIT_MD_PATH = REPO_ROOT / "report" / "report_drawing_intelligence" / "FEEDBACK1_ACCEPTANCE_AUDIT_2026-07-26.md"


def test_benchmark_json_exists_and_validates():
    """Verify benchmark JSON exists, is valid JSON, and adheres to non-secret ledger schema."""
    assert BENCHMARK_JSON_PATH.exists(), f"Benchmark ledger JSON missing: {BENCHMARK_JSON_PATH}"
    with open(BENCHMARK_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert isinstance(data, list) or "records" in data or "benchmark" in data
    records = data.get("records", data.get("benchmark", data)) if isinstance(data, dict) else data

    required_fields = [
        "model", "feature", "case", "attempt", "prompt_version",
        "token", "cost", "latency", "proposal", "deterministic_validation",
        "outcome", "reason", "manual_fallback", "call_count"
    ]

    feature_counts = {}
    for idx, rec in enumerate(records):
        for field in required_fields:
            assert field in rec, f"Record {idx} missing required field '{field}'"

        feat = rec["feature"]
        feature_counts[feat] = feature_counts.get(feat, 0) + 1
        assert rec["call_count"] <= 15, f"Feature '{feat}' call count {rec['call_count']} exceeds maximum hard budget of 15"

        # Check no raw secrets exposed in record
        rec_str = json.dumps(rec).lower()
        forbidden_keywords = ["sk-", "bearer ", "api_key=", "secret"]
        for kw in forbidden_keywords:
            assert kw not in rec_str, f"Forbidden secret keyword '{kw}' found in benchmark record"

        # Check Golden Rule: AI must never be final numeric authority
        val = rec.get("deterministic_validation", {})
        if isinstance(val, dict):
            auth = val.get("sourceAuthority", "none")
            assert auth != "ai_model", f"Record {idx} illegally assigned numeric authority to AI model"

    for feat, count in feature_counts.items():
        assert count <= 15, f"Feature '{feat}' total records {count} exceeds 15 call cap"


def test_acceptance_audit_md_exists_and_covers_p2_to_p62():
    """Verify markdown audit report covers all paragraphs P2 through P62."""
    assert AUDIT_MD_PATH.exists(), f"Audit report missing: {AUDIT_MD_PATH}"
    content = AUDIT_MD_PATH.read_text(encoding="utf-8")

    for p_num in range(2, 63):
        p_id = f"P{p_num}"
        assert p_id in content, f"Audit report missing paragraph {p_id}"
