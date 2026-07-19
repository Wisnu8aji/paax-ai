from pathlib import Path
import importlib.util
import json

spec = importlib.util.spec_from_file_location("benchmark", Path(__file__).parents[1] / "scripts" / "run_drawing_benchmark.py")
benchmark = importlib.util.module_from_spec(spec); assert spec.loader; spec.loader.exec_module(benchmark)

def test_offline_benchmark_requires_every_metric_and_passes_local_fixture(tmp_path):
    result = benchmark.run()
    assert result["offline"] and result["passed"]
    payload = json.loads(benchmark.MANIFEST.read_text())
    payload["fixture_metrics"].pop("retrieval.intent_accuracy")
    missing = tmp_path / "missing.json"; missing.write_text(json.dumps(payload))
    assert not benchmark.run(missing)["passed"]
