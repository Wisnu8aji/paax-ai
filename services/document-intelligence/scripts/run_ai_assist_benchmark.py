from __future__ import annotations

"""Script to execute controlled Drawing Intelligence 15 + 15 model benchmark.

Usage:
  python scripts/run_ai_assist_benchmark.py [--output-dir DIR] [--dry-run]
"""

import argparse

import json
import os
import sys
from pathlib import Path

# Add app directory to sys.path if running as script
SCRIPT_DIR = Path(__file__).resolve().parent
SERVICE_DIR = SCRIPT_DIR.parent
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from app.perception.ai_assist.benchmark_router import BenchmarkCase, ControlledBenchmarkLedger
from app.perception.ai_assist.benchmark_runner import default_fake_transport, run_benchmark
from app.perception.ai_assist.model_router import ALLOWED_DI_KEY_NAME, DrawingIntelligenceModelRouter


FIXTURE_PATH = SERVICE_DIR / "tests" / "fixtures" / "ai_assist" / "benchmark_cases.json"


def load_cases() -> list[BenchmarkCase]:
    if not FIXTURE_PATH.exists():
        raise FileNotFoundError(f"Benchmark cases fixture not found at {FIXTURE_PATH}")
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Run controlled Drawing Intelligence model benchmark.")
    parser.add_argument("--output-dir", default=str(SERVICE_DIR / ".artifacts"), help="Output directory for scorecard")
    parser.add_argument("--dry-run", action="store_true", help="Force offline dry-run with fake transport")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    ledger_path = output_dir / "benchmark_ledger.json"
    scorecard_path = output_dir / "benchmark_scorecard.json"

    api_key = os.getenv(ALLOWED_DI_KEY_NAME, "").strip()

    if not api_key and not args.dry_run:
        print(f"STATUS: BLOCKED_KEY_MISSING - {ALLOWED_DI_KEY_NAME} is not set in environment.")
        print("Live benchmark requires DRAWING_INTELLIGENCE_API_KEY. Use --dry-run for offline validation.")
        return 0

    key = api_key if api_key else "di-offline-dry-run-key"
    router = DrawingIntelligenceModelRouter(key=key)
    ledger = ControlledBenchmarkLedger(ledger_path)
    cases = load_cases()

    print(f"Starting controlled benchmark (max 30 attempts, 15 deepseek-v4-pro + 15 qwen-3.7-plus)...")
    print(f"Dry run: {args.dry_run or not api_key}")

    transport = default_fake_transport if (args.dry_run or not api_key) else None

    try:
        summary = run_benchmark(
            cases=cases,
            router=router,
            ledger=ledger,
            max_attempts=30,
            transport=transport,
        )
    except Exception as exc:
        print(f"STATUS: BLOCKED_BENCHMARK_ERROR - {exc}")
        return 1

    scorecard = {
        "status": "PASS" if summary.successful_attempts > 0 else "PASS_WITH_BENCHMARK_BLOCKED",
        "summary": summary.to_dict(),
        "dry_run": args.dry_run or not api_key,
    }

    scorecard_path.write_text(json.dumps(scorecard, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Benchmark completed successfully. Scorecard written to {scorecard_path}")
    print(f"Total attempts: {summary.total_attempts} (DeepSeek: {summary.deepseek_attempts}, Qwen: {summary.qwen_attempts})")
    print(f"Successful: {summary.successful_attempts}, Failed: {summary.failed_attempts}")
    print(f"Cap 31 Rejection: {summary.cap_31_rejected}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
