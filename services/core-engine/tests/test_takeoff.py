"""
Tes take-off arsitektur/tanah (brain §E/§F/§G). Semua anchor DIHITUNG MANUAL
di komentar, diverifikasi independen dari rumus mentah (bukan dari modul yang
diuji).

TANAH (params: w_kerja=0.3, f_gembur=1.2, f_susut=1.1, kap_truk=4.0):
  FP1 b=1,l=1,d=1.5,n=4,struktur=0.5/lubang:
    b_eff=l_eff=1.6; gali=1.6*1.6*1.5*4=15.36; uk=15.36-(0.5*4)=13.36;
    buang_bank=2.0; buang_gembur=2.0*1.2=2.4; ritase=ceil(2.4/4)=1
  GM1 l=20,b_bawah=0.6,b_atas=0.8,d=1.0: A=0.5*(0.8+0.6)*1=0.7; V=0.7*20=14.0
  UP1 pasir a=12,t=0.05: V_padat=0.6; material=0.6*1.1=0.66
  UP2 sirtu a=20,t=0.1,sudah_padat: V_padat=2.0; material=2.0 (tak dikali)

DINDING:
  D1 4x3, bukaan pintu0.9x2.1+jendela1.5x1.2+lubang0.6x0.6, plester2 sisi:
    a_kotor=12; bukaan(all)=1.89+1.8+0.36=4.05; pas=7.95; plester=2*7.95=15.9;
    acian=15.9; cat(1 lapis)=15.9
  D1-threshold(1.0): lubang0.36 tak dikurangi; bukaan=3.69; pas=8.31
  D3 5x3 tanpa plester, cat 3 lapis: pas=15.0; cat=15.0*3=45.0
  Screed a=20,t=0.03: V=0.6

ARSITEKTUR:
  PB1 a_atas=0.3,a_bawah=0.6,h=0.7,l=20: A_trap=0.5*0.9*0.7=0.315; V=6.3
  LT1 4x5, pintu 1.8: A=20; keliling=18; plin=18-1.8=16.2
  AT1 A_proy=100, theta=30: cos30=0.8660254; A_miring=100/0.8660254=115.4700538
"""
import pytest

from app.takeoff.arsitektur import takeoff_arsitektur
from app.takeoff.dinding import takeoff_dinding
from app.takeoff.models import (
    ArsitekturRequest, AtapMiring, Bukaan, DindingBidang, DindingRequest,
    GalianFootplat, GalianMenerus, PenutupLantai, PondasiBatu, ScreedBidang,
    TanahRequest, UruganLapis,
)
from app.takeoff.params import DindingParams, TanahParams
from app.takeoff.tanah import takeoff_tanah


def _one(result, work):
    xs = [i for i in result.items if i.work == work]
    assert len(xs) == 1, f"harap 1 item '{work}', dapat {len(xs)}"
    return xs[0]


# ─── §F Tanah ─────────────────────────────────────────────────────────────────

def _params_tanah():
    return TanahParams(w_kerja=0.3, f_gembur=1.2, f_susut=1.1, kap_truk=4.0)


def test_galian_footplat_dan_urugan_dan_buangan():
    req = TanahRequest(
        footplats=[GalianFootplat(kode="FP1", b_ft=1.0, l_ft=1.0, d_gali=1.5, n=4,
                                  v_struktur_tertanam_per_lubang=0.5)],
        params=_params_tanah(),
    )
    r = takeoff_tanah(req)
    assert _one(r, "galian_footplat").quantity == pytest.approx(15.36)
    assert _one(r, "urugan_kembali").quantity == pytest.approx(13.36)
    buang = _one(r, "buangan_tanah")
    assert buang.quantity == pytest.approx(2.4)          # gembur
    assert "ritase = ceil(2.4/4) = 1" in buang.detail
    # faktor tanah default terpakai wajib tercatat
    nama = {p.nama for p in r.params_used}
    assert {"w_kerja", "f_gembur", "kap_truk"} <= nama


def test_footplat_tanpa_struktur_jadi_review_bukan_tebakan():
    req = TanahRequest(
        footplats=[GalianFootplat(kode="FP2", b_ft=1.2, l_ft=1.2, d_gali=1.0, n=1)],
        params=_params_tanah(),
    )
    r = takeoff_tanah(req)
    assert _one(r, "galian_footplat").quantity == pytest.approx(3.24)
    uk = _one(r, "urugan_kembali")
    assert uk.needs_review is True and uk.quantity is None
    assert "v_struktur_tertanam" in uk.review_reason
    # buangan tidak diemit tanpa urugan kembali
    assert not [i for i in r.items if i.work == "buangan_tanah"]


def test_galian_menerus_trapesium():
    req = TanahRequest(
        galian_menerus=[GalianMenerus(kode="GM1", l_parit=20, b_bawah=0.6, b_atas=0.8, d_gali=1.0)],
        params=_params_tanah(),
    )
    r = takeoff_tanah(req)
    assert _one(r, "galian_menerus").quantity == pytest.approx(14.0)


def test_urugan_pasir_material_vs_sudah_padat_tidak_dobel():
    req = TanahRequest(
        urugan=[
            UruganLapis(kode="UP1", jenis="pasir", a=12, t_lapis=0.05),
            UruganLapis(kode="UP2", jenis="sirtu", a=20, t_lapis=0.1, material_sudah_padat=True),
        ],
        params=_params_tanah(),
    )
    r = takeoff_tanah(req)
    pasir = _one(r, "urugan_pasir")
    assert pasir.quantity == pytest.approx(0.6)          # V_padat
    assert "x f_susut(1.1) = 0.66" in pasir.detail       # kebutuhan material lepas
    sirtu = _one(r, "urugan_sirtu")
    assert sirtu.quantity == pytest.approx(2.0)
    assert "sudah termasuk padat" in sirtu.detail        # tidak dikali f_susut (AP anti-dobel)


# ─── §E Dinding & finishing ───────────────────────────────────────────────────

def _dinding_lengkap(**kw):
    return DindingBidang(
        kode="D1", l_dinding=4.0, h_dinding=3.0,
        bukaan=[
            Bukaan(nama="pintu", lebar=0.9, tinggi=2.1),
            Bukaan(nama="jendela", lebar=1.5, tinggi=1.2),
            Bukaan(nama="lubang", lebar=0.6, tinggi=0.6),
        ],
        plester_sisi=2, acian=True, cat=True, **kw,
    )


def test_pasangan_plester_acian_cat_mode_all():
    r = takeoff_dinding(DindingRequest(dinding=[_dinding_lengkap()]))
    assert _one(r, "pasangan_dinding").quantity == pytest.approx(7.95)
    assert _one(r, "plesteran").quantity == pytest.approx(15.9)
    assert _one(r, "acian").quantity == pytest.approx(15.9)
    assert _one(r, "pengecatan").quantity == pytest.approx(15.9)   # n_lapis=1 default


def test_deduksi_bukaan_mode_threshold():
    r = takeoff_dinding(DindingRequest(
        dinding=[_dinding_lengkap()],
        params=DindingParams(deduct_mode="threshold", deduct_threshold=1.0),
    ))
    # lubang 0.36 m2 < 1.0 -> tidak dikurangi
    assert _one(r, "pasangan_dinding").quantity == pytest.approx(8.31)
    assert any("threshold" in a for a in r.assumptions)


def test_cat_multi_lapis_tanpa_plester():
    d = DindingBidang(kode="D3", l_dinding=5.0, h_dinding=3.0, plester_sisi=0, cat=True)
    r = takeoff_dinding(DindingRequest(dinding=[d], params=DindingParams(n_lapis_cat=3)))
    assert _one(r, "pasangan_dinding").quantity == pytest.approx(15.0)
    assert _one(r, "pengecatan").quantity == pytest.approx(45.0)   # 15 * 3 lapis


def test_acian_tanpa_plester_jadi_review():
    d = DindingBidang(kode="D4", l_dinding=3.0, h_dinding=3.0, plester_sisi=0, acian=True)
    r = takeoff_dinding(DindingRequest(dinding=[d]))
    aci = _one(r, "acian")
    assert aci.needs_review is True and aci.quantity is None


def test_screed():
    r = takeoff_dinding(DindingRequest(screed=[ScreedBidang(kode="S1", a=20, t=0.03)]))
    assert _one(r, "screed_lantai").quantity == pytest.approx(0.6)


# ─── §G subset ────────────────────────────────────────────────────────────────

def test_pondasi_batu_belah_trapesium():
    r = takeoff_arsitektur(ArsitekturRequest(
        pondasi_batu=[PondasiBatu(kode="PB1", a_atas=0.3, a_bawah=0.6, h_pond=0.7, l=20)]))
    assert _one(r, "pondasi_batu_belah").quantity == pytest.approx(6.3)


def test_penutup_lantai_dan_plin():
    r = takeoff_arsitektur(ArsitekturRequest(
        lantai=[PenutupLantai(kode="LT1", panjang=4, lebar=5, lebar_pintu_total=1.8)]))
    assert _one(r, "penutup_lantai").quantity == pytest.approx(20.0)
    assert _one(r, "plin_lantai").quantity == pytest.approx(16.2)


def test_atap_miring():
    r = takeoff_arsitektur(ArsitekturRequest(
        atap=[AtapMiring(kode="AT1", a_proyeksi=100, theta_deg=30)]))
    assert _one(r, "atap_miring").quantity == pytest.approx(115.4700538, abs=0.001)


def test_atap_theta_invalid_jadi_review():
    r = takeoff_arsitektur(ArsitekturRequest(
        atap=[AtapMiring(kode="AT2", a_proyeksi=100, theta_deg=90)]))
    at = _one(r, "atap_miring")
    assert at.needs_review is True and at.quantity is None
