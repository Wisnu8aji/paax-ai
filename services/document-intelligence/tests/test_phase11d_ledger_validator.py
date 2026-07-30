import json
import pathlib
import pytest

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

PROVIDER_BACKED_FEATURES = [
    "sheet_classification_fallback",
    "evidence_binding_suggestion",
    "review_explanation_router",
    "command_room_router",
    "agentic_planner_governance",
]

DETERMINISTIC_FEATURES = [
    "discipline_ambiguity_resolution",
    "deterministic_rejection_fallback",
]


def test_ai_feature_ledger_exists_and_schema():
    """Verify Phase 11D AI feature final ledger exists and matches schema v1."""
    assert LEDGER_PATH.exists(), f"Missing ledger at {LEDGER_PATH}"
    data = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))

    assert data["schema_version"] == "paax.drawing-intelligence.phase11d-final-ledger.v1"
    assert data["model"] == "deepseek/deepseek-v4-flash"
    assert data["max_calls_per_feature_cap"] == 5
    assert data["total_records_count"] == 42


def test_execution_mode_and_network_sent_contracts():
    """Verify execution mode contracts and fail-closed network call semantics."""
    data = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
    records = data["records"]

    valid_modes = {"live_provider", "deterministic_fast_path", "simulated_error", "manual_fallback", "budget_rejection"}

    for r in records:
        mode = r.get("execution_mode")
        assert mode in valid_modes, f"Invalid execution_mode '{mode}' in record {r['feature']} attempt {r['attempt']}"
        assert "network_sent" in r, f"Missing network_sent boolean in record {r['feature']} attempt {r['attempt']}"
        assert "http_status" in r, f"Missing http_status in record {r['feature']} attempt {r['attempt']}"
        assert "provider_request_id" in r, f"Missing provider_request_id in record {r['feature']} attempt {r['attempt']}"
        assert "product_file" in r and r["product_file"], f"Missing product_file mapping in record {r['feature']}"
        assert "product_symbol" in r and r["product_symbol"], f"Missing product_symbol mapping in record {r['feature']}"

        if mode == "live_provider":
            assert r["network_sent"] is True, f"live_provider mode must set network_sent=True"
            assert r["http_status"] == 200, f"live_provider mode must return http_status=200"
            assert r["response_schema_valid"] is True, f"live_provider mode must have response_schema_valid=True"
            assert r["provider_request_id"] is not None and isinstance(r["provider_request_id"], str), (
                f"live_provider mode must contain non-secret provider_request_id"
            )
            assert r["tokens"] is not None and "input_tokens" in r["tokens"], f"live_provider mode must track returned tokens"
        else:
            assert r["network_sent"] is False, f"Non-live mode '{mode}' must set network_sent=False"
            assert r["http_status"] is None, f"Non-live mode '{mode}' must set http_status=None"
            assert r["provider_request_id"] is None, f"Non-live mode '{mode}' must set provider_request_id=None"


def test_attempt_6_budget_cap_gate():
    """Verify every feature has an attempt 6 record that is rejected fail-closed before network."""
    data = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
    records = data["records"]

    for feature in EXPECTED_FEATURES:
        feat_records = [r for r in records if r["feature"] == feature]
        assert len(feat_records) == 6, f"Feature {feature} must have 6 attempt records (5 budget + 1 cap test)"
        
        attempt_6 = next((r for r in feat_records if r["attempt"] == 6), None)
        assert attempt_6 is not None, f"Feature {feature} missing attempt 6 record"
        assert attempt_6["execution_mode"] == "budget_rejection"
        assert attempt_6["network_sent"] is False
        assert attempt_6["outcome"] == "ATTEMPT_6_REJECTED"
        assert "budget cap" in attempt_6["reason"].lower()


def test_per_feature_network_sent_counts_and_provider_backed_pass():
    """Verify actual network_sent counts per feature <= 5 and genuine live PASS for provider-backed features."""
    data = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
    records = data["records"]

    for feature in EXPECTED_FEATURES:
        feat_records = [r for r in records if r["feature"] == feature]
        network_calls = [r for r in feat_records if r["network_sent"] is True]
        assert len(network_calls) <= 5, f"Feature {feature} exceeded max 5 network calls (sent {len(network_calls)})"

        if feature in PROVIDER_BACKED_FEATURES:
            live_pass = [r for r in feat_records if r["execution_mode"] == "live_provider" and r["outcome"] == "PASS"]
            assert len(live_pass) >= 1, f"Provider-backed feature {feature} missing live_provider PASS record"
            assert live_pass[0]["network_sent"] is True
            assert live_pass[0]["http_status"] == 200
        elif feature in DETERMINISTIC_FEATURES:
            assert len(network_calls) == 0, f"Deterministic feature {feature} should have 0 network calls (found {len(network_calls)})"


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


def test_no_secret_keys_or_bearer_tokens_in_ledger():
    """Fail-closed check: verify no secret API key or Authorization header is written to the ledger."""
    text = LEDGER_PATH.read_text(encoding="utf-8")
    
    assert "sk-or-v1-" not in text, "CRITICAL: Live API key pattern found in ledger!"
    assert "Authorization" not in text, "CRITICAL: Authorization header string found in ledger!"
    assert "Bearer " not in text, "CRITICAL: Bearer token string found in ledger!"
