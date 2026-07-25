"""
Tes kalkulator volume/luas (deterministik). Anchor dihitung manual.
AI menyetor dimensi; engine yang menghitung — ini menguji bagian "engine menghitung".
"""
import pytest
from app.geometry.volume import compute_volume, ELEMENT_TYPES


def test_kolom_volume():
    r = compute_volume("kolom", {"lebar": 0.3, "tebal": 0.4, "tinggi": 3.5, "jumlah": 5})
    assert r.unit == "m3"
    assert r.volume == 2.1  # 0.3*0.4*3.5*5


def test_balok_volume():
    r = compute_volume("balok", {"lebar": 0.25, "tinggi": 0.4, "panjang": 4, "jumlah": 3})
    assert r.volume == 1.2  # 0.25*0.4*4*3


def test_plat_default_jumlah_1():
    r = compute_volume("plat", {"panjang": 4, "lebar": 3, "tebal": 0.12})
    assert r.volume == 1.44  # 4*3*0.12*1


def test_dinding_dikurangi_bukaan():
    r = compute_volume("dinding", {"panjang": 5, "tinggi": 3, "jumlah": 2, "bukaan": 1.8})
    assert r.unit == "m2"
    assert r.volume == 28.2  # 5*3*2 - 1.8


def test_plesteran_dua_sisi_default():
    r = compute_volume("plesteran", {"panjang": 5, "tinggi": 3})
    assert r.volume == 30.0  # 5*3*1*2 - 0


def test_lantai_luas():
    r = compute_volume("lantai", {"panjang": 4, "lebar": 3})
    assert r.unit == "m2" and r.volume == 12.0


def test_galian_volume():
    r = compute_volume("galian", {"panjang": 10, "lebar": 0.6, "kedalaman": 0.8})
    assert r.volume == 4.8


def test_detail_string_present():
    r = compute_volume("kolom", {"lebar": 0.3, "tebal": 0.4, "tinggi": 3.5, "jumlah": 5})
    assert "=" in r.detail and "m3" in r.detail
    assert r.inputs["lebar"] == 0.3


def test_unknown_element_raises():
    with pytest.raises(KeyError):
        compute_volume("pesawat", {"panjang": 1})


def test_missing_required_dim_raises():
    with pytest.raises(KeyError):
        compute_volume("kolom", {"lebar": 0.3, "tebal": 0.4})  # tinggi hilang


def test_element_types_registered():
    assert "kolom" in ELEMENT_TYPES and "dinding" in ELEMENT_TYPES and "plat" in ELEMENT_TYPES


# ─── F-B01-B11 (docs/specs/brain-v4.1/PAAX_BRAIN_02_RUMUS_LOGIKA_HITUNG.txt §B) ──
# Anchor dihitung manual & diverifikasi silang via python -c sebelum ditulis.

def test_kolom_dengan_tebal_balok_lk():
    # F-B01: Lk = tinggi - tebal_balok = 3.5 - 0.5 = 3.0
    r = compute_volume("kolom", {"lebar": 0.3, "tebal": 0.4, "tinggi": 3.5, "tebal_balok": 0.5, "jumlah": 2})
    assert r.volume == 0.72  # 0.3*0.4*3.0*2


def test_kolom_tanpa_tebal_balok_backward_compat():
    # tebal_balok tidak disetor -> default 0 -> perilaku identik versi lama
    r = compute_volume("kolom", {"lebar": 0.3, "tebal": 0.4, "tinggi": 3.5, "jumlah": 5})
    assert r.volume == 2.1


def test_plat_dengan_luas_bukaan():
    # F-B06: A_neto = 4*3 - 2 = 10 ; V = 10*0.12
    r = compute_volume("plat", {"panjang": 4, "lebar": 3, "tebal": 0.12, "luas_bukaan": 2})
    assert r.volume == 1.2


def test_plat_tanpa_luas_bukaan_backward_compat():
    r = compute_volume("plat", {"panjang": 4, "lebar": 3, "tebal": 0.12})
    assert r.volume == 1.44


def test_kolom_bundar_volume():
    # F-B02: (pi/4)*0.4^2*(3.5-0.4)*4
    r = compute_volume("kolom_bundar", {"diameter": 0.4, "tinggi": 3.5, "tebal_balok": 0.4, "jumlah": 4})
    assert r.unit == "m3"
    assert r.volume == 1.5582


def test_kolom_praktis_volume():
    # F-B03: 0.13*0.13*3*10
    r = compute_volume("kolom_praktis", {"lebar": 0.13, "tebal": 0.13, "panjang": 3.0, "jumlah": 10})
    assert r.volume == 0.507


def test_pondasi_telapak_miring_frustum():
    # F-B07 (frustum): A_bwh=1.6*1.6=2.56 ; A_atas=0.4*0.4=0.16
    # V = (0.3/3)*(2.56+0.16+sqrt(2.56*0.16))*2 = 0.1*3.36*2 = 0.672
    r = compute_volume("pondasi_telapak_miring", {
        "panjang_bawah": 1.6, "lebar_bawah": 1.6,
        "panjang_atas": 0.4, "lebar_atas": 0.4,
        "tinggi": 0.3, "jumlah": 2,
    })
    assert r.volume == 0.672


def test_dinding_beton_dikurangi_volume_bukaan():
    # F-B08: 0.15*3*5*1 - 0.5 = 1.75
    r = compute_volume("dinding_beton", {
        "tebal": 0.15, "tinggi": 3.0, "panjang": 5.0, "jumlah": 1, "volume_bukaan": 0.5,
    })
    assert r.volume == 1.75


def test_tangga_detail_volume():
    # F-B11: optrede/antrede = 0.15/0.20 = 0.75 (segitiga 3-4-5) -> cos(alpha) = 0.8
    # V_pelat_miring = 0.12*1.0*(2.4/0.8) = 0.36
    # V_anak = 0.5*0.15*0.20*1.0*10 = 0.15
    # V_bordes = 0.12*1.0 = 0.12 ; total = 0.63
    r = compute_volume("tangga_detail", {
        "tebal_pelat": 0.12, "lebar": 1.0, "panjang_datar": 2.4,
        "optrede": 0.15, "antrede": 0.20, "jumlah_anak": 10,
        "tebal_bordes": 0.12, "luas_bordes": 1.0,
    })
    assert r.volume == 0.63


def test_new_element_types_registered():
    for t in ("kolom_bundar", "kolom_praktis", "pondasi_telapak_miring", "dinding_beton", "tangga_detail"):
        assert t in ELEMENT_TYPES
