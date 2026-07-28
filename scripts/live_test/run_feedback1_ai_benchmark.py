from __future__ import annotations

"""Explicitly authorized 15 + 15 live benchmark runner.

This script is intentionally separate from normal tests. It reads only locked,
pre-extracted text and bbox evidence, uses one Drawing Intelligence API key,
and refuses to run until both offline and browser evidence files say "passed".
"""

import argparse
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
import sys
sys.path.insert(0, str(REPO_ROOT / "services" / "document-intelligence"))

from app.perception.ai_assist.benchmark_router import (  # noqa: E402
    BenchmarkCase,
    ControlledBenchmarkLedger,
    run_one_controlled_attempt,
)


def _passed_gate(path: Path, label: str) -> None:
    if not path.is_file():
        raise SystemExit(f"{label} evidence file not found: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("status") != "passed":
        raise SystemExit(f"{label} gate is not passed")


def _cases(path: Path) -> list[tuple[BenchmarkCase, set[str], set[str]]]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    result = []
    for row in rows:
        case = BenchmarkCase(
            case_id=row["case_id"],
            prompt_version=row["prompt_version"],
            extracted_text=tuple(row["extracted_text"]),
            bbox_evidence=tuple(row["bbox_evidence"]),
        )
        evidence = {str(item["evidence_ref"]) for item in row["bbox_evidence"]}
        result.append((case, set(row["allowed_categories"]), evidence))
    if not result:
        raise SystemExit("benchmark case set is empty")
    return result


def _transport(allowed: set[str], evidence: set[str]):
    endpoint = os.environ.get("DRAWING_INTELLIGENCE_BENCHMARK_URL", "").strip()
    deepseek_model = os.environ.get("DRAWING_INTELLIGENCE_DEEPSEEK_MODEL", "").strip()
    qwen_model = os.environ.get("DRAWING_INTELLIGENCE_QWEN_MODEL", "").strip()
    if not endpoint or not deepseek_model or not qwen_model:
        raise SystemExit("benchmark URL and both exact model identifiers are required")
    prices = {
        "deepseek-v4-pro": (
            float(os.environ.get("DRAWING_INTELLIGENCE_DEEPSEEK_INPUT_USD_PER_M", "0")),
            float(os.environ.get("DRAWING_INTELLIGENCE_DEEPSEEK_OUTPUT_USD_PER_M", "0")),
        ),
        "qwen-3.7-plus": (
            float(os.environ.get("DRAWING_INTELLIGENCE_QWEN_INPUT_USD_PER_M", "0")),
            float(os.environ.get("DRAWING_INTELLIGENCE_QWEN_OUTPUT_USD_PER_M", "0")),
        ),
    }

    def call(provider: str, case: BenchmarkCase, key: str) -> dict[str, Any]:
        model = deepseek_model if provider == "deepseek-v4-pro" else qwen_model
        prompt = {
            "task": "Propose one sheet classification for human review. Never calculate quantities.",
            "allowed_categories": sorted(allowed),
            "extracted_text": list(case.extracted_text),
            "bbox_evidence": list(case.bbox_evidence),
            "required_json": {"classification_key": "string", "evidence_refs": ["string"], "reason": "string"},
        }
        body = json.dumps({
            "model": model,
            "messages": [
                {"role": "system", "content": "Return JSON only. Cite only supplied evidence refs."},
                {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
            ],
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }).encode("utf-8")
        request = urllib.request.Request(
            endpoint,
            data=body,
            method="POST",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        )
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"provider HTTP {exc.code}") from exc
        latency_ms = int((time.perf_counter() - started) * 1000)
        content = payload["choices"][0]["message"]["content"]
        proposal = json.loads(content) if isinstance(content, str) else content
        cited = set(str(value) for value in proposal.get("evidence_refs", []))
        category = str(proposal.get("classification_key", ""))
        valid = category in allowed and cited and cited <= evidence
        usage = payload.get("usage") or {}
        input_tokens = int(usage.get("prompt_tokens", usage.get("input_tokens", 0)) or 0)
        output_tokens = int(usage.get("completion_tokens", usage.get("output_tokens", 0)) or 0)
        input_price, output_price = prices[provider]
        cost = input_tokens / 1_000_000 * input_price + output_tokens / 1_000_000 * output_price
        return {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost,
            "latency_ms": latency_ms,
            "proposal": proposal,
            "validation": {"valid": valid, "category_allowed": category in allowed, "evidence_valid": bool(cited and cited <= evidence)},
            "outcome": "needs_review" if valid else "invalid",
        }
    return call


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--authorized", action="store_true")
    parser.add_argument("--offline-evidence", type=Path, required=True)
    parser.add_argument("--browser-evidence", type=Path, required=True)
    parser.add_argument("--cases", type=Path, default=REPO_ROOT / "scripts/live_test/fixtures/feedback1_ai_benchmark_cases.json")
    parser.add_argument("--ledger", type=Path, default=REPO_ROOT / "report/report_drawing_intelligence/FEEDBACK1_AI_BENCHMARK_2026-07-27.json")
    args = parser.parse_args()
    if not args.authorized:
        raise SystemExit("live provider use requires explicit --authorized")
    _passed_gate(args.offline_evidence, "offline")
    _passed_gate(args.browser_evidence, "browser")
    cases = _cases(args.cases)
    ledger = ControlledBenchmarkLedger(args.ledger)
    if ledger.records():
        raise SystemExit("ledger already contains attempts; archive it before a new controlled run")
    for index in range(30):
        case, allowed, evidence = cases[index % len(cases)]
        record = run_one_controlled_attempt(case=case, ledger=ledger, transport=_transport(allowed, evidence))
        print(f"attempt={record.attempt} model={record.model} case={record.case_id} outcome={record.outcome}")
    if len(ledger.records()) != 30:
        raise SystemExit("controlled benchmark did not produce exactly 30 attempts")


if __name__ == "__main__":
    main()
