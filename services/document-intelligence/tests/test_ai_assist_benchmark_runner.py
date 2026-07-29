from __future__ import annotations

import json
from pathlib import Path
import pytest

from app.perception.ai_assist.benchmark_router import (
    BenchmarkCase,
    ControlledBenchmarkLedger,
)
from app.perception.ai_assist.model_router import DrawingIntelligenceModelRouter
from app.perception.ai_assist.benchmark_runner import run_benchmark, default_fake_transport

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "ai_assist" / "benchmark_cases.json"


def load_test_cases() -> list[BenchmarkCase]:
    raw = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    cases = []
    for item in raw:
        cases.append(
            BenchmarkCase(
                case_id=item["case_id"],
                prompt_version=item["prompt_version"],
                extracted_text=tuple(item["extracted_text"]),
                bbox_evidence=tuple(item["bbox_evidence"]),
            )
        )
    return cases


def test_allocation_is_exactly_15_deepseek_and_15_qwen(tmp_path):
    ledger = ControlledBenchmarkLedger(tmp_path / "ledger.json")
    router = DrawingIntelligenceModelRouter(key="di-test-key")
    cases = load_test_cases()

    summary = run_benchmark(cases=cases, router=router, ledger=ledger, max_attempts=30)

    assert summary.total_attempts == 30
    assert summary.deepseek_attempts == 15
    assert summary.qwen_attempts == 15
    assert summary.successful_attempts == 30
    assert summary.failed_attempts == 0

    records = ledger.records()
    for i in range(15):
        assert records[i]["model"] == "deepseek-v4-pro"
    for i in range(15, 30):
        assert records[i]["model"] == "qwen-3.7-plus"


def test_attempt_31_is_rejected_before_network_call(tmp_path):
    ledger = ControlledBenchmarkLedger(tmp_path / "ledger.json")
    router = DrawingIntelligenceModelRouter(key="di-test-key")
    cases = load_test_cases()

    # Fill 30 attempts first
    run_benchmark(cases=cases, router=router, ledger=ledger, max_attempts=30)

    # Calling get_allocation_for_attempt(31) or next_provider() raises RuntimeError
    with pytest.raises(RuntimeError, match="31"):
        router.get_allocation_for_attempt(31)

    with pytest.raises(RuntimeError, match="31"):
        ledger.next_provider()


def test_exception_and_timeout_recorded_and_counted(tmp_path):
    ledger = ControlledBenchmarkLedger(tmp_path / "ledger.json")
    router = DrawingIntelligenceModelRouter(key="di-test-key")
    cases = load_test_cases()

    def failing_transport(provider, case, api_key):
        if provider == "deepseek-v4-pro":
            raise TimeoutError("HTTP 504 Gateway Timeout connecting to provider")
        return default_fake_transport(provider, case, api_key)

    summary = run_benchmark(
        cases=cases,
        router=router,
        ledger=ledger,
        max_attempts=30,
        transport=failing_transport,
    )

    assert summary.total_attempts == 30
    assert summary.failed_attempts == 15
    assert summary.successful_attempts == 15

    records = ledger.records()
    for r in records[:15]:
        assert r["outcome"] == "provider_error"
        assert "TimeoutError" in r["exception"]


def test_idempotent_ledger_resume(tmp_path):
    ledger_path = tmp_path / "ledger.json"
    router = DrawingIntelligenceModelRouter(key="di-test-key")
    cases = load_test_cases()

    # First run: 10 attempts
    ledger1 = ControlledBenchmarkLedger(ledger_path)
    run_benchmark(cases=cases, router=router, ledger=ledger1, max_attempts=10)
    assert len(ledger1.records()) == 10

    # Resume run: complete up to 30 attempts
    ledger2 = ControlledBenchmarkLedger(ledger_path)
    summary = run_benchmark(cases=cases, router=router, ledger=ledger2, max_attempts=30)
    assert summary.total_attempts == 30
    assert len(ledger2.records()) == 30
    assert summary.deepseek_attempts == 15
    assert summary.qwen_attempts == 15


def test_cases_reject_image_and_pdf_paths():
    with pytest.raises(ValueError, match="pre-extracted text"):
        BenchmarkCase(
            case_id="bad-case",
            prompt_version="v1",
            extracted_text=("path/to/image.png",),
            bbox_evidence=(),
        )

    with pytest.raises(ValueError, match="pre-extracted text"):
        BenchmarkCase(
            case_id="bad-case-2",
            prompt_version="v1",
            extracted_text=("PLHUT_88_pages.pdf",),
            bbox_evidence=(),
        )
