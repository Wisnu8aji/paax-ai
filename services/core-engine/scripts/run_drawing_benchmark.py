"""Offline deterministic F19 benchmark gate; it never invokes an AI provider."""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "tests" / "fixtures" / "benchmarks" / "drawing-benchmark-manifest.json"

def run(manifest_path: Path = MANIFEST) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    required = manifest["required_metrics"]
    values = manifest["fixture_metrics"]
    results = []
    for metric in required:
        value = values.get(metric["id"])
        available = isinstance(value, (int, float))
        passed = available and value >= metric["minimum"]
        results.append({"id": metric["id"], "value": value if available else None, "minimum": metric["minimum"], "available": available, "passed": passed})
    required_tags = set(manifest.get("synthetic_diversity_contract", []))
    suites = manifest.get("diversity_suites", [])
    covered = {tag for suite in suites for tag in suite.get("tags", [])}
    suite_results = [{"id": suite.get("id"), "passed": bool(suite.get("id")) and all(suite.get("expected", {}).values())} for suite in suites]
    diversity_passed = required_tags <= covered and len(suites) >= 2 and all(item["passed"] for item in suite_results)
    return {"version": manifest["version"], "offline": True, "passed": all(item["passed"] for item in results) and diversity_passed, "results": results, "diversity": {"passed": diversity_passed, "suites": suite_results}}

if __name__ == "__main__":
    result = run(); print(json.dumps(result, indent=2)); raise SystemExit(0 if result["passed"] else 1)
