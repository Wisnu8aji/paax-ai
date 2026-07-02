"""
Golden anchor TKG PLHUT — dibangun dari GAMBAR KERJA ASLI (bukan sintetis).

Sumber transkrip (GAMBAR KERJA PLHUT SURAKARTA.pdf, ekstraksi teks PyMuPDF):
  Hal 1  DENAH FOOTPLAT : grid X A..F bentang 5 x 4000 = 20000 ;
         grid Y 1..4 bentang 5000+3000+2000 = 10000 ;
         count simbol: PC1 x12, PC2 x6, PC3 x3.
  Hal 4  DENAH KOLOM LANTAI 1 : K1 x4, K1A x8, K2 x4, K3 x5.
  Hal 11 DETAIL PONDASI : PC1 1500x1500, PC2 1900x1600, PC3 1200 ;
         TEBAL tidak terasosiasi pasti pada teks -> TIDAK ditranskrip
         (no-guess) -> takeoff telapak WAJIB needs_review.
  Hal 12 TABEL KOLOM : K1 400x400 (12D16), K1A 400x400 (10D16),
         K2 250x600 (12D16), K3 250x400 (8D16), sengkang D10-300.
         (Catatan ambiguitas: teks memuat "10 D16" DAN "12 D16" utk K1 —
          keputusan transkrip: K1=12D16 [baris eksplisit], K1A=10D16;
          direkam di notes agar bisa direview, bukan diputus diam-diam.)

Anchor dihitung MANUAL:
  Beton K1A LT1 : 8 x 0.4 x 0.4 x 4.0 (tinggi = PARAM eksplisit) = 5.12 m3
  Besi  K1A     : pokok 10 x 4.0 x w16 ; sengkang D10-300:
                  n = floor(4.0/0.3)+1 = 14 ;
                  L1 = 2x((0.4-0.08)+(0.4-0.08)) + 2x6x0.010 = 1.40 m ;
                  total per kolom x8 (expected dihitung dari rumus mentah
                  di test — verifikasi independen dari modul).
"""
import math

import pytest

from app.tkg.models import (
    ElementInstance, Grid, GridAxis, GridSpan, GridTotal, RebarSpec, SheetMeta,
    TkgDocument, TkgSheet, TkgTable, TypeRecord,
)
from app.tkg.params import TakeoffParams
from app.tkg.takeoff import takeoff_tkg
from app.tkg.validate import validate_tkg


def buat_tkg_plhut() -> TkgDocument:
    grid = Grid(
        sumbu_x=[GridAxis(label=c) for c in "ABCDEF"],
        sumbu_y=[GridAxis(label=str(i)) for i in (1, 2, 3, 4)],
        bentang_x=[GridSpan(dari=a, ke=b, nilai=4000, unit="mm")
                   for a, b in zip("ABCDE", "BCDEF")],
        bentang_y=[
            GridSpan(dari="1", ke="2", nilai=5000, unit="mm"),
            GridSpan(dari="2", ke="3", nilai=3000, unit="mm"),
            GridSpan(dari="3", ke="4", nilai=2000, unit="mm"),
        ],
        total_x=GridTotal(dari="A", ke="F", nilai=20000, unit="mm"),
        total_y=GridTotal(dari="1", ke="4", nilai=10000, unit="mm"),
    )
    denah_footplat = TkgSheet(
        sheet_id="S01", jenis="denah",
        meta=SheetMeta(judul="DENAH FOOTPLAT", skala="1:100"),
        grid=grid,
        elements=[
            ElementInstance(kode="PC1", alamat="denah footplat", n=12, count_simbol=12),
            ElementInstance(kode="PC2", alamat="denah footplat", n=6, count_simbol=6),
            ElementInstance(kode="PC3", alamat="denah footplat", n=3, count_simbol=3),
        ],
        notes=["Tebal footplat tidak terasosiasi pasti pada ekstraksi teks — "
               "TIDAK ditranskrip (no-guess); lengkapi dari potongan."],
    )
    denah_kolom_lt1 = TkgSheet(
        sheet_id="S04", jenis="denah",
        meta=SheetMeta(judul="DENAH KOLOM LANTAI 1", skala="1:100"),
        grid=grid,
        elements=[
            ElementInstance(kode="K1", alamat="denah kolom lt1", n=4, count_label=4, lantai="LT1"),
            ElementInstance(kode="K1A", alamat="denah kolom lt1", n=8, count_label=8, lantai="LT1"),
            ElementInstance(kode="K2", alamat="denah kolom lt1", n=4, count_label=4, lantai="LT1"),
            ElementInstance(kode="K3", alamat="denah kolom lt1", n=5, count_label=5, lantai="LT1"),
        ],
    )
    tabel = TkgSheet(
        sheet_id="S12", jenis="tabel",
        meta=SheetMeta(judul="TABEL KOLOM + DETAIL PONDASI"),
        tables=[
            TkgTable(judul="TABEL KOLOM", records=[
                TypeRecord(kode="K1", dimensi={"b": 400, "h": 400}, satuan_dimensi="mm",
                           tulangan=[RebarSpec(posisi="tul_utama", raw="12D16"),
                                     RebarSpec(posisi="sengkang", raw="D10-300")]),
                TypeRecord(kode="K1A", dimensi={"b": 400, "h": 400}, satuan_dimensi="mm",
                           tulangan=[RebarSpec(posisi="tul_utama", raw="10D16"),
                                     RebarSpec(posisi="sengkang", raw="D10-300")]),
                TypeRecord(kode="K2", dimensi={"b": 250, "h": 600}, satuan_dimensi="mm",
                           tulangan=[RebarSpec(posisi="tul_utama", raw="12D16"),
                                     RebarSpec(posisi="sengkang", raw="D10-300")]),
                TypeRecord(kode="K3", dimensi={"b": 250, "h": 400}, satuan_dimensi="mm",
                           tulangan=[RebarSpec(posisi="tul_utama", raw="8D16"),
                                     RebarSpec(posisi="sengkang", raw="D10-300")]),
            ]),
            TkgTable(judul="DETAIL PONDASI", records=[
                # SENGAJA tanpa tinggi/t: tebal tidak pasti dari teks (no-guess)
                TypeRecord(kode="PC1", dimensi={"panjang": 1500, "lebar": 1500},
                           satuan_dimensi="mm",
                           tulangan=[RebarSpec(posisi="tul_sebar_x", raw="D16-150"),
                                     RebarSpec(posisi="tul_sebar_y", raw="D16-150")]),
                TypeRecord(kode="PC2", dimensi={"panjang": 1900, "lebar": 1600},
                           satuan_dimensi="mm"),
                TypeRecord(kode="PC3", dimensi={"panjang": 1200, "lebar": 1200},
                           satuan_dimensi="mm"),
            ]),
        ],
        notes=["Ambiguitas tabel: teks memuat 10D16 & 12D16 utk K1 — transkrip "
               "memilih K1=12D16, K1A=10D16 (baris eksplisit); wajib review."],
    )
    return TkgDocument(prj_id="PLHUT-SKA-2024", rev_id="R0",
                       sheets=[denah_footplat, denah_kolom_lt1, tabel])


def test_v02_grid_plhut_lolos():
    """Grid asli PLHUT: 5x4000=20000 dan 5000+3000+2000=10000 — gerbang V-02 lolos."""
    r = validate_tkg(buat_tkg_plhut())
    assert r.n_errors == 0
    assert not [i for i in r.issues if i.code == "E-GRID"]


def test_plhut_beton_kolom_k1a_lt1():
    """8 x 0.4 x 0.4 x 4.0 = 5.12 m3 (tinggi = parameter eksplisit, tercatat)."""
    res = takeoff_tkg(buat_tkg_plhut(), TakeoffParams(tinggi_per_lantai_m=4.0))
    k1a = next(i for i in res.items
               if i.kode == "K1A" and i.work_type == "beton")
    assert k1a.quantity == pytest.approx(5.12)
    assert any(p.nama == "tinggi_per_lantai_m" for p in res.params_used)


def test_plhut_besi_kolom_k1a_lt1():
    """Pokok 10D16 + sengkang D10-300 — expected dihitung dari rumus mentah."""
    res = takeoff_tkg(buat_tkg_plhut(), TakeoffParams(tinggi_per_lantai_m=4.0,
                                                      selimut_beton_m=0.04))
    k1a = next(i for i in res.items if i.kode == "K1A" and i.work_type == "besi")

    w16 = (math.pi / 4) * 16 ** 2 * 7850 / 1e6
    w10 = (math.pi / 4) * 10 ** 2 * 7850 / 1e6
    pokok = 10 * 4.0 * w16
    n_s = math.floor(4.0 / 0.3) + 1                      # 14
    l1 = 2 * ((0.4 - 0.08) + (0.4 - 0.08)) + 2 * 6 * 0.010   # 1.40 m
    sengkang = n_s * l1 * w10
    expected = (pokok + sengkang) * 8                    # 8 kolom K1A
    assert k1a.quantity == pytest.approx(expected, abs=0.01)


def test_plhut_footplat_tanpa_tebal_needs_review():
    """Data nyata yang tidak lengkap TIDAK ditebak: telapak tanpa tebal -> REVIEW."""
    res = takeoff_tkg(buat_tkg_plhut(), TakeoffParams(tinggi_per_lantai_m=4.0))
    for kode in ("PC1", "PC2", "PC3"):
        beton = next(i for i in res.items
                     if i.kode == kode and i.work_type == "beton")
        assert beton.needs_review is True and beton.quantity is None


def test_plhut_semua_kolom_lt1_terhitung():
    """Keempat tipe kolom LT1 punya beton+bekisting+besi (cakupan RULE-EXP)."""
    res = takeoff_tkg(buat_tkg_plhut(), TakeoffParams(tinggi_per_lantai_m=4.0))
    for kode in ("K1", "K1A", "K2", "K3"):
        jenis = {i.work_type for i in res.items if i.kode == kode and not i.needs_review}
        assert {"beton", "bekisting", "besi"} <= jenis, f"{kode}: {jenis}"
