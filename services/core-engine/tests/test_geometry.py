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
