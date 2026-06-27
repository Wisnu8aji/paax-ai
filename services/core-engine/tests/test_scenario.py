"""
Tes simulasi skenario (deterministik). Anchor dihitung manual dari data contoh.

AHSP.CK.001 (dinding bata), upah: 0.30+0.10+0.01+0.015 = 0.425 OH/m2
AHSP.CK.002 (plesteran), upah: 0.30+0.15+0.015+0.015 = 0.48 OH/m2

Untuk volume 50 & workers 5:
  item1: mandays = 50*0.425 = 21.25 ; durasi = 21.25/5 = 4.25 hari
  item2: mandays = 50*0.48  = 24.0  ; durasi = 24.0/5  = 4.80 hari
  baseline sequential = 4.25 + 4.80 = 9.05 hari ; parallel = max = 4.80 hari
  crew x2  -> 2.125 + 2.40 = 4.525 hari
  lembur x1.25 -> 3.40 + 3.84 = 7.24 hari

Biaya (dari engine RAB):
  subtotal = 11.411.620 ; total = 12.666.898,2
  biaya tenaga = 1.1 * 50 * (50400 + 57900) = 5.956.500
  subtotal lembur = 11.411.620 - 5.956.500 + 5.956.500*1.4 = 13.794.220
  total lembur = 13.794.220 * 1.11 = 15.311.584,2
"""
from pathlib import Path
import pytest

from app.rab.loader import load_data
from app.scenario.models import ScenarioConfig, ScenarioLineInput
from app.scenario.simulate import compute_scenarios, labor_oh_per_unit

REPO_ROOT = Path(__file__).resolve().parents[3]
STORE = load_data(REPO_ROOT / "data")
BOOK = STORE.price_book("jateng")


def _cfg(**kw):
    base = dict(
        region_code="jateng", ppn_rate=0.11, base_mode="sequential",
        crew_factor=2.0, overtime_speedup=1.25, overtime_cost_factor=1.4,
        lines=[
            ScenarioLineInput(ahsp_code="AHSP.CK.001", volume=50, workers=5),
            ScenarioLineInput(ahsp_code="AHSP.CK.002", volume=50, workers=5),
        ],
    )
    base.update(kw)
    return ScenarioConfig(**base)


def _run():
    return compute_scenarios(_cfg(), STORE.ahsp, BOOK, region="Jawa Tengah")


def test_labor_oh_per_unit():
    assert labor_oh_per_unit(STORE.ahsp["AHSP.CK.001"]) == pytest.approx(0.425)
    assert labor_oh_per_unit(STORE.ahsp["AHSP.CK.002"]) == pytest.approx(0.48)


def test_item_schedule_mandays_and_duration():
    res = _run()
    i1, i2 = res.items
    assert i1.mandays == 21.25 and i1.duration_days == 4.25
    assert i2.mandays == 24.0 and i2.duration_days == 4.8


def test_baseline_days_and_cost():
    res = _run()
    assert res.baseline_total_days == 9.05
    assert res.baseline_total_cost == 12666898.2
    assert res.baseline_labor_cost == 5956500.0


def _cand(res, key):
    return next(c for c in res.candidates if c.key == key)


def test_crew_scenario_halves_duration_same_cost():
    res = _run()
    crew = _cand(res, "tambah_crew")
    assert crew.total_days == 4.53  # 4.525 dibulatkan 2 desimal
    assert crew.total_cost == res.baseline_total_cost
    assert crew.delta_cost == 0.0
    assert crew.delta_days < 0


def test_overtime_scenario_cost_and_days():
    res = _run()
    ot = _cand(res, "lembur")
    assert ot.total_days == 7.24
    assert ot.total_cost == 15311584.2
    assert ot.delta_days < 0 and ot.delta_cost > 0


def test_parallel_scenario_uses_max_duration():
    res = _run()
    par = _cand(res, "paralel")
    assert par.total_days == 4.8  # max(4.25, 4.8)
    assert par.total_cost == res.baseline_total_cost


def test_unknown_ahsp_raises():
    cfg = _cfg(lines=[ScenarioLineInput(ahsp_code="NOPE", volume=1, workers=1)])
    with pytest.raises(KeyError):
        compute_scenarios(cfg, STORE.ahsp, BOOK, region="Jawa Tengah")
