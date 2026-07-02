"""
PAAX Core Engine — Takeoff deterministik dari TKG (brain TXT01 §6.2 + TXT02).

Alur: JOIN ElementInstance x TypeRecord (kode+lantai) -> kategori dari prefiks
kode (§2.1) -> ekspansi RULE-EXP-BETON: tiap elemen beton menghasilkan
WorkItem {beton m3, bekisting m2, besi kg}.

Rumus yang dipakai (id mengacu docs/specs/brain-v4.1/..._02_RUMUS...txt):
  Beton    : F-B01..B07 (via app.geometry — satu sumber rumus volume)
  Bekisting: F-C01 (kolom), F-C03 (sloof), F-C04 (balok), F-C05 (pelat),
             F-C06 (telapak)
  Besi     : F-D01 w(d)=0.006165*d^2 ; F-D02 memanjang + kait (k_hook_utama x d
             per ujung) + lewatan (n_lap = ceil(L_bat/l_stock)-1, lap = n_ld x d);
             F-D03 sengkang (zona tumpuan/lapangan) ; F-D04 pinggang
             (Lb + 2 x n_ld x d) ; F-D05 sebar pelat ; F-D06 waste
             (mode "param" ATAU "bbs", tidak keduanya — AP-16) ;
             F-D07 total per instance ; F-D08 BBS & waste nyata dari stok

ATURAN EMAS + "tanpa angka palsu": data yang tidak ada TIDAK ditebak —
item keluar dengan quantity=None + needs_review + alasan. Setiap parameter
default yang terpakai dicatat di `params_used`/`assumptions` (RULE-BOE).
"""
from __future__ import annotations
import math
import re
from typing import Dict, List, Literal, Optional, Tuple

from pydantic import BaseModel, Field

from ..geometry.volume import compute_volume
from .models import ElementInstance, TkgDocument, TypeRecord
from .params import ParamUsed, TakeoffParams
from .validate import grid_distance_m, ke_meter


# ─── Hasil takeoff ────────────────────────────────────────────────────────────

class TakeoffItem(BaseModel):
    kode: str
    lantai: Optional[str] = None
    kategori: str
    work_type: Literal["beton", "bekisting", "besi"]
    quantity: Optional[float] = None      # None = butuh data/review; TIDAK ditebak
    unit: str
    formula: str
    detail: str
    needs_review: bool = False
    review_reason: Optional[str] = None
    mutu_beton: Optional[str] = None
    alamat: Optional[str] = None
    rule_id: str                          # jejak rumus, mis. "F-B01", "F-C03"


class BbsMark(BaseModel):
    """F-D08: satu baris Bar Bending Schedule — potongan seragam per elemen/posisi."""
    mark: str
    kode: str
    posisi: str
    d_mm: float
    panjang_m: float          # L_potong (selalu <= l_stock_m; batang panjang dipecah)
    jumlah: int
    berat_kg: float


class BbsDiameterSummary(BaseModel):
    """F-D08 rekap per diameter: kebutuhan stok & waste nyata."""
    d_mm: float
    n_potong: int
    total_panjang_m: float
    kebutuhan_stok_batang: int
    waste_kg: float


class BbsResult(BaseModel):
    l_stock_m: float
    marks: List[BbsMark]
    per_diameter: List[BbsDiameterSummary]
    total_waste_kg: float


class TakeoffResult(BaseModel):
    prj_id: str
    rev_id: str
    items: List[TakeoffItem]
    assumptions: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    params_used: List[ParamUsed] = Field(default_factory=list)
    n_needs_review: int = 0
    bbs: Optional[BbsResult] = None       # terisi hanya bila waste_mode="bbs" (F-D08)


# ─── Grammar tulangan (§2.2) ──────────────────────────────────────────────────

_RE_POKOK = re.compile(r"^\s*(\d+)\s*([DdØø∅O])\s*(\d+(?:[.,]\d+)?)\s*$")
_RE_SEBAR = re.compile(r"^\s*([DdØø∅O])\s*(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*$")


def parse_rebar_raw(raw: str) -> Optional[Dict[str, float]]:
    """
    Parse notasi SNI: '12D16' -> {jumlah:12, d:16} ; 'D10-150' -> {d:10, s:150}.
    Tidak cocok grammar -> None (JANGAN ditebak — AP-E-04).
    """
    m = _RE_POKOK.match(raw)
    if m:
        return {"jumlah": float(m.group(1)), "d": float(m.group(3).replace(",", "."))}
    m = _RE_SEBAR.match(raw)
    if m:
        return {"d": float(m.group(2).replace(",", ".")), "s": float(m.group(3).replace(",", "."))}
    return None


def berat_per_meter(d_mm: float) -> float:
    """F-D01: w(d) = (pi/4) * d^2 * 7850 / 1e6 ≈ 0.006165*d^2 [kg/m] (konstanta SNI)."""
    return (math.pi / 4) * d_mm ** 2 * 7850 / 1e6


# ─── Kamus prefiks kode -> kategori (§2.1) ────────────────────────────────────

_PREFIKS: List[Tuple[str, str]] = [
    # urut dari yang terpanjang supaya "SL1" tidak tertangkap "S"
    ("LATEI", "latei"), ("LINTEL", "latei"), ("GORDING", "gording"),
    ("PC", "pondasi_telapak"), ("SL", "sloof"), ("KP", "kolom_praktis"),
    ("RB", "ring_balok"), ("CG", "balok"), ("CB", "balok"), ("BL", "latei"),
    ("LT", "latei"), ("TG", "tangga"), ("KD", "kuda_kuda"), ("JR", "kuda_kuda"),
    ("GD", "gording"), ("IA", "ikatan_angin"), ("TS", "trekstang"),
    ("P", "pondasi_telapak"), ("F", "pondasi_telapak"), ("K", "kolom"),
    ("G", "balok"), ("B", "balok"), ("S", "plat"),
]


def kategori_dari_kode(kode: str) -> Optional[str]:
    up = kode.strip().upper()
    for prefiks, kategori in _PREFIKS:
        if up.startswith(prefiks):
            sisa = up[len(prefiks):]
            if sisa == "" or sisa[0].isdigit():
                return kategori
    return None


# ─── Mesin takeoff ────────────────────────────────────────────────────────────

_KATEGORI_BETON = {
    "kolom", "kolom_praktis", "sloof", "balok", "ring_balok", "latei",
    "plat", "pondasi_telapak", "tangga",
}
_KATEGORI_RUAS = {"sloof", "balok", "ring_balok", "latei"}


class _Ctx:
    def __init__(self, doc: TkgDocument, params: TakeoffParams):
        self.doc = doc
        self.params = params
        self.items: List[TakeoffItem] = []
        self.assumptions: List[str] = []
        self.warnings: List[str] = []
        self.params_used: Dict[str, ParamUsed] = {}
        # F-D08: potongan terkumpul (kode, posisi, d_mm, L_potong_m, jumlah)
        self.cuts: List[Tuple[str, str, float, float, int]] = []

    def pakai_param(self, nama: str, nilai, catatan: str) -> None:
        if nama not in self.params_used:
            self.params_used[nama] = ParamUsed(nama=nama, nilai=nilai, catatan=catatan)

    def tambah_potong(self, kode: str, posisi: str, d_mm: float,
                      panjang_m: float, jumlah: int) -> None:
        """Daftarkan potongan utk BBS. Batang > l_stock dipecah: n penuh + sisa."""
        if self.params.waste_mode != "bbs" or jumlah <= 0 or panjang_m <= 0:
            return
        stok = self.params.l_stock_m
        assert stok is not None  # dijamin validator TakeoffParams
        if panjang_m <= stok + 1e-9:
            self.cuts.append((kode, posisi, d_mm, panjang_m, jumlah))
            return
        n_penuh = math.floor(panjang_m / stok + 1e-9)
        sisa = panjang_m - n_penuh * stok
        self.cuts.append((kode, posisi, d_mm, stok, n_penuh * jumlah))
        if sisa > 1e-6:
            self.cuts.append((kode, posisi, d_mm, sisa, jumlah))


def _cari_record(doc: TkgDocument, kode: str, lantai: Optional[str]) -> Optional[TypeRecord]:
    """JOIN: cocokkan (kode, lantai); fallback kode saja bila lantai tak spesifik."""
    kandidat: List[TypeRecord] = []
    for sheet in doc.sheets:
        for table in sheet.tables:
            for rec in table.records:
                if rec.kode.strip().upper() == kode.strip().upper():
                    kandidat.append(rec)
    if not kandidat:
        return None
    if lantai:
        for rec in kandidat:
            if rec.lantai == lantai:
                return rec
    tanpa_lantai = [r for r in kandidat if r.lantai is None]
    if len(kandidat) == 1:
        return kandidat[0]
    if tanpa_lantai:
        return tanpa_lantai[0]
    return kandidat[0]


def _dim_m(rec: TypeRecord, kunci: str) -> Optional[float]:
    v = rec.dimensi.get(kunci)
    if v is None:
        return None
    return ke_meter(v, rec.satuan_dimensi)


def _panjang_ruas_m(ctx: _Ctx, el: ElementInstance, rec: TypeRecord) -> Tuple[Optional[float], str]:
    """Panjang elemen ruas: (1) angka tertulis > (2) turunan grid > (3) dimensi record."""
    if el.panjang_m is not None:
        return el.panjang_m, f"panjang tertulis {el.panjang_m:g} m"
    if el.ruas is not None:
        for sheet in ctx.doc.sheets:
            if sheet.grid is None:
                continue
            try:
                p = grid_distance_m(sheet.grid, el.ruas.sumbu, el.ruas.dari, el.ruas.ke)
                return p, f"jarak as {el.ruas.dari}->{el.ruas.ke} dari grid = {p:g} m (F-A01)"
            except KeyError:
                continue
        return None, f"ruas as {el.ruas.dari}->{el.ruas.ke} tidak bisa dihitung dari grid manapun"
    p = _dim_m(rec, "panjang")
    if p is not None:
        return p, f"panjang dari record = {p:g} m"
    return None, "panjang tidak tertulis & tidak ada ruas grid"


def _tinggi_kolom_m(ctx: _Ctx, rec: TypeRecord) -> Tuple[Optional[float], str, bool]:
    """Lk kolom: dimensi record > param tinggi_per_lantai_m > tidak ada (review)."""
    t = _dim_m(rec, "tinggi")
    if t is not None:
        return t, f"tinggi dari record = {t:g} m", False
    if ctx.params.tinggi_per_lantai_m is not None:
        ctx.pakai_param("tinggi_per_lantai_m", ctx.params.tinggi_per_lantai_m,
                        "tinggi kolom per lantai (disetor pengguna)")
        return ctx.params.tinggi_per_lantai_m, \
            f"tinggi dari parameter pengguna = {ctx.params.tinggi_per_lantai_m:g} m", True
    return None, "tinggi kolom tidak ada di record & parameter tinggi_per_lantai_m tidak disetor", False


def _tambah_review(ctx: _Ctx, el: ElementInstance, rec: Optional[TypeRecord], kategori: str,
                   work_type: str, unit: str, alasan: str, rule_id: str) -> None:
    ctx.items.append(TakeoffItem(
        kode=el.kode, lantai=el.lantai, kategori=kategori, work_type=work_type,  # type: ignore[arg-type]
        quantity=None, unit=unit, formula="-", detail="-",
        needs_review=True, review_reason=alasan,
        mutu_beton=rec.mutu_beton if rec else None, alamat=el.alamat, rule_id=rule_id,
    ))


# ─── Beton (F-B via app.geometry) ─────────────────────────────────────────────

def _beton(ctx: _Ctx, el: ElementInstance, rec: TypeRecord, kategori: str) -> Optional[float]:
    """Hitung volume beton; kembalikan panjang/tinggi efektif utk dipakai besi/bekisting."""
    b, h = _dim_m(rec, "b"), _dim_m(rec, "h")

    if kategori in ("kolom", "kolom_praktis"):
        tinggi, ket, dari_param = _tinggi_kolom_m(ctx, rec)
        if b is None or h is None or tinggi is None:
            _tambah_review(ctx, el, rec, kategori, "beton", "m3",
                           f"dimensi kurang (b={b}, h={h}); {ket}" if tinggi is None
                           else f"penampang b/h tidak lengkap (b={b}, h={h})", "F-B01")
            return None
        if dari_param:
            ctx.assumptions.append(
                f"{el.kode}: tinggi kolom memakai parameter pengguna ({tinggi:g} m) — {ket}")
        gtype = "kolom" if kategori == "kolom" else "kolom_praktis"
        dims = {"lebar": b, "tebal": h, "tinggi": tinggi, "jumlah": el.n} if gtype == "kolom" \
            else {"lebar": b, "tebal": h, "panjang": tinggi, "jumlah": el.n}
        r = compute_volume(gtype, dims)
        ctx.items.append(TakeoffItem(
            kode=el.kode, lantai=el.lantai, kategori=kategori, work_type="beton",
            quantity=r.volume, unit=r.unit, formula=r.formula, detail=r.detail,
            mutu_beton=rec.mutu_beton, alamat=el.alamat,
            rule_id="F-B01" if kategori == "kolom" else "F-B03",
        ))
        return tinggi

    if kategori in _KATEGORI_RUAS:
        panjang, ket = _panjang_ruas_m(ctx, el, rec)
        if b is None or h is None or panjang is None:
            _tambah_review(ctx, el, rec, kategori, "beton", "m3",
                           f"b={b}, h={h}; {ket}", "F-B04" if kategori == "sloof" else "F-B05")
            return None
        gtype = "sloof" if kategori == "sloof" else ("ring_balok" if kategori == "ring_balok" else "balok")
        r = compute_volume(gtype, {"lebar": b, "tinggi": h, "panjang": panjang, "jumlah": el.n})
        ctx.items.append(TakeoffItem(
            kode=el.kode, lantai=el.lantai, kategori=kategori, work_type="beton",
            quantity=r.volume, unit=r.unit,
            formula=r.formula + f" ({ket}; mode {ctx.params.beam_len_mode})",
            detail=r.detail, mutu_beton=rec.mutu_beton, alamat=el.alamat,
            rule_id="F-B04" if kategori == "sloof" else "F-B05",
        ))
        ctx.pakai_param("beam_len_mode", ctx.params.beam_len_mode,
                        "konvensi panjang balok (as_as: panjang antar as)")
        return panjang

    if kategori == "plat":
        p, l, t = _dim_m(rec, "panjang"), _dim_m(rec, "lebar"), _dim_m(rec, "t")
        if p is None or l is None or t is None:
            _tambah_review(ctx, el, rec, kategori, "beton", "m3",
                           f"pelat butuh panjang, lebar, t (ada: panjang={p}, lebar={l}, t={t})", "F-B06")
            return None
        luas_bukaan = rec.dimensi.get("luas_bukaan", 0.0)
        r = compute_volume("plat", {"panjang": p, "lebar": l, "tebal": t,
                                    "jumlah": el.n, "luas_bukaan": luas_bukaan})
        ctx.items.append(TakeoffItem(
            kode=el.kode, lantai=el.lantai, kategori=kategori, work_type="beton",
            quantity=r.volume, unit=r.unit, formula=r.formula, detail=r.detail,
            mutu_beton=rec.mutu_beton, alamat=el.alamat, rule_id="F-B06",
        ))
        return None

    if kategori == "pondasi_telapak":
        pb, lb = _dim_m(rec, "panjang_bawah"), _dim_m(rec, "lebar_bawah")
        pa, la = _dim_m(rec, "panjang_atas"), _dim_m(rec, "lebar_atas")
        tinggi = _dim_m(rec, "tinggi") or _dim_m(rec, "t")
        if pb is not None and lb is not None and pa is not None and la is not None and tinggi is not None:
            r = compute_volume("pondasi_telapak_miring", {
                "panjang_bawah": pb, "lebar_bawah": lb, "panjang_atas": pa,
                "lebar_atas": la, "tinggi": tinggi, "jumlah": el.n,
            })
            rule = "F-B07"
        else:
            p, l = _dim_m(rec, "panjang"), _dim_m(rec, "lebar")
            if p is None or l is None or tinggi is None:
                _tambah_review(ctx, el, rec, kategori, "beton", "m3",
                               f"telapak butuh panjang, lebar, tinggi/t (ada: {rec.dimensi})", "F-B07")
                return None
            r = compute_volume("pondasi_telapak", {"panjang": p, "lebar": l,
                                                   "tinggi": tinggi, "jumlah": el.n})
            rule = "F-B07"
        ctx.items.append(TakeoffItem(
            kode=el.kode, lantai=el.lantai, kategori=kategori, work_type="beton",
            quantity=r.volume, unit=r.unit, formula=r.formula, detail=r.detail,
            mutu_beton=rec.mutu_beton, alamat=el.alamat, rule_id=rule,
        ))
        return None

    if kategori == "tangga":
        _tambah_review(ctx, el, rec, kategori, "beton", "m3",
                       "tangga butuh detail (tebal_pelat, optrede, antrede, ...) — isi via "
                       "elemen 'tangga_detail' geometry atau lengkapi record", "F-B11")
        return None

    return None


# ─── Bekisting (F-C) ─────────────────────────────────────────────────────────

def _r4(x: float) -> float:
    return round(x + 1e-9, 4)


def _bekisting(ctx: _Ctx, el: ElementInstance, rec: TypeRecord, kategori: str,
               panjang_efektif: Optional[float]) -> None:
    b, h = _dim_m(rec, "b"), _dim_m(rec, "h")

    if kategori == "kolom":
        if b is None or h is None or panjang_efektif is None:
            _tambah_review(ctx, el, rec, kategori, "bekisting", "m2",
                           "butuh b, h, dan tinggi kolom", "F-C01")
            return
        a = 2 * (b + h) * panjang_efektif * el.n
        ctx.items.append(TakeoffItem(
            kode=el.kode, lantai=el.lantai, kategori=kategori, work_type="bekisting",
            quantity=_r4(a), unit="m2",
            formula="2 x (b + h) x Lk x jumlah",
            detail=f"2 x ({b:g} + {h:g}) x {panjang_efektif:g} x {el.n} = {_r4(a):g} m2",
            alamat=el.alamat, rule_id="F-C01",
        ))
        return

    if kategori == "kolom_praktis":
        _tambah_review(ctx, el, rec, kategori, "bekisting", "m2",
                       "bekisting kolom praktis tergantung metode (umum dicor terhadap "
                       "pasangan dinding) — putuskan manual / varian AHSP", "F-C01")
        return

    if kategori == "sloof":
        if h is None or panjang_efektif is None:
            _tambah_review(ctx, el, rec, kategori, "bekisting", "m2",
                           "butuh h dan panjang sloof", "F-C03")
            return
        a = 2 * h * panjang_efektif * el.n
        ctx.items.append(TakeoffItem(
            kode=el.kode, lantai=el.lantai, kategori=kategori, work_type="bekisting",
            quantity=_r4(a), unit="m2",
            formula="2 x h x L_jalur x jumlah",
            detail=f"2 x {h:g} x {panjang_efektif:g} x {el.n} = {_r4(a):g} m2",
            alamat=el.alamat, rule_id="F-C03",
        ))
        return

    if kategori in ("balok", "ring_balok", "latei"):
        if b is None or h is None or panjang_efektif is None:
            _tambah_review(ctx, el, rec, kategori, "bekisting", "m2",
                           "butuh b, h, dan panjang balok", "F-C04")
            return
        if ctx.params.t_pelat_default_m is not None:
            t = ctx.params.t_pelat_default_m
            ctx.pakai_param("t_pelat_default_m", t, "tebal pelat utk bekisting balok penopang pelat")
            lebar_kontak = b + 2 * (h - t)
            formula = "(b + 2 x (h - t_pelat)) x Lb x jumlah"
            detail = f"({b:g} + 2 x ({h:g} - {t:g})) x {panjang_efektif:g} x {el.n}"
        else:
            lebar_kontak = b + 2 * h
            formula = "(b + 2 x h) x Lb x jumlah"
            detail = f"({b:g} + 2 x {h:g}) x {panjang_efektif:g} x {el.n}"
            ctx.assumptions.append(
                f"{el.kode}: bekisting balok dihitung TANPA pelat di atas "
                f"(b + 2h) — setor t_pelat_default_m bila balok menopang pelat (F-C04)")
        a = lebar_kontak * panjang_efektif * el.n
        ctx.items.append(TakeoffItem(
            kode=el.kode, lantai=el.lantai, kategori=kategori, work_type="bekisting",
            quantity=_r4(a), unit="m2", formula=formula,
            detail=f"{detail} = {_r4(a):g} m2", alamat=el.alamat, rule_id="F-C04",
        ))
        return

    if kategori == "plat":
        p, l = _dim_m(rec, "panjang"), _dim_m(rec, "lebar")
        if p is None or l is None:
            _tambah_review(ctx, el, rec, kategori, "bekisting", "m2",
                           "butuh panjang & lebar pelat", "F-C05")
            return
        luas_bukaan = rec.dimensi.get("luas_bukaan", 0.0)
        a = (p * l - luas_bukaan) * el.n
        ctx.assumptions.append(
            f"{el.kode}: bekisting pelat = A_neto; tepi bebas (K_tepi x t) belum dihitung (F-C05)")
        ctx.items.append(TakeoffItem(
            kode=el.kode, lantai=el.lantai, kategori=kategori, work_type="bekisting",
            quantity=_r4(a), unit="m2",
            formula="A_neto x jumlah",
            detail=f"({p:g} x {l:g} - {luas_bukaan:g}) x {el.n} = {_r4(a):g} m2",
            alamat=el.alamat, rule_id="F-C05",
        ))
        return

    if kategori == "pondasi_telapak":
        p = _dim_m(rec, "panjang") or _dim_m(rec, "panjang_bawah")
        l = _dim_m(rec, "lebar") or _dim_m(rec, "lebar_bawah")
        t = _dim_m(rec, "tinggi") or _dim_m(rec, "t")
        if p is None or l is None or t is None:
            _tambah_review(ctx, el, rec, kategori, "bekisting", "m2",
                           "butuh panjang, lebar, tinggi telapak", "F-C06")
            return
        a = 2 * (p + l) * t * el.n
        ctx.items.append(TakeoffItem(
            kode=el.kode, lantai=el.lantai, kategori=kategori, work_type="bekisting",
            quantity=_r4(a), unit="m2",
            formula="K_keliling x t x jumlah = 2 x (p + l) x t x jumlah",
            detail=f"2 x ({p:g} + {l:g}) x {t:g} x {el.n} = {_r4(a):g} m2",
            alamat=el.alamat, rule_id="F-C06",
        ))
        return


# ─── Besi (F-D) ───────────────────────────────────────────────────────────────

def _f_waste(ctx: _Ctx) -> float:
    """F-D06: mode 'param' -> 1 + waste_besi ; mode 'bbs' -> 1 (waste nyata F-D08)."""
    if ctx.params.waste_mode == "bbs":
        ctx.pakai_param("waste_mode", "bbs",
                        "waste nyata dihitung dari potongan stok (F-D08); f_waste=1 (AP-16)")
        return 1.0
    if ctx.params.waste_besi > 0:
        ctx.pakai_param("waste_besi", ctx.params.waste_besi, "waste besi mode param (F-D06)")
    return 1 + ctx.params.waste_besi


def _besi(ctx: _Ctx, el: ElementInstance, rec: TypeRecord, kategori: str,
          panjang_efektif: Optional[float]) -> None:
    if not rec.tulangan:
        return  # tidak ada spek tulangan di record — tidak ada yang bisa dihitung

    b, h = _dim_m(rec, "b"), _dim_m(rec, "h")

    if kategori == "plat":
        _besi_pelat(ctx, el, rec)
        return

    if kategori not in ("kolom", "sloof", "balok", "ring_balok", "latei", "kolom_praktis"):
        _tambah_review(ctx, el, rec, kategori, "besi", "kg",
                       f"perhitungan besi kategori '{kategori}' belum didukung irisan ini", "F-D02")
        return

    if panjang_efektif is None or b is None or h is None:
        _tambah_review(ctx, el, rec, kategori, "besi", "kg",
                       "butuh b, h, dan panjang/tinggi elemen untuk hitung besi", "F-D02")
        return

    L = panjang_efektif
    c = ctx.params.selimut_beton_m
    total_kg = 0.0
    rincian: List[str] = []
    ada_pokok = False
    ada_sengkang = False
    # Bufer potongan BBS: baru dialirkan ke ctx bila item SUKSES (bukan review),
    # supaya elemen yang gagal tidak menyumbang potongan hantu ke BBS.
    potong_lokal: List[Tuple[str, float, float, int]] = []

    def _potong(posisi: str, d: float, panjang: float, jumlah: int) -> None:
        potong_lokal.append((posisi, d, panjang, jumlah))

    # F-D02 tulangan memanjang: L_bat = L + Σ kait_ujung + Σ sambungan lewatan.
    # Kait & lewatan HANYA dihitung bila parameternya disetor (tercatat); bila
    # lewatan DIBUTUHKAN (L_bat > l_stock) tapi n_ld tidak ada -> needs_review.
    for spec in rec.tulangan:
        if spec.posisi in ("tul_atas", "tul_bawah", "tul_utama"):
            parsed = parse_rebar_raw(spec.raw) if (spec.jumlah is None or spec.diameter_mm is None) else \
                {"jumlah": float(spec.jumlah), "d": float(spec.diameter_mm)}
            if not parsed or "jumlah" not in parsed:
                _tambah_review(ctx, el, rec, kategori, "besi", "kg",
                               f"notasi tulangan '{spec.raw}' ({spec.posisi}) gagal grammar §2.2", "F-D02")
                return
            n_bat, d = parsed["jumlah"], parsed["d"]
            w = berat_per_meter(d)
            l_bat = L
            ket_ujung: List[str] = []

            if ctx.params.k_hook_utama is not None:
                kait = ctx.params.k_hook_utama * d / 1000.0
                l_bat += 2 * kait
                ctx.pakai_param("k_hook_utama", ctx.params.k_hook_utama,
                                "kait tulangan pokok per ujung = k_hook_utama x d (SNI 2847)")
                ket_ujung.append(f"kait 2 x {ctx.params.k_hook_utama:g}d = {2 * kait:.3f} m")

            if ctx.params.l_stock_m is not None:
                n_lap = max(math.ceil(l_bat / ctx.params.l_stock_m - 1e-9) - 1, 0)
                if n_lap > 0:
                    if ctx.params.n_ld is None:
                        _tambah_review(
                            ctx, el, rec, kategori, "besi", "kg",
                            f"batang {spec.raw} butuh {n_lap} sambungan lewatan "
                            f"(L={l_bat:.3f} m > stok {ctx.params.l_stock_m:g} m) "
                            f"tapi n_ld tidak disetor — dilarang mengabaikan diam-diam (F-D02)",
                            "F-D02")
                        return
                    lap = ctx.params.n_ld * d / 1000.0
                    l_bat += n_lap * lap
                    ctx.pakai_param("n_ld", ctx.params.n_ld,
                                    "panjang lewatan = n_ld x d (SNI 2847)")
                    ctx.pakai_param("l_stock_m", ctx.params.l_stock_m,
                                    "panjang stok batang; jumlah lap = ceil(L_bat/l_stock)-1 (F-D02)")
                    ket_ujung.append(f"{n_lap} lap x {ctx.params.n_ld:g}d = {n_lap * lap:.3f} m")

            kg = n_bat * l_bat * w
            total_kg += kg
            ada_pokok = True
            tambahan = f" ({'; '.join(ket_ujung)})" if ket_ujung else ""
            rincian.append(
                f"{spec.posisi} {spec.raw}: {n_bat:g} x {l_bat:g} m{tambahan} x {w:.4f} kg/m = {kg:.2f} kg")
            _potong(spec.posisi, d, l_bat, int(n_bat) * el.n)

        elif spec.posisi == "tul_pinggang":
            # F-D04: W_p = n_p x (Lb + 2 x n_ld x d) x w(d) — side bars memakai
            # penyaluran n_ld di kedua ujung, bukan kait.
            parsed = parse_rebar_raw(spec.raw) if (spec.jumlah is None or spec.diameter_mm is None) else \
                {"jumlah": float(spec.jumlah), "d": float(spec.diameter_mm)}
            if not parsed or "jumlah" not in parsed:
                _tambah_review(ctx, el, rec, kategori, "besi", "kg",
                               f"notasi tulangan pinggang '{spec.raw}' gagal grammar §2.2", "F-D04")
                return
            n_p, d_p = parsed["jumlah"], parsed["d"]
            w_p = berat_per_meter(d_p)
            l_p = L
            if ctx.params.n_ld is not None:
                l_p = L + 2 * ctx.params.n_ld * d_p / 1000.0
                ctx.pakai_param("n_ld", ctx.params.n_ld, "panjang lewatan = n_ld x d (SNI 2847)")
            else:
                ctx.assumptions.append(
                    f"{el.kode}: tulangan pinggang dihitung TANPA penyaluran ujung "
                    f"(n_ld tidak disetor — F-D04)")
            kg_p = n_p * l_p * w_p
            total_kg += kg_p
            ada_pokok = True
            rincian.append(
                f"tul_pinggang {spec.raw}: {n_p:g} x {l_p:g} m x {w_p:.4f} kg/m = {kg_p:.2f} kg (F-D04)")
            _potong(spec.posisi, d_p, l_p, int(n_p) * el.n)

    # F-D03 sengkang (zona tumpuan/lapangan atau seragam)
    seragam = next((s for s in rec.tulangan if s.posisi == "sengkang"), None)
    tumpuan = next((s for s in rec.tulangan if s.posisi == "sengkang_tumpuan"), None)
    lapangan = next((s for s in rec.tulangan if s.posisi == "sengkang_lapangan"), None)

    def _sengkang_kg(spec_raw: str, d_mm: Optional[float], s_mm: Optional[float],
                     zona: List[Tuple[float, float]],
                     posisi: str) -> Optional[Tuple[float, str]]:
        parsed = parse_rebar_raw(spec_raw) if (d_mm is None or s_mm is None) else {"d": d_mm, "s": s_mm}
        if not parsed or "s" not in parsed:
            return None
        d, s = parsed["d"], parsed["s"]
        s_m = s / 1000.0
        n_s = sum(math.floor(lz / s_m) + 1 for lz, _ in zona if lz > 0)
        hook = ctx.params.k_hook_sengkang * d / 1000.0
        l_1s = 2 * ((b - 2 * c) + (h - 2 * c)) + 2 * hook
        w = berat_per_meter(d)
        kg = n_s * l_1s * w
        _potong(posisi, d, l_1s, n_s * el.n)
        return kg, (f"sengkang {spec_raw}: n={n_s}, L1={l_1s:.4f} m "
                    f"(b-2c={b - 2 * c:g}, h-2c={h - 2 * c:g}, kait 2x{ctx.params.k_hook_sengkang:g}d), "
                    f"w={w:.4f} kg/m -> {kg:.2f} kg")

    if seragam is not None:
        hasil = _sengkang_kg(seragam.raw, seragam.diameter_mm, seragam.jarak_mm, [(L, 0.0)], "sengkang")
        if hasil is None:
            _tambah_review(ctx, el, rec, kategori, "besi", "kg",
                           f"notasi sengkang '{seragam.raw}' gagal grammar §2.2", "F-D03")
            return
        total_kg += hasil[0]
        ada_sengkang = True
        rincian.append(hasil[1])
        ctx.pakai_param("k_hook_sengkang", ctx.params.k_hook_sengkang, "kait sengkang 135° = 6db (SNI 2847)")
        ctx.pakai_param("selimut_beton_m", c, "selimut beton c (override bila spek menyebut lain)")
    elif tumpuan is not None and lapangan is not None:
        f = ctx.params.zona_tumpuan_fraksi
        zona_t = [(L * f, 0.0), (L * f, 0.0)]
        zona_l = [(L * (1 - 2 * f), 0.0)]
        hasil_t = _sengkang_kg(tumpuan.raw, tumpuan.diameter_mm, tumpuan.jarak_mm, zona_t, "sengkang_tumpuan")
        hasil_l = _sengkang_kg(lapangan.raw, lapangan.diameter_mm, lapangan.jarak_mm, zona_l, "sengkang_lapangan")
        if hasil_t is None or hasil_l is None:
            _tambah_review(ctx, el, rec, kategori, "besi", "kg",
                           "notasi sengkang tumpuan/lapangan gagal grammar §2.2", "F-D03")
            return
        total_kg += hasil_t[0] + hasil_l[0]
        ada_sengkang = True
        rincian.append("tumpuan: " + hasil_t[1])
        rincian.append("lapangan: " + hasil_l[1])
        ctx.pakai_param("zona_tumpuan_fraksi", f,
                        "panjang zona tumpuan = fraksi x L tiap ujung (konvensi; tercatat sebagai assumption)")
        ctx.pakai_param("k_hook_sengkang", ctx.params.k_hook_sengkang, "kait sengkang 135° = 6db (SNI 2847)")
        ctx.pakai_param("selimut_beton_m", c, "selimut beton c (override bila spek menyebut lain)")
        ctx.assumptions.append(
            f"{el.kode}: panjang zona sengkang tidak tertulis — dipakai konvensi tumpuan "
            f"{f:.0%} L tiap ujung, lapangan {1 - 2 * f:.0%} L (F-D03)")

    if not ada_pokok and not ada_sengkang:
        return

    # F-D06 waste (mode "param" ATAU "bbs" — AP-16) + F-D07 kelipatan instance
    f_waste = _f_waste(ctx)
    total = total_kg * f_waste * el.n
    if ada_pokok:
        if ctx.params.k_hook_utama is None:
            ctx.assumptions.append(
                f"{el.kode}: besi dihitung TANPA kait tulangan pokok "
                f"(setor k_hook_utama bila ingin dihitung — F-D02)")
        if ctx.params.l_stock_m is None:
            ctx.assumptions.append(
                f"{el.kode}: besi dihitung TANPA sambungan lewatan "
                f"(setor l_stock_m + n_ld bila ingin dihitung — F-D02)")
    for posisi, d_c, l_c, n_c in potong_lokal:
        ctx.tambah_potong(el.kode, posisi, d_c, l_c, n_c)
    ctx.items.append(TakeoffItem(
        kode=el.kode, lantai=el.lantai, kategori=kategori, work_type="besi",
        quantity=_r4(total), unit="kg",
        formula="Σ(n x L_bat x w(d)) + Σ sengkang, x f_waste x jumlah (F-D01..D04, D06-D07)",
        detail="; ".join(rincian) + f"; f_waste={f_waste:g}; x{el.n} instance = {_r4(total):g} kg",
        alamat=el.alamat, rule_id="F-D02+F-D03",
    ))


def _besi_pelat(ctx: _Ctx, el: ElementInstance, rec: TypeRecord) -> None:
    p, l = _dim_m(rec, "panjang"), _dim_m(rec, "lebar")
    if p is None or l is None:
        _tambah_review(ctx, el, rec, "plat", "besi", "kg",
                       "besi pelat butuh panjang & lebar", "F-D05")
        return
    total = 0.0
    rincian: List[str] = []
    potong_lokal: List[Tuple[str, float, float, int]] = []
    for spec in rec.tulangan:
        if spec.posisi not in ("tul_sebar_x", "tul_sebar_y"):
            continue
        parsed = parse_rebar_raw(spec.raw) if (spec.diameter_mm is None or spec.jarak_mm is None) else \
            {"d": float(spec.diameter_mm), "s": float(spec.jarak_mm)}
        if not parsed or "s" not in parsed:
            _tambah_review(ctx, el, rec, "plat", "besi", "kg",
                           f"notasi sebar '{spec.raw}' gagal grammar §2.2", "F-D05")
            return
        d, s = parsed["d"], parsed["s"] / 1000.0
        # F-D05: n_arah = floor(L_tegak_lurus / s) + 1 ; W = n_arah x L_sejajar x w(d)
        if spec.posisi == "tul_sebar_x":
            n_arah = math.floor(l / s) + 1
            kg = n_arah * p * berat_per_meter(d)
            rincian.append(f"sebar-X {spec.raw}: n={n_arah} x {p:g} m x {berat_per_meter(d):.4f} = {kg:.2f} kg")
            potong_lokal.append((spec.posisi, d, p, n_arah * el.n))
        else:
            n_arah = math.floor(p / s) + 1
            kg = n_arah * l * berat_per_meter(d)
            rincian.append(f"sebar-Y {spec.raw}: n={n_arah} x {l:g} m x {berat_per_meter(d):.4f} = {kg:.2f} kg")
            potong_lokal.append((spec.posisi, d, l, n_arah * el.n))
        total += kg
    if not rincian:
        return
    f_waste = _f_waste(ctx)
    total_akhir = total * f_waste * el.n
    for posisi, d_c, l_c, n_c in potong_lokal:
        ctx.tambah_potong(el.kode, posisi, d_c, l_c, n_c)
    ctx.items.append(TakeoffItem(
        kode=el.kode, lantai=el.lantai, kategori="plat", work_type="besi",
        quantity=_r4(total_akhir), unit="kg",
        formula="Σ_arah (floor(L_perp/s)+1) x L_par x w(d), x f_waste x jumlah (F-D05)",
        detail="; ".join(rincian) + f"; f_waste={f_waste:g}; x{el.n} = {_r4(total_akhir):g} kg",
        alamat=el.alamat, rule_id="F-D05",
    ))


# ─── BBS (F-D08) ─────────────────────────────────────────────────────────────

def _susun_bbs(ctx: _Ctx) -> Optional[BbsResult]:
    """
    F-D08: dari potongan terkumpul, susun mark BBS + kebutuhan stok + waste
    nyata per (diameter, panjang potong):
      n_per_stok     = floor(l_stock / L_potong)
      kebutuhan_stok = ceil(n_potong / n_per_stok)
      waste          = (kebutuhan_stok x l_stock - n_potong x L_potong) x w(d)
    (Optimasi cutting lintas-panjang = util terpisah, bukan irisan ini.)
    """
    if ctx.params.waste_mode != "bbs":
        return None
    stok = ctx.params.l_stock_m
    assert stok is not None  # dijamin validator TakeoffParams

    # Gabungkan potongan identik (kode, posisi, d, L dibulatkan 4 desimal)
    gabung: Dict[Tuple[str, str, float, float], int] = {}
    for kode, posisi, d, panjang, jumlah in ctx.cuts:
        kunci = (kode, posisi, d, _r4(panjang))
        gabung[kunci] = gabung.get(kunci, 0) + jumlah

    marks: List[BbsMark] = []
    for i, ((kode, posisi, d, panjang), jumlah) in enumerate(sorted(gabung.items()), start=1):
        marks.append(BbsMark(
            mark=f"M{i:03d}", kode=kode, posisi=posisi, d_mm=d,
            panjang_m=panjang, jumlah=jumlah,
            berat_kg=_r4(jumlah * panjang * berat_per_meter(d)),
        ))

    # Stok & waste per (d, L_potong), lalu rekap per diameter
    per_dl: Dict[Tuple[float, float], int] = {}
    for m in marks:
        kunci = (m.d_mm, m.panjang_m)
        per_dl[kunci] = per_dl.get(kunci, 0) + m.jumlah

    agg: Dict[float, Dict[str, float]] = {}
    for (d, panjang), n_potong in sorted(per_dl.items()):
        n_per_stok = math.floor(stok / panjang + 1e-9)
        if n_per_stok < 1:
            n_per_stok = 1  # tidak terjadi: potongan > stok sudah dipecah di tambah_potong
        kebutuhan = math.ceil(n_potong / n_per_stok - 1e-9)
        waste_m = kebutuhan * stok - n_potong * panjang
        a = agg.setdefault(d, {"n": 0, "len": 0.0, "stok": 0, "waste": 0.0})
        a["n"] += n_potong
        a["len"] += n_potong * panjang
        a["stok"] += kebutuhan
        a["waste"] += waste_m * berat_per_meter(d)

    per_diameter = [
        BbsDiameterSummary(
            d_mm=d, n_potong=int(a["n"]), total_panjang_m=_r4(a["len"]),
            kebutuhan_stok_batang=int(a["stok"]), waste_kg=_r4(a["waste"]),
        )
        for d, a in sorted(agg.items())
    ]
    return BbsResult(
        l_stock_m=stok, marks=marks, per_diameter=per_diameter,
        total_waste_kg=_r4(sum(s.waste_kg for s in per_diameter)),
    )


# ─── Entry point ──────────────────────────────────────────────────────────────

def takeoff_tkg(doc: TkgDocument, params: TakeoffParams | None = None) -> TakeoffResult:
    ctx = _Ctx(doc, params or TakeoffParams())

    for sheet in doc.sheets:
        for el in sheet.elements:
            rec = _cari_record(doc, el.kode, el.lantai)
            if rec is None:
                ctx.warnings.append(
                    f"{el.kode} ({sheet.sheet_id}): tidak ada definisi tipe di tabel manapun (W-TYP)")
                _tambah_review(ctx, el, None, kategori_dari_kode(el.kode) or "lain",
                               "beton", "m3", "definisi tipe tidak ditemukan (W-TYP)", "RULE-EXP")
                continue
            kategori = rec.kategori or kategori_dari_kode(el.kode)
            if kategori is None:
                ctx.warnings.append(
                    f"{el.kode}: prefiks kode di luar kamus §2.1 dan record tidak menyebut "
                    f"kategori — needs_review (AP-E-04: dilarang menebak)")
                _tambah_review(ctx, el, rec, "lain", "beton", "m3",
                               "kategori elemen tidak dikenali", "RULE-EXP")
                continue
            if kategori not in _KATEGORI_BETON:
                _tambah_review(ctx, el, rec, kategori, "beton", "kg",
                               f"kategori '{kategori}' (baja/atap) butuh tabel berat profil — "
                               f"belum didukung irisan ini (F-G06)", "F-G06")
                continue

            panjang_efektif = _beton(ctx, el, rec, kategori)
            _bekisting(ctx, el, rec, kategori, panjang_efektif)
            _besi(ctx, el, rec, kategori, panjang_efektif)

    n_review = sum(1 for i in ctx.items if i.needs_review)
    return TakeoffResult(
        prj_id=doc.prj_id, rev_id=doc.rev_id,
        items=ctx.items,
        assumptions=sorted(set(ctx.assumptions)),
        warnings=ctx.warnings,
        params_used=list(ctx.params_used.values()),
        n_needs_review=n_review,
        bbs=_susun_bbs(ctx),
    )
