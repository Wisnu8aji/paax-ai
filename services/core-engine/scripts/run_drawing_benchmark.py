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
    return {"version": manifest["version"], "offline": True, "passed": all(item["passed"] for item in results), "results": results}

if __name__ == "__main__":
    result = run(); print(json.dumps(result, indent=2)); raise SystemExit(0 if result["passed"] else 1)
