from __future__ import annotations

"""Benchmark runner for controlled 30-attempt model benchmark."""

from dataclasses import asdict, dataclass
import json
from pathlib import Path
from typing import Any, Callable

from .benchmark_router import (
    MAX_ATTEMPTS,
    BenchmarkCase,
    BenchmarkRecord,
    ControlledBenchmarkLedger,
    ProviderName,
)
from .model_router import DrawingIntelligenceModelRouter


@dataclass(frozen=True)
class BenchmarkSummary:
    total_attempts: int
    deepseek_attempts: int
    qwen_attempts: int
    successful_attempts: int
    failed_attempts: int
    total_input_tokens: int
    total_output_tokens: int
    total_cost_usd: float
    total_latency_ms: int
    cap_31_rejected: bool
    records: tuple[dict[str, Any], ...]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def default_fake_transport(
    provider: ProviderName, case: BenchmarkCase, api_key: str
) -> dict[str, Any]:
    """Default fake transport for offline test environments."""
    return {
        "input_tokens": 150,
        "output_tokens": 45,
        "cost_usd": 0.0005,
        "latency_ms": 320,
        "proposal": {"classification_key": "plan", "evidence_refs": list(ref["evidence_ref"] for ref in case.bbox_evidence)},
        "validation": {"valid": True, "reason": "offline test valid proposal"},
        "outcome": "needs_review",
    }


def run_benchmark(
    *,
    cases: list[BenchmarkCase],
    router: DrawingIntelligenceModelRouter,
    ledger: ControlledBenchmarkLedger,
    max_attempts: int = MAX_ATTEMPTS,
    transport: Callable[[ProviderName, BenchmarkCase, str], dict[str, Any]] | None = None,
) -> BenchmarkSummary:
    """Run controlled benchmark up to max_attempts (max 30). Idempotent resume."""

    if not cases:
        raise ValueError("cases list cannot be empty")

    transport_fn = transport or default_fake_transport
    api_key = router.get_api_key()

    existing_records = ledger.records()
    completed_count = len(existing_records)

    if completed_count >= max_attempts:
        cap_31_rejected = True
    else:
        cap_31_rejected = False

    case_index = completed_count % len(cases)

    while len(ledger.records()) < max_attempts:
        current_attempt = len(ledger.records()) + 1
        if current_attempt > MAX_ATTEMPTS:
            cap_31_rejected = True
            break

        current_case = cases[case_index % len(cases)]
        router.validate_case(current_case)

        provider = router.get_allocation_for_attempt(current_attempt)

        try:
            payload = transport_fn(provider, current_case, api_key)
            record = BenchmarkRecord(
                attempt=current_attempt,
                model=provider,
                case_id=current_case.case_id,
                prompt_version=current_case.prompt_version,
                input_tokens=int(payload.get("input_tokens", 0)),
                output_tokens=int(payload.get("output_tokens", 0)),
                cost_usd=float(payload.get("cost_usd", 0.0)),
                latency_ms=int(payload.get("latency_ms", 0)),
                proposal=payload.get("proposal"),
                validation=dict(payload.get("validation") or {}),
                outcome=str(payload.get("outcome") or "needs_review"),
            )
        except Exception as exc:
            # Redact secrets from error message if any
            exc_msg = str(exc)
            if api_key in exc_msg:
                exc_msg = exc_msg.replace(api_key, "[REDACTED_API_KEY]")
            record = BenchmarkRecord(
                attempt=current_attempt,
                model=provider,
                case_id=current_case.case_id,
                prompt_version=current_case.prompt_version,
                input_tokens=0,
                output_tokens=0,
                cost_usd=0.0,
                latency_ms=0,
                proposal=None,
                validation={"valid": False},
                outcome="provider_error",
                exception=f"{type(exc).__name__}: {exc_msg}",
            )

        ledger.append(record)
        case_index += 1

    all_records = ledger.records()
    deepseek_count = sum(1 for r in all_records if r.get("model") == "deepseek-v4-pro")
    qwen_count = sum(1 for r in all_records if r.get("model") == "qwen-3.7-plus")
    success_count = sum(1 for r in all_records if r.get("outcome") != "provider_error")
    fail_count = sum(1 for r in all_records if r.get("outcome") == "provider_error")

    total_in_tokens = sum(int(r.get("input_tokens", 0)) for r in all_records)
    total_out_tokens = sum(int(r.get("output_tokens", 0)) for r in all_records)
    total_cost = sum(float(r.get("cost_usd", 0.0)) for r in all_records)
    total_lat = sum(int(r.get("latency_ms", 0)) for r in all_records)

    return BenchmarkSummary(
        total_attempts=len(all_records),
        deepseek_attempts=deepseek_count,
        qwen_attempts=qwen_count,
        successful_attempts=success_count,
        failed_attempts=fail_count,
        total_input_tokens=total_in_tokens,
        total_output_tokens=total_out_tokens,
        total_cost_usd=total_cost,
        total_latency_ms=total_lat,
        cap_31_rejected=cap_31_rejected or len(all_records) >= MAX_ATTEMPTS,
        records=tuple(all_records),
    )
