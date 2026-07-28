from __future__ import annotations

"""Offline-safe controlled benchmark allocation for Feedback 1.

The router defines and validates the exact 15 + 15 attempt ledger. Provider
transport is injected by the dedicated live script only after offline and
browser gates pass. Importing this module never opens a socket.
"""

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any, Callable, Literal

ProviderName = Literal["deepseek-v4-pro", "qwen-3.7-plus"]
MAX_ATTEMPTS = 30
PROVIDER_ALLOCATION: tuple[ProviderName, ...] = (
    *("deepseek-v4-pro" for _ in range(15)),
    *("qwen-3.7-plus" for _ in range(15)),
)


@dataclass(frozen=True)
class BenchmarkCase:
    case_id: str
    prompt_version: str
    extracted_text: tuple[str, ...]
    bbox_evidence: tuple[dict[str, Any], ...]

    def __post_init__(self) -> None:
        serialized = json.dumps(asdict(self), ensure_ascii=False).lower()
        forbidden = (".pdf", ".png", ".jpg", "file://", "g:\\", "/mnt/", "image_path", "pdf_path")
        if any(token in serialized for token in forbidden):
            raise ValueError("benchmark cases may contain only pre-extracted text and bbox evidence")


@dataclass(frozen=True)
class BenchmarkRecord:
    attempt: int
    model: ProviderName
    case_id: str
    prompt_version: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: int
    proposal: dict[str, Any] | None
    validation: dict[str, Any]
    outcome: str
    exception: str | None = None
    recorded_at: str = ""


class ControlledBenchmarkLedger:
    def __init__(self, path: str | Path):
        self.path = Path(path)

    def records(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        return json.loads(self.path.read_text(encoding="utf-8"))

    def next_provider(self) -> ProviderName:
        count = len(self.records())
        if count >= MAX_ATTEMPTS:
            raise RuntimeError("attempt 31 is forbidden by the Feedback 1 benchmark cap")
        return PROVIDER_ALLOCATION[count]

    def append(self, record: BenchmarkRecord) -> None:
        rows = self.records()
        expected_attempt = len(rows) + 1
        if expected_attempt > MAX_ATTEMPTS:
            raise RuntimeError("attempt 31 is forbidden by the Feedback 1 benchmark cap")
        expected_provider = PROVIDER_ALLOCATION[expected_attempt - 1]
        if record.attempt != expected_attempt or record.model != expected_provider:
            raise ValueError("record does not match the locked 15 + 15 allocation")
        normalized = asdict(record)
        normalized["recorded_at"] = record.recorded_at or datetime.now(timezone.utc).isoformat()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps([*rows, normalized], ensure_ascii=False, indent=2), encoding="utf-8")


def drawing_intelligence_api_key_from_env() -> str:
    value = os.getenv("DRAWING_INTELLIGENCE_API_KEY", "").strip()
    if not value:
        raise RuntimeError("DRAWING_INTELLIGENCE_API_KEY is required")
    return value


def run_one_controlled_attempt(
    *,
    case: BenchmarkCase,
    ledger: ControlledBenchmarkLedger,
    transport: Callable[[ProviderName, BenchmarkCase, str], dict[str, Any]],
) -> BenchmarkRecord:
    """Execute one injected live attempt; the caller owns explicit authorization."""

    provider = ledger.next_provider()
    attempt = len(ledger.records()) + 1
    key = drawing_intelligence_api_key_from_env()
    try:
        payload = transport(provider, case, key)
        record = BenchmarkRecord(
            attempt=attempt,
            model=provider,
            case_id=case.case_id,
            prompt_version=case.prompt_version,
            input_tokens=int(payload.get("input_tokens", 0)),
            output_tokens=int(payload.get("output_tokens", 0)),
            cost_usd=float(payload.get("cost_usd", 0.0)),
            latency_ms=int(payload.get("latency_ms", 0)),
            proposal=payload.get("proposal"),
            validation=dict(payload.get("validation") or {}),
            outcome=str(payload.get("outcome") or "needs_review"),
        )
    except Exception as exc:  # provider failure still consumes an attempt
        record = BenchmarkRecord(
            attempt=attempt,
            model=provider,
            case_id=case.case_id,
            prompt_version=case.prompt_version,
            input_tokens=0,
            output_tokens=0,
            cost_usd=0.0,
            latency_ms=0,
            proposal=None,
            validation={"valid": False},
            outcome="provider_error",
            exception=f"{type(exc).__name__}: {exc}",
        )
    ledger.append(record)
    return record
