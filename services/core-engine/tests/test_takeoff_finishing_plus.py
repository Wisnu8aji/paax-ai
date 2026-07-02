from __future__ import annotations

from app.takeoff.arsitektur import takeoff_arsitektur
from app.takeoff.dinding import takeoff_dinding
from app.takeoff.models import (
    Aanstamping,
    ArsitekturRequest,
    DindingRequest,
    KeramikDindingBasah,
    Pemadatan,
    PlafonBidang,
    PraktisPanel,
    SponninganLine,
    TanahRequest,
    WaterproofingBidang,
)
from app.takeoff.params import ArsitekturParams, DindingParams, TanahParams
from app.takeoff.tanah import takeoff_tanah


def _item(result, kode, work):
    matches = [i for i in result.items if i.kode == kode and i.work == work]
    assert len(matches) == 1
    return matches[0]


def test_ff06_pemadatan_area_volume_dan_kelas_jarak():
    """Manual: area 120 -> 120 m2; volume 18 -> 18 m3; 7 km -> kelas sedang."""
    result = takeoff_tanah(
        TanahRequest(
            pemadatan=[
                Pemadatan(kode="P1", quantity_basis="area", area_m2=120, jarak_angkut_km=7),
                Pemadatan(kode="P2", quantity_basis="volume", volume_padat_m3=18),
            ],
            params=TanahParams(jarak_sedang_max_km=15),
        )
    )

    p1 = _item(result, "P1", "pemadatan")
    p2 = _item(result, "P2", "pemadatan")
    assert p1.quantity == 120
    assert p1.unit == "m2"
    assert "kelas jarak=sedang" in p1.detail
    assert p2.quantity == 18
    assert p2.unit == "m3 (padat)"


def test_fe04_sponningan_dan_fe06_praktis_review():
    """Manual: sponningan 6 m x 2 = 12 m; panel 7x3 melewati L4/A12 -> review."""
    result = takeoff_dinding(
        DindingRequest(
            sponningan=[SponninganLine(kode="SP1", panjang_m=6, jumlah=2)],
            praktis=[PraktisPanel(kode="PN1", panjang_segmen_m=7, tinggi_m=3)],
            params=DindingParams(L_maks_praktis=4, A_maks_praktis=12),
        )
    )

    sp = _item(result, "SP1", "sponningan_tali_air")
    praktis = _item(result, "PN1", "kolom_ring_praktis_review")
    assert sp.quantity == 12
    assert praktis.needs_review is True
    assert praktis.rule_id == "F-E06"


def test_g02_g04_g09_g10_arsitektur_plus():
    """Manual: aanstamping .6*.15*20=1.8; keramik 14*1.5-1.2=19.8;
    plafon/list=35/24; WP=20+18*.2=23.6."""
    result = takeoff_arsitektur(
        ArsitekturRequest(
            aanstamping=[Aanstamping(kode="AAN1", a_bawah_m=0.6, t_aanstamping_m=0.15, panjang_m=20)],
            keramik_dinding=[
                KeramikDindingBasah(kode="KD1", keliling_basah_m=14, h_pasang_m=1.5, bukaan_m2=1.2)
            ],
            plafon=[PlafonBidang(kode="PL1", a_neto_m2=35, keliling_tepi_m=24)],
            waterproofing=[WaterproofingBidang(kode="WP1", a_bidang_m2=20, keliling_upstand_m=18)],
            params=ArsitekturParams(h_upstand=0.2),
        )
    )

    assert _item(result, "AAN1", "aanstamping").quantity == 1.8
    assert _item(result, "KD1", "keramik_dinding_basah").quantity == 19.8
    assert _item(result, "PL1", "plafon").quantity == 35
    assert _item(result, "PL1", "list_plafon").quantity == 24
    assert _item(result, "WP1", "waterproofing").quantity == 23.6
    assert any("h_upstand" in a for a in result.assumptions)


def test_keramik_dinding_default_h_pasang_dicatat_assumption():
    result = takeoff_arsitektur(
        ArsitekturRequest(
            keramik_dinding=[KeramikDindingBasah(kode="KD2", keliling_basah_m=10)],
            params=ArsitekturParams(h_pasang_keramik=1.2),
        )
    )

    assert _item(result, "KD2", "keramik_dinding_basah").quantity == 12
    assert any("h_pasang_keramik" in a for a in result.assumptions)
