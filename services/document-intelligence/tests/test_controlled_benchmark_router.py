from __future__ import annotations

import pytest

from app.perception.ai_assist.benchmark_router import (
    BenchmarkCase,
    BenchmarkRecord,
    ControlledBenchmarkLedger,
    drawing_intelligence_api_key_from_env,
)


def case():
    return BenchmarkCase(
        case_id="sheet-title-1",
        prompt_version="classification-v1",
        extracted_text=("DENAH LANTAI 1",),
        bbox_evidence=({"evidence_ref": "ev-1", "bbox": [0, 0, 100, 20]},),
    )


def record(attempt, model):
    return BenchmarkRecord(
        attempt=attempt,
        model=model,
        case_id="sheet-title-1",
        prompt_version="classification-v1",
        input_tokens=10,
        output_tokens=5,
        cost_usd=0.01,
        latency_ms=20,
        proposal={"classification_key": "plan"},
        validation={"valid": True},
        outcome="needs_review",
    )


def test_case_rejects_pdf_or_image_paths():
    with pytest.raises(ValueError):
        BenchmarkCase("bad", "v1", ("G:\\PLHUT.pdf",), ())


def test_allocation_is_exactly_15_plus_15_and_attempt_31_is_rejected(tmp_path):
    ledger = ControlledBenchmarkLedger(tmp_path / "ledger.json")
    for attempt in range(1, 31):
        provider = ledger.next_provider()
        assert provider == ("deepseek-v4-pro" if attempt <= 15 else "qwen-3.7-plus")
        ledger.append(record(attempt, provider))
    assert len(ledger.records()) == 30
    with pytest.raises(RuntimeError, match="attempt 31"):
        ledger.next_provider()


def test_only_drawing_intelligence_key_is_accepted(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "wrong-key")
    monkeypatch.setenv("GEMINI_API_KEY", "wrong-key")
    monkeypatch.delenv("DRAWING_INTELLIGENCE_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="DRAWING_INTELLIGENCE_API_KEY"):
        drawing_intelligence_api_key_from_env()
    monkeypatch.setenv("DRAWING_INTELLIGENCE_API_KEY", "di-test-key")
    assert drawing_intelligence_api_key_from_env() == "di-test-key"
