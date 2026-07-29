import json
import pathlib
import re

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
LEDGER_PATH = REPO_ROOT / "report" / "report_drawing_intelligence" / "PAAX_AI_FEATURE_FINAL_LEDGER.json"

EXPECTED_FEATURES = [
    "sheet_classification_fallback",
    "discipline_ambiguity_resolution",
    "evidence_binding_suggestion",
    "review_explanation_router",
    "deterministic_rejection_fallback",
    "command_room_router",
    "agentic_planner_governance",
]


def test_ai_feature_ledger_exists_and_schema():
    """Verify Phase 11D AI feature final ledger exists and matches schema v1."""
    assert LEDGER_PATH.exists(), f"Missing ledger at {LEDGER_PATH}"
    data = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))

    assert data["schema_version"] == "paax.drawing-intelligence.phase11d-final-ledger.v1"
    assert data["model"] == "deepseek/deepseek-v4-flash"
    assert data["max_calls_per_feature_cap"] == 15
    assert data["total_records_count"] == 112


def test_attempt_16_budget_cap_gate():
    """Verify every feature has an attempt 16 record that is rejected fail-closed before network."""
    data = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
    records = data["records"]

    for feature in EXPECTED_FEATURES:
        feat_records = [r for r in records if r["feature"] == feature]
        assert len(feat_records) == 16, f"Feature {feature} must have 16 attempt records (15 budget + 1 cap test)"
        
        attempt_16 = next((r for r in feat_records if r["attempt"] == 16), None)
        assert attempt_16 is not None, f"Feature {feature} missing attempt 16 record"
        assert attempt_16["outcome"] == "ATTEMPT_16_REJECTED"
        assert "budget cap" in attempt_16["reason"].lower()


def test_no_numeric_authority_assigned_to_ai():
    """Verify numeric authority is 100% denied to AI across all 112 records."""
    data = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
    records = data["records"]

    for r in records:
        assert r["numeric_authority_decision"] == "NO_NUMERIC_AUTHORITY_ASSIGNED", f"Record {r['feature']} attempt {r['attempt']} breached numeric authority rule!"
        
        proposal = r.get("proposal")
        if proposal and isinstance(proposal, dict):
            for k, v in proposal.items():
                assert k.lower() not in {"quantity", "volume", "total_cost", "unit_price"}, f"AI proposal contained numeric volume field '{k}'!"


def test_all_7_graphify_features_tested_with_live_pass():
    """Verify all 7 Graphify-discovered AI features have at least one live DeepSeek PASS record."""
    data = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
    records = data["records"]

    for feature in EXPECTED_FEATURES:
        feat_pass = [r for r in records if r["feature"] == feature and r["outcome"] == "PASS"]
        assert len(feat_pass) >= 1, f"Feature {feature} has no live DeepSeek PASS record!"
        assert feat_pass[0]["model"] == "deepseek/deepseek-v4-flash"


def test_no_secret_keys_or_bearer_tokens_in_ledger():
    """Fail-closed check: verify no secret API key or Authorization header is written to the ledger."""
    text = LEDGER_PATH.read_text(encoding="utf-8")
    
    assert "sk-or-v1-" not in text, "CRITICAL: Live API key pattern found in ledger!"
    assert "Authorization" not in text, "CRITICAL: Authorization header string found in ledger!"
    assert "Bearer " not in text, "CRITICAL: Bearer token string found in ledger!"
