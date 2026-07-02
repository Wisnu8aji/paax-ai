"""
PAAX Core Engine — Model TKG (Transkrip Kanonik Gambar).

Skema mengikuti docs/specs/brain-v4.1/PAAX_BRAIN_00_EKSTRAKSI_GAMBAR_KERJA.txt
§6 (kontrak keluaran TkgDocument) — subset pragmatis yang bisa diisi lewat
tiga jalur: usulan AI (vision), input manual pengguna, atau pipeline persepsi
penuh nanti (v1.0). Paritas Zod ada di packages/schemas (blok TKG).

INV-TKG-05: TKG BUKAN RAB — tidak ada harga/AHSP/ekspansi di sini.
INV-TKG-03: nilai raw disimpan berdampingan dengan nilai normal.
"""
from __future__ import annotations
from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field


# ─── Grid (§3.1.1) ────────────────────────────────────────────────────────────

class GridAxis(BaseModel):
    label: str                        # "A", "B", "1", "2", ...
    posisi_mm: Optional[float] = None # posisi kumulatif (mm) bila diketahui


class GridSpan(BaseModel):
    dari: str                         # label as awal
    ke: str                           # label as akhir (bersebelahan)
    nilai: float                      # jarak antar-as
    unit: Literal["mm", "cm", "m"] = "mm"
    raw: Optional[str] = None         # teks asli di gambar (INV-TKG-03)


class GridTotal(BaseModel):
    dari: str
    ke: str
    nilai: float
    unit: Literal["mm", "cm", "m"] = "mm"
    raw: Optional[str] = None


class Grid(BaseModel):
    sumbu_x: List[GridAxis] = Field(default_factory=list)   # as huruf/angka arah X
    sumbu_y: List[GridAxis] = Field(default_factory=list)
    bentang_x: List[GridSpan] = Field(default_factory=list)
    bentang_y: List[GridSpan] = Field(default_factory=list)
    total_x: Optional[GridTotal] = None
    total_y: Optional[GridTotal] = None
    offset_tepi: List[GridSpan] = Field(default_factory=list)  # di LUAR as ujung (§3.1.1c)


# ─── Level / peil (§2.5) ──────────────────────────────────────────────────────

class Level(BaseModel):
    label_raw: str                    # mis. "SFL +0.000", "EL -1.500"
    nilai_m: float                    # meter, tanda +/- wajib benar
    lantai: Optional[str] = None      # mis. "LT1"


# ─── Tulangan (§2.2) ──────────────────────────────────────────────────────────

RebarPosisi = Literal[
    "tul_atas", "tul_bawah", "tul_pinggang", "tul_utama", "tul_sebar_x",
    "tul_sebar_y", "sengkang", "sengkang_tumpuan", "sengkang_lapangan",
]


class RebarSpec(BaseModel):
    posisi: RebarPosisi
    raw: str                          # notasi asli, mis. "12D16", "D10-150"
    jumlah: Optional[int] = None      # n batang (tulangan pokok)
    diameter_mm: Optional[float] = None
    jarak_mm: Optional[float] = None  # jarak s (sengkang/sebar)
    jenis: Literal["D", "O"] = "D"    # D = ulir (BJTS), O = polos (Ø/BJTP)


# ─── Tabel/Schedule (§3.2) ────────────────────────────────────────────────────

TypeKategori = Literal[
    "pondasi_telapak", "pondasi_menerus", "sloof", "kolom", "kolom_praktis",
    "balok", "ring_balok", "latei", "plat", "tangga", "kuda_kuda", "gording",
    "ikatan_angin", "trekstang", "lain",
]


class TypeRecord(BaseModel):
    """Satu record tabel = satu (kode, lantai) — JANGAN dirata-ratakan (§3.2.3)."""
    kode: str                          # "K1", "S1", "SL1", ... (sufiks = varian beda!)
    lantai: Optional[str] = None
    kategori: Optional[TypeKategori] = None  # bila kosong, diturunkan dari prefiks kode
    dimensi: Dict[str, float] = Field(default_factory=dict)
    # kunci dimensi lazim: b, h (penampang), t (tebal pelat), panjang, lebar,
    # tinggi, panjang_bawah/lebar_bawah/panjang_atas/lebar_atas (telapak miring)
    satuan_dimensi: Literal["mm", "cm", "m"] = "mm"   # default mm utk beton (§2.3)
    tulangan: List[RebarSpec] = Field(default_factory=list)
    mutu_beton: Optional[str] = None   # simpan persis ("fc' 25" / "K-300") — F-B10 urusan engine
    keterangan: Optional[str] = None
    raw_cells: Optional[Dict[str, str]] = None  # sel asli tabel (INV-TKG-03)


class TkgTable(BaseModel):
    judul: str
    records: List[TypeRecord] = Field(default_factory=list)


# ─── Elemen terpasang di denah (§5 RULE-EXT-23) ──────────────────────────────

class RuasGrid(BaseModel):
    """Elemen memanjang: ruas dari-as ke-as (mis. sloof di as 2, dari A ke C)."""
    sumbu: Literal["x", "y"]          # arah ruas mengikuti sumbu mana
    dari: str                          # label as awal
    ke: str                            # label as akhir
    pada: Optional[str] = None         # as tegak lurus tempat ruas berada


class ElementInstance(BaseModel):
    kode: str                          # harus cocok kode TypeRecord (V-04)
    alamat: str                        # bahasa grid: "as C/2", "antara as A-C pada as 2"
    bentuk: Literal["titik", "ruas", "bidang"] = "titik"
    n: int = 1
    count_simbol: Optional[int] = None # dua metode hitung independen (V-05)
    count_label: Optional[int] = None
    lantai: Optional[str] = None
    ruas: Optional[RuasGrid] = None    # utk bentuk=ruas: panjang dihitung dari grid
    panjang_m: Optional[float] = None  # panjang TERTULIS di gambar (prioritas > grid)


# ─── Dimensi & anotasi lepas ──────────────────────────────────────────────────

class Dimension(BaseModel):
    nilai: float
    unit: Literal["mm", "cm", "m"] = "mm"
    anchor: str                        # ke objek/lokasi apa dimensi ini terikat
    raw: Optional[str] = None
    target_kode: Optional[str] = None  # kode elemen yang dirujuk, bila ada


# ─── Sheet & dokumen ──────────────────────────────────────────────────────────

SheetJenis = Literal[
    "denah", "tabel", "detail", "potongan", "tampak", "denah_atap",
    "notes", "campuran",
]


class SheetMeta(BaseModel):
    judul: str
    nomor: Optional[str] = None        # mis. "S-05"
    skala: Optional[str] = None        # mis. "1:100" / "NTS"
    disiplin: Optional[str] = None     # STR / ARS / MEP


class Unclassified(BaseModel):
    raw: str
    alasan: str


class TkgSheet(BaseModel):
    sheet_id: str
    jenis: SheetJenis
    meta: SheetMeta
    grid: Optional[Grid] = None
    levels: List[Level] = Field(default_factory=list)
    tables: List[TkgTable] = Field(default_factory=list)
    elements: List[ElementInstance] = Field(default_factory=list)
    dimensions: List[Dimension] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)
    unclassified: List[Unclassified] = Field(default_factory=list)


class TkgDocument(BaseModel):
    prj_id: str
    rev_id: str = "R0"
    file_hash: Optional[str] = None
    locale: str = "id-ID"
    satuan_default: Literal["mm", "cm", "m"] = "mm"
    generated_by: str = "manual"       # "manual" | "ai_proposal" | "pipeline"
    sheets: List[TkgSheet] = Field(default_factory=list)


# ─── Hasil validasi (§7) ──────────────────────────────────────────────────────

class TkgIssue(BaseModel):
    code: str                          # E-GRID, W-TYP, W-DEF, W-CNT, W-LVL, ...
    severity: Literal["error", "warning"]
    sheet_id: Optional[str] = None
    message: str
    subject: Optional[str] = None      # kode elemen / label as terkait


class TkgValidationResult(BaseModel):
    ok: bool                           # tidak ada error (warning boleh ada)
    gate_passed: bool                  # lolos gerbang §7 (error=0 DAN dual-count beres)
    n_errors: int
    n_warnings: int
    issues: List[TkgIssue]
    type_index: Dict[str, Dict[str, List[str]]]
    # kode -> {"definisi": [sheet_id...], "instance": [sheet_id...]}
    orphans_tanpa_definisi: List[str]
    orphans_tanpa_instance: List[str]
