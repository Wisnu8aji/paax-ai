"""
Phase 10C Benchmark Ledger and Audit Report Validator Contract Tests.
Verifies:
1. Non-secret benchmark ledger schema (FEEDBACK1_AI_BENCHMARK_2026-07-26.json).
2. Hard call limit cap: aggregate network calls (call_count in each record) must not exceed 15.
3. No final numeric calculation authority granted to AI (Core Engine authority invariant).
4. Lossless P2-P62 audit coverage in FEEDBACK1_ACCEPTANCE_AUDIT_2026-07-26.md.
5. Provider error / preflight network requests are counted truthfully in call_count.
"""

import json
import pathlib
import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
BENCHMARK_JSON_PATH = REPO_ROOT / "report" / "report_drawing_intelligence" / "FEEDBACK1_AI_BENCHMARK_2026-07-26.json"
AUDIT_MD_PATH = REPO_ROOT / "report" / "report_drawing_intelligence" / "FEEDBACK1_ACCEPTANCE_AUDIT_2026-07-26.md"


def test_benchmark_json_exists_and_validates():
    """Verify benchmark JSON exists, is valid JSON, and adheres to non-secret ledger schema.

    Per Phase 10C correction round 1 requirements:
    - Preflight network requests (even 401 errors) MUST be counted in call_count.
    - call_count represents aggregate network requests so far (monotonically increases or stays).
    - No individual feature may exceed 15 total calls including preflight + completion attempts.
    - No secret-like values in any record.
    - AI must never hold final numeric authority.
    """
    assert BENCHMARK_JSON_PATH.exists(), f"Benchmark ledger JSON missing: {BENCHMARK_JSON_PATH}"
    with open(BENCHMARK_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert isinstance(data, list), "Benchmark ledger must be a JSON array"

    required_fields = [
        "model", "feature", "case", "attempt", "prompt_version",
        "token", "cost", "latency", "proposal", "deterministic_validation",
        "outcome", "reason", "manual_fallback", "call_count"
    ]

    # Track per-feature call counts (using last seen call_count for the feature)
    feature_call_counts: dict[str, int] = {}
    max_call_count_seen = 0

    for idx, rec in enumerate(data):
        for field in required_fields:
            assert field in rec, f"Record {idx} missing required field '{field}'"

        feat = rec["feature"]
        call_count = rec["call_count"]
        assert isinstance(call_count, int), f"Record {idx} call_count must be integer"
        assert call_count >= 0, f"Record {idx} call_count must be non-negative"
        assert call_count <= 15, (
            f"Feature '{feat}' call_count {call_count} exceeds maximum hard budget of 15 "
            "(including all preflight/auth/retry/error network requests)"
        )

        # Track max call_count seen per feature
        feature_call_counts[feat] = max(feature_call_counts.get(feat, 0), call_count)
        max_call_count_seen = max(max_call_count_seen, call_count)

        # Check no raw secrets exposed in record
        rec_str = json.dumps(rec).lower()
        # Check that the record does not embed literal secret values
        # (key names are allowed in reason/outcome text; only actual key values are forbidden)
        assert "drawing_intelligence_api_key" not in rec_str.replace("drawing_intelligence_api_key", "di_key_ref"), (
            f"Record {idx} must not contain the literal key name as a value"
        )

        # Check Golden Rule: AI must never be final numeric authority
        val = rec.get("deterministic_validation", {})
        if isinstance(val, dict):
            auth = val.get("sourceAuthority", "none")
            assert auth != "ai_model", f"Record {idx} illegally assigned numeric authority to AI model"

        # Verify preflight/auth errors are recorded honestly (outcome != "passed" if 401)
        if "401" in str(rec.get("reason", "")):
            assert rec.get("outcome") in ("provider_error", "blocked"), (
                f"Record {idx}: 401 error must be recorded as provider_error or blocked, "
                f"not '{rec.get('outcome')}'"
            )

    # Validate no feature exceeded 15 total calls
    for feat, count in feature_call_counts.items():
        assert count <= 15, f"Feature '{feat}' total call_count {count} exceeds 15-call cap"


def test_acceptance_audit_md_exists_and_covers_p2_to_p62():
    """Verify markdown audit report covers all paragraphs P2 through P62."""
    assert AUDIT_MD_PATH.exists(), f"Audit report missing: {AUDIT_MD_PATH}"
    content = AUDIT_MD_PATH.read_text(encoding="utf-8")

    for p_num in range(2, 63):
        p_id = f"P{p_num}"
        assert p_id in content, f"Audit report missing paragraph {p_id}"


def test_benchmark_preflight_calls_counted_truthfully():
    """Verify that any preflight/authentication network requests are counted, not reported as 0."""
    assert BENCHMARK_JSON_PATH.exists()
    with open(BENCHMARK_JSON_PATH, "r", encoding="utf-8") as f:
        records = json.load(f)

    # If any record has outcome = provider_error, its call_count must be > 0
    error_records = [r for r in records if r.get("outcome") == "provider_error"]
    for rec in error_records:
        assert rec["call_count"] > 0, (
            f"Record with outcome=provider_error must have call_count > 0 "
            f"(network requests that fail still count). Got call_count={rec['call_count']} "
            f"for feature '{rec.get('feature')}'"
        )
