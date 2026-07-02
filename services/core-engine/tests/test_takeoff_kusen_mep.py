from __future__ import annotations

from app.takeoff.kusen import takeoff_kusen
from app.takeoff.mep import takeoff_mep
from app.takeoff.models import (
    AccessoryInput,
    KusenRequest,
    KusenScheduleItem,
    MepFixtureFallback,
    MepPoint,
    MepRequest,
    PipeRoute,
    RailingLine,
)
from app.takeoff.params import MepParams


def _item(result, kode, work):
    matches = [i for i in result.items if i.kode == kode and i.work == work]
    assert len(matches) == 1
    return matches[0]


def test_kusen_perimeter_daun_kaca_dan_aksesoris_anchor():
    """Manual: perimeter 2*(.9+2.1)*3=18 m; area .9*2.1*3=5.67 m2; engsel 2*3=6."""
    result = takeoff_kusen(
        KusenRequest(
            items=[
                KusenScheduleItem(
                    kode="K1",
                    tipe="pintu",
                    width_m=0.9,
                    height_m=2.1,
                    qty=3,
                    accessories=[AccessoryInput(nama="engsel", per_unit=2)],
                    hitung_daun_area=True,
                    hitung_kaca_area=True,
                )
            ]
        )
    )

    assert _item(result, "K1", "kusen").quantity == 18
    assert _item(result, "K1", "daun").quantity == 5.67
    assert _item(result, "K1", "kaca").quantity == 5.67
    assert _item(result, "K1:engsel", "aksesoris").quantity == 6


def test_kusen_count_conflict_jadi_review():
    result = takeoff_kusen(KusenRequest(items=[KusenScheduleItem(kode="K2", tipe="jendela", width_m=1, height_m=1, qty=3, qty_counted=4)]))

    item = _item(result, "K2", "count_triangulasi")
    assert item.needs_review is True
    assert "W-CNT" in item.review_reason


def test_railing_mep_points_pipe_route_dan_fallback_anchor():
    """Manual: railing 5+7.5=12.5 m; fallback pipa 4*5=20 m."""
    result = takeoff_mep(
        MepRequest(
            railing=[RailingLine(kode="RL1", length_m=5), RailingLine(kode="RL2", length_m=7.5)],
            points=[MepPoint(kode="LMP", jenis="lampu", count=12), MepPoint(kode="SK", jenis="stopkontak", count=8)],
            pipe_routes=[PipeRoute(kode="P1", length_m=11.5)],
            fixture_fallbacks=[MepFixtureFallback(kode="PF1", fixture_count=4)],
            params=MepParams(L_pipa_per_fixture=5),
        )
    )

    assert _item(result, "RL1", "railing").quantity == 5
    assert _item(result, "RL2", "railing").quantity == 7.5
    assert _item(result, "LMP", "titik_lampu").quantity == 12
    assert _item(result, "SK", "titik_stopkontak").quantity == 8
    assert _item(result, "P1", "pipa_mep").quantity == 11.5
    assert _item(result, "PF1", "pipa_mep_fallback").quantity == 20
    assert any("L_pipa_per_fixture" in a for a in result.assumptions)


def test_pipa_fallback_tanpa_param_jadi_review():
    result = takeoff_mep(
        MepRequest(fixture_fallbacks=[MepFixtureFallback(kode="PF2", fixture_count=3)], params=MepParams(L_pipa_per_fixture=None))
    )

    item = _item(result, "PF2", "pipa_mep_fallback")
    assert item.needs_review is True
    assert item.quantity is None
