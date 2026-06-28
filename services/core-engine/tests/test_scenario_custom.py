from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.rab.loader import load_data
from app.scenario.models import ScenarioConfig, ScenarioLineInput, ScenarioParams
from app.scenario.simulate import compute_scenarios


client = TestClient(app, raise_server_exceptions=False)
REPO_ROOT = Path(__file__).resolve().parents[3]
STORE = load_data(REPO_ROOT / "data")
BOOK = STORE.price_book("jateng")


def _lines():
    return [
        ScenarioLineInput(ahsp_code="AHSP.CK.001", volume=50, workers=5),
        ScenarioLineInput(ahsp_code="AHSP.CK.002", volume=50, workers=5),
    ]


def _cfg(**kwargs):
    base = dict(
        region_code="jateng",
        ppn_rate=0.11,
        base_mode="sequential",
        lines=_lines(),
    )
    base.update(kwargs)
    return ScenarioConfig(**base)


def _run(cfg):
    return compute_scenarios(cfg, STORE.ahsp, BOOK, region="Jawa Tengah")


def test_custom_params_explicit_knobs_match_manual_anchor():
    res = _run(_cfg(params=ScenarioParams(
        crew_multiplier=2.0,
        shifts=2,
        efficiency=0.8,
        shift_premium_rate=0.3,
        target_days=None,
    )))

    custom = res.custom
    assert custom is not None
    assert custom.applied_crew_multiplier == 2.0
    assert custom.resolved_from_target is False
    assert custom.items[0].duration_days == pytest.approx(1.328125)
    assert custom.items[1].duration_days == 1.5
    assert custom.total_days == 2.83
    assert custom.labor_cost == 9679312.5
    assert custom.subtotal == 15134432.5
    assert custom.total_cost == 16799220.08
    assert custom.delta_days == -6.22
    assert custom.delta_cost == 4132321.88


def test_custom_params_target_resolves_required_crew():
    res = _run(_cfg(params=ScenarioParams(
        crew_multiplier=1.0,
        shifts=1,
        efficiency=1.0,
        shift_premium_rate=0.3,
        target_days=4.0,
    )))

    custom = res.custom
    assert custom is not None
    assert custom.applied_crew_multiplier == pytest.approx(2.2625)
    assert custom.resolved_from_target is True
    assert custom.total_days == 4.0
    assert custom.total_cost == 12666898.2
    assert custom.delta_days == -5.05
    assert custom.delta_cost == 0.0


def test_custom_is_none_without_params_and_legacy_candidates_unchanged():
    res = _run(_cfg())

    assert res.custom is None
    assert res.baseline_total_days == 9.05
    assert res.baseline_total_cost == 12666898.2
    keys = {candidate.key for candidate in res.candidates}
    assert {"baseline", "tambah_crew", "lembur", "paralel"} <= keys


def test_custom_parallel_mode_uses_max_duration_and_baseline_cost():
    res = _run(_cfg(
        base_mode="parallel",
        params=ScenarioParams(crew_multiplier=1, shifts=1, efficiency=1, target_days=None),
    ))

    custom = res.custom
    assert custom is not None
    assert custom.total_days == 4.8
    assert custom.total_cost == 12666898.2
    assert custom.delta_cost == 0.0


def test_custom_params_validation_rejects_invalid_knobs():
    with pytest.raises(ValidationError):
        ScenarioParams(crew_multiplier=0)
    with pytest.raises(ValidationError):
        ScenarioParams(shifts=0)
    with pytest.raises(ValidationError):
        ScenarioParams(efficiency=0)
    with pytest.raises(ValidationError):
        ScenarioParams(target_days=0)


def test_scenario_endpoint_returns_custom_anchor_one():
    response = client.post("/scenario/simulate", json={
        "region_code": "jateng",
        "ppn_rate": 0.11,
        "base_mode": "sequential",
        "lines": [
            {"ahsp_code": "AHSP.CK.001", "volume": 50, "workers": 5},
            {"ahsp_code": "AHSP.CK.002", "volume": 50, "workers": 5},
        ],
        "params": {
            "crew_multiplier": 2.0,
            "shifts": 2,
            "efficiency": 0.8,
            "shift_premium_rate": 0.3,
            "target_days": None,
        },
    })

    assert response.status_code == 200
    custom = response.json()["custom"]
    assert custom["total_days"] == 2.83
    assert custom["labor_cost"] == 9679312.5
    assert custom["total_cost"] == 16799220.08
