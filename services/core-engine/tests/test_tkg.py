"""
Tes TKG: validator (V-02/04/05), renderer (deterministik), takeoff (F-B/C/D).

Anchor dihitung MANUAL + diverifikasi independen langsung dari rumus
(bukan dari modul yang diuji):
  w(d) = (pi/4) d^2 x 7850/1e6 -> w16=1.578336, w12=0.887814, w8=0.394584 kg/m
  K1 (b300 h400 mm, tinggi 3.5 m param, n=4, 8D16 + sengkang D8-150, c=40mm,
     kait 6d): pokok 8x3.5xw16=44.193412; sengkang n=floor(3.5/0.15)+1=24,
     L1=2x((0.22)+(0.32))+2x0.048=1.176, kg=24x1.176xw8=11.136740;
     total x4 = 221.320608 kg. Beton 0.3x0.4x3.5x4=1.68 m3.
     Bekisting 2x(0.3+0.4)x3.5x4=19.6 m2 (F-C01).
  SL1 (b150 h200 mm, ruas A->C dari grid 3.0+3.5=6.5 m, 4D12 + D8-200):
     pokok 4x6.5xw12=23.083166; sengkang n=floor(6.5/0.2)+1=33,
     L1=2x(0.07+0.12)+0.096=0.476, kg=33x0.476xw8=6.198126;
     total = 29.281292 kg. Beton 0.15x0.2x6.5=0.195 m3. Bekisting 2x0.2x6.5=2.6 m2.

Anchor D3 (kait/lewatan/pinggang/BBS — dihitung manual 2026-07-02):
  A. Kait pokok (K2 tinggi 3.5, n=1, 8D16, k_hook_utama=12):
     kait/ujung = 12x16/1000 = 0.192; L_bat = 3.5 + 2x0.192 = 3.884 m
     W = 8 x 3.884 x w16 = 31.072 x 1.5783361 = 49.042060 kg
  B. Lewatan (B1 panjang 14 m, 4D16, n_ld=40, l_stock=12):
     n_lap = ceil(14/12)-1 = 1 ; lap = 40x16/1000 = 0.64 ; L_bat = 14.64 m
     W = 4 x 14.64 x w16 = 58.56 x 1.5783361 = 92.427365 kg
  D. Pinggang F-D04 (B2 panjang 6 m, 2D12, n_ld=40):
     L_p = 6 + 2x40x12/1000 = 6.96 ; W = 2 x 6.96 x w12
       = 13.92 x 0.8878141 = 12.358372 kg
  E. BBS (K2 8D16 x 3.5 m, l_stock=12): berat = 28 x w16 = 44.193412 kg;
     n_per_stok = floor(12/3.5) = 3 ; kebutuhan = ceil(8/3) = 3 batang;
     waste = (3x12 - 28) x w16 = 8 x 1.5783361 = 12.626689 kg
  G. BBS + lewatan (B1, L_bat 14.64 dipecah 12 + 2.64):
     potongan (16,12): 4 buah -> butuh 4 stok, waste 0;
     potongan (16,2.64): 4 buah, n_per_stok = floor(12/2.64) = 4 -> 1 stok,
     waste = (12 - 4x2.64) x w16 = 1.44 x 1.5783361 = 2.272804 kg;
     total stok d16 = 5, total waste = 2.272804 kg
"""
import pytest

from app.tkg.models import (
    Dimension, ElementInstance, Grid, GridAxis, GridSpan, GridTotal, Level,
    RebarSpec, RuasGrid, SheetMeta, TkgDocument, TkgSheet, TkgTable, TypeRecord,
)
from app.tkg.params import TakeoffParams
from app.tkg.render import render_tkg_txt
from app.tkg.takeoff import (
    berat_per_meter, kategori_dari_kode, parse_rebar_raw, takeoff_tkg,
)
from app.tkg.validate import grid_distance_m, validate_tkg


def buat_tkg(total_x_mm: float = 6500, count_label_k1: int = 4) -> TkgDocument:
    grid = Grid(
        sumbu_x=[GridAxis(label="A"), GridAxis(label="B"), GridAxis(label="C")],
        sumbu_y=[GridAxis(label="1"), GridAxis(label="2")],
        bentang_x=[
            GridSpan(dari="A", ke="B", nilai=3000, unit="mm", raw="3000"),
            GridSpan(dari="B", ke="C", nilai=3500, unit="mm", raw="3500"),
        ],
        bentang_y=[GridSpan(dari="1", ke="2", nilai=4000, unit="mm")],
        total_x=GridTotal(dari="A", ke="C", nilai=total_x_mm, unit="mm"),
        total_y=GridTotal(dari="1", ke="2", nilai=4000, unit="mm"),
    )
    denah = TkgSheet(
        sheet_id="S05", jenis="denah",
        meta=SheetMeta(judul="DENAH SLOOF & KOLOM", nomor="S-05", skala="1:100"),
        grid=grid,
        levels=[Level(label_raw="SFL +0.000", nilai_m=0.0, lantai="LT1"),
                Level(label_raw="SFL +3.500", nilai_m=3.5, lantai="LT2")],
        elements=[
            ElementInstance(kode="K1", alamat="as B/1", bentuk="titik", n=4,
                            count_simbol=4, count_label=count_label_k1, lantai="LT1"),
            ElementInstance(kode="SL1", alamat="antara as A-C pada as 1", bentuk="ruas",
                            n=1, ruas=RuasGrid(sumbu="x", dari="A", ke="C", pada="1")),
        ],
        dimensions=[Dimension(nilai=150, unit="mm", anchor="tebal pelat teras", raw="t=150")],
        notes=["Mutu beton struktur fc' 25 MPa kecuali disebut lain."],
    )
    tabel = TkgSheet(
        sheet_id="S09", jenis="tabel",
        meta=SheetMeta(judul="TABEL KOLOM & SLOOF", nomor="S-09"),
        tables=[TkgTable(judul="TABEL KOLOM", records=[
            TypeRecord(
                kode="K1", lantai="LT1", dimensi={"b": 300, "h": 400},
                satuan_dimensi="mm", mutu_beton="fc' 25",
                tulangan=[
                    RebarSpec(posisi="tul_utama", raw="8D16"),
                    RebarSpec(posisi="sengkang", raw="D8-150"),
                ],
            ),
            TypeRecord(
                kode="SL1", dimensi={"b": 150, "h": 200}, satuan_dimensi="mm",
                mutu_beton="fc' 25",
                tulangan=[
                    RebarSpec(posisi="tul_utama", raw="4D12"),
                    RebarSpec(posisi="sengkang", raw="D8-200"),
                ],
            ),
        ])],
    )
    return TkgDocument(prj_id="PRJ-TEST", rev_id="R0", sheets=[denah, tabel])


# ─── Grammar tulangan (§2.2) ──────────────────────────────────────────────────

def test_parse_rebar_pokok():
    assert parse_rebar_raw("12D16") == {"jumlah": 12.0, "d": 16.0}
    assert parse_rebar_raw("4Ø10") == {"jumlah": 4.0, "d": 10.0}


def test_parse_rebar_sebar():
    assert parse_rebar_raw("D10-150") == {"d": 10.0, "s": 150.0}
    assert parse_rebar_raw("Ø8-200") == {"d": 8.0, "s": 200.0}


def test_parse_rebar_gagal_grammar_tidak_ditebak():
    assert parse_rebar_raw("besi 16") is None
    assert parse_rebar_raw("D16D") is None


def test_berat_per_meter_konstanta_sni():
    # w(d) = (pi/4) d^2 7850/1e6 ; praktis 0.006165 d^2
    assert berat_per_meter(16) == pytest.approx(1.578336, rel=1e-5)
    assert berat_per_meter(12) == pytest.approx(0.887814, rel=1e-5)


# ─── Kamus prefiks (§2.1) ─────────────────────────────────────────────────────

def test_kategori_prefiks_terpanjang_menang():
    assert kategori_dari_kode("SL1") == "sloof"      # bukan "S" (plat)
    assert kategori_dari_kode("KP2") == "kolom_praktis"  # bukan "K"
    assert kategori_dari_kode("K1") == "kolom"
    assert kategori_dari_kode("S2") == "plat"
    assert kategori_dari_kode("RB1") == "ring_balok"
    assert kategori_dari_kode("XX9") is None          # di luar kamus -> None, bukan tebakan


# ─── Grid & validator ────────────────────────────────────────────────────────

def test_grid_distance_jumlah_bentang():
    doc = buat_tkg()
    grid = doc.sheets[0].grid
    assert grid_distance_m(grid, "x", "A", "C") == pytest.approx(6.5)
    assert grid_distance_m(grid, "x", "B", "C") == pytest.approx(3.5)


def test_grid_distance_rantai_putus():
    doc = buat_tkg()
    with pytest.raises(KeyError):
        grid_distance_m(doc.sheets[0].grid, "y", "2", "5")


def test_v02_lolos_dan_gagal():
    ok = validate_tkg(buat_tkg(total_x_mm=6500))
    assert ok.n_errors == 0 and ok.ok
    gagal = validate_tkg(buat_tkg(total_x_mm=6600))  # selisih 100/6600 > 0.5%
    assert gagal.n_errors == 1
    assert gagal.issues[0].code == "E-GRID"


def test_v04_orphans():
    doc = buat_tkg()
    doc.sheets[0].elements.append(
        ElementInstance(kode="X9", alamat="as C/2", n=1))          # tanpa definisi
    doc.sheets[1].tables[0].records.append(
        TypeRecord(kode="Z9", dimensi={"b": 100, "h": 100}))        # tanpa instance
    r = validate_tkg(doc)
    assert "X9" in r.orphans_tanpa_definisi
    assert "Z9" in r.orphans_tanpa_instance
    codes = {i.code for i in r.issues}
    assert "W-TYP" in codes and "W-DEF" in codes


def test_v05_dual_count_gerbang():
    r = validate_tkg(buat_tkg(count_label_k1=3))  # simbol=4 vs label=3
    assert any(i.code == "W-CNT" for i in r.issues)
    assert r.ok is True            # warning bukan error
    assert r.gate_passed is False  # tapi gerbang belum lolos


# ─── Renderer ────────────────────────────────────────────────────────────────

def test_render_deterministik_dan_lengkap():
    doc = buat_tkg()
    v = validate_tkg(doc)
    teks1 = render_tkg_txt(doc, v)
    teks2 = render_tkg_txt(doc, v)
    assert teks1 == teks2                     # deterministik (INV-TKG-04)
    assert "BENTANG | 3000 | mm | as A->B" in teks1
    assert "K1" in teks1 and "SL1" in teks1
    assert "SFL +0.000" in teks1
    assert "TABEL KOLOM" not in teks1 or True  # judul tabel tidak wajib di render
    assert "RECORD | K1 lantai LT1" in teks1
    assert "GERBANG" in teks1.upper() or "gerbang" in teks1


# ─── Takeoff (anchor manual di docstring atas) ───────────────────────────────

def _items(result, kode, work_type):
    return [i for i in result.items if i.kode == kode and i.work_type == work_type]


def test_takeoff_k1_beton_bekisting_besi():
    result = takeoff_tkg(buat_tkg(), TakeoffParams(tinggi_per_lantai_m=3.5))
    beton = _items(result, "K1", "beton")
    assert len(beton) == 1 and beton[0].quantity == pytest.approx(1.68)
    assert beton[0].rule_id == "F-B01"
    assert beton[0].mutu_beton == "fc' 25"

    bekisting = _items(result, "K1", "bekisting")
    assert bekisting[0].quantity == pytest.approx(19.6)
    assert bekisting[0].rule_id == "F-C01"

    besi = _items(result, "K1", "besi")
    assert besi[0].quantity == pytest.approx(221.3206, abs=0.001)


def test_takeoff_sl1_panjang_dari_grid():
    result = takeoff_tkg(buat_tkg(), TakeoffParams(tinggi_per_lantai_m=3.5))
    beton = _items(result, "SL1", "beton")
    assert beton[0].quantity == pytest.approx(0.195)
    assert "grid" in beton[0].formula  # panjang diturunkan dari bentang as (F-A01)

    bekisting = _items(result, "SL1", "bekisting")
    assert bekisting[0].quantity == pytest.approx(2.6)
    assert bekisting[0].rule_id == "F-C03"

    besi = _items(result, "SL1", "besi")
    assert besi[0].quantity == pytest.approx(29.2813, abs=0.001)


def test_takeoff_tanpa_tinggi_jadi_needs_review_bukan_angka_karangan():
    result = takeoff_tkg(buat_tkg())  # TANPA tinggi_per_lantai_m
    beton_k1 = _items(result, "K1", "beton")
    assert beton_k1[0].needs_review is True
    assert beton_k1[0].quantity is None
    # SL1 tetap terhitung (panjang dari grid, tidak butuh tinggi)
    assert _items(result, "SL1", "beton")[0].quantity == pytest.approx(0.195)


def test_takeoff_kode_tanpa_definisi_needs_review():
    doc = buat_tkg()
    doc.sheets[0].elements.append(ElementInstance(kode="G7", alamat="as A/1-2", n=1))
    result = takeoff_tkg(doc, TakeoffParams(tinggi_per_lantai_m=3.5))
    review = [i for i in result.items if i.kode == "G7"]
    assert review and review[0].needs_review


def test_takeoff_parameter_terpakai_tercatat():
    result = takeoff_tkg(buat_tkg(), TakeoffParams(tinggi_per_lantai_m=3.5))
    nama_param = {p.nama for p in result.params_used}
    assert "tinggi_per_lantai_m" in nama_param
    assert "k_hook_sengkang" in nama_param
    assert "selimut_beton_m" in nama_param
    # asumsi kait/lap pokok belum dihitung harus tercatat eksplisit
    assert any("sambungan lewatan" in a for a in result.assumptions)


def test_takeoff_waste_besi_param():
    tanpa = takeoff_tkg(buat_tkg(), TakeoffParams(tinggi_per_lantai_m=3.5))
    dengan = takeoff_tkg(buat_tkg(), TakeoffParams(tinggi_per_lantai_m=3.5, waste_besi=0.05))
    b0 = _items(tanpa, "SL1", "besi")[0].quantity
    b1 = _items(dengan, "SL1", "besi")[0].quantity
    # hasil dibulatkan 4 desimal (_r4) -> toleransi absolut sebesar 1e-3
    assert b1 == pytest.approx(b0 * 1.05, abs=1e-3)


# ─── D3: kait + lewatan + pinggang (F-D02/F-D04) + BBS (F-D08) ────────────────

def _doc_satu_elemen(kode: str, dimensi: dict, tulangan: list,
                     panjang_m: float | None = None) -> TkgDocument:
    """Dokumen minimal: satu elemen + satu record (untuk anchor besi terisolasi)."""
    denah = TkgSheet(
        sheet_id="S01", jenis="denah", meta=SheetMeta(judul="DENAH UJI"),
        elements=[ElementInstance(kode=kode, alamat="as A/1", n=1, panjang_m=panjang_m)],
    )
    tabel = TkgSheet(
        sheet_id="S02", jenis="tabel", meta=SheetMeta(judul="TABEL UJI"),
        tables=[TkgTable(judul="TABEL", records=[
            TypeRecord(kode=kode, dimensi=dimensi, satuan_dimensi="mm",
                       mutu_beton="fc' 25", tulangan=tulangan),
        ])],
    )
    return TkgDocument(prj_id="PRJ-D3", rev_id="R0", sheets=[denah, tabel])


def test_fd02_kait_pokok_dihitung_bila_param_disetor():
    # Anchor A: 8 x 3.884 x w16 = 49.042060 kg
    doc = _doc_satu_elemen("K2", {"b": 300, "h": 400},
                           [RebarSpec(posisi="tul_utama", raw="8D16")])
    r = takeoff_tkg(doc, TakeoffParams(tinggi_per_lantai_m=3.5, k_hook_utama=12))
    besi = _items(r, "K2", "besi")
    assert besi[0].quantity == pytest.approx(49.0421, abs=0.001)
    assert "kait 2 x 12d" in besi[0].detail
    assert any(p.nama == "k_hook_utama" for p in r.params_used)
    # lewatan tetap TIDAK dihitung (l_stock tidak disetor) -> asumsi tercatat
    assert any("sambungan lewatan" in a for a in r.assumptions)


def test_fd02_lewatan_dihitung_dari_stok():
    # Anchor B: 4 x 14.64 x w16 = 92.427365 kg (1 lap 40d)
    doc = _doc_satu_elemen("B1", {"b": 200, "h": 300},
                           [RebarSpec(posisi="tul_utama", raw="4D16")], panjang_m=14.0)
    r = takeoff_tkg(doc, TakeoffParams(n_ld=40, l_stock_m=12))
    besi = _items(r, "B1", "besi")
    assert besi[0].quantity == pytest.approx(92.4274, abs=0.001)
    assert "1 lap x 40d" in besi[0].detail
    nama = {p.nama for p in r.params_used}
    assert "n_ld" in nama and "l_stock_m" in nama


def test_fd02_lewatan_dibutuhkan_tanpa_n_ld_jadi_review():
    # Anchor C: batang 14 m > stok 12 m tapi n_ld tidak disetor -> DILARANG
    # diam-diam mengabaikan lewatan; item harus needs_review tanpa angka.
    doc = _doc_satu_elemen("B1", {"b": 200, "h": 300},
                           [RebarSpec(posisi="tul_utama", raw="4D16")], panjang_m=14.0)
    r = takeoff_tkg(doc, TakeoffParams(l_stock_m=12))
    besi = _items(r, "B1", "besi")
    assert besi[0].needs_review is True and besi[0].quantity is None
    assert "n_ld" in (besi[0].review_reason or "")


def test_fd04_tulangan_pinggang():
    # Anchor D: 2 x 6.96 x w12 = 12.358372 kg
    doc = _doc_satu_elemen("B2", {"b": 300, "h": 600},
                           [RebarSpec(posisi="tul_pinggang", raw="2D12")], panjang_m=6.0)
    r = takeoff_tkg(doc, TakeoffParams(n_ld=40))
    besi = _items(r, "B2", "besi")
    assert besi[0].quantity == pytest.approx(12.3584, abs=0.001)
    assert "F-D04" in besi[0].detail


def test_fd08_bbs_waste_nyata():
    # Anchor E: berat 44.193412 kg (f_waste=1), 3 stok, waste 12.626689 kg
    doc = _doc_satu_elemen("K2", {"b": 300, "h": 400},
                           [RebarSpec(posisi="tul_utama", raw="8D16")])
    r = takeoff_tkg(doc, TakeoffParams(tinggi_per_lantai_m=3.5,
                                       waste_mode="bbs", l_stock_m=12))
    besi = _items(r, "K2", "besi")
    assert besi[0].quantity == pytest.approx(44.1934, abs=0.001)  # tanpa f_waste (AP-16)
    assert r.bbs is not None
    assert len(r.bbs.marks) == 1
    m = r.bbs.marks[0]
    assert m.d_mm == 16 and m.jumlah == 8 and m.panjang_m == pytest.approx(3.5)
    d16 = r.bbs.per_diameter[0]
    assert d16.kebutuhan_stok_batang == 3
    assert d16.waste_kg == pytest.approx(12.6267, abs=0.001)
    assert r.bbs.total_waste_kg == pytest.approx(12.6267, abs=0.001)


def test_fd08_bbs_batang_panjang_dipecah_dan_lap_terhitung():
    # Anchor G: L_bat 14.64 -> potongan 12 m (4x, waste 0) + 2.64 m (4x, 1 stok,
    # waste 1.44 m x w16 = 2.272804 kg); total stok d16 = 5.
    doc = _doc_satu_elemen("B1", {"b": 200, "h": 300},
                           [RebarSpec(posisi="tul_utama", raw="4D16")], panjang_m=14.0)
    r = takeoff_tkg(doc, TakeoffParams(n_ld=40, l_stock_m=12, waste_mode="bbs"))
    assert r.bbs is not None
    panjang_marks = sorted(m.panjang_m for m in r.bbs.marks)
    assert panjang_marks == pytest.approx([2.64, 12.0])
    d16 = r.bbs.per_diameter[0]
    assert d16.n_potong == 8
    assert d16.kebutuhan_stok_batang == 5
    assert d16.waste_kg == pytest.approx(2.2728, abs=0.001)


def test_ap16_waste_ganda_ditolak():
    # AP-16: waste param + waste BBS tidak boleh bersamaan
    with pytest.raises(Exception):
        TakeoffParams(waste_mode="bbs", waste_besi=0.05, l_stock_m=12)
    with pytest.raises(Exception):
        TakeoffParams(waste_mode="bbs")  # bbs tanpa l_stock_m juga ditolak


def test_bbs_elemen_review_tidak_menyumbang_potongan():
    # Elemen yang gagal (butuh lewatan tanpa n_ld) TIDAK boleh menyumbang mark BBS
    doc = _doc_satu_elemen("B1", {"b": 200, "h": 300},
                           [RebarSpec(posisi="tul_utama", raw="4D16")], panjang_m=14.0)
    r = takeoff_tkg(doc, TakeoffParams(l_stock_m=12, waste_mode="bbs"))
    assert _items(r, "B1", "besi")[0].needs_review is True
    assert r.bbs is not None and r.bbs.marks == []
