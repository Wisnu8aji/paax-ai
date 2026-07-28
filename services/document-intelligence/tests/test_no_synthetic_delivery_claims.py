from pathlib import Path
import importlib.util


def test_no_production_drawing_intelligence_dummy_claims():
    script = Path(__file__).resolve().parents[3] / "scripts/quality/check_no_production_di_dummy.py"
    spec = importlib.util.spec_from_file_location("di_dummy_gate", script)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    assert module.scan() == []
