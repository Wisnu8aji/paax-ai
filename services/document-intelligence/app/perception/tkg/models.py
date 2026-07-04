"""
PAAX Document Intelligence — MIRROR skema TkgDocument kanonik (Fase 2 P1).

Mirror PERSIS `services/core-engine/app/tkg/models.py` (nama field & Literal
harus identik) supaya pipeline persepsi mengeluarkan bentuk yang bisa
langsung di-`validate_tkg`/`takeoff_tkg` core-engine. Dua service Python
terpisah -> tidak ada import lintas-service; paritas dijaga lewat
`test_perception_tkg_contract.py` (bandingkan `model_fields`).

INV-TKG-05: TKG BUKAN RAB — tidak ada harga/AHSP/ekspansi di sini.
INV-TKG-03: raw disimpan berdampingan nilai normal.
"""
from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class GridAxis(BaseModel):
    label: str
    posisi_mm: Optional[float] = None


class GridSpan(BaseModel):
    dari: str
    ke: str
    nilai: float
    unit: Literal["mm", "cm", "m"] = "mm"
    raw: Optional[str] = None


class GridTotal(BaseModel):
    dari: str
    ke: str
    nilai: float
    unit: Literal["mm", "cm", "m"] = "mm"
    raw: Optional[str] = None


class Grid(BaseModel):
    sumbu_x: List[GridAxis] = Field(default_factory=list)
    sumbu_y: List[GridAxis] = Field(default_factory=list)
    bentang_x: List[GridSpan] = Field(default_factory=list)
    bentang_y: List[GridSpan] = Field(default_factory=list)
    total_x: Optional[GridTotal] = None
    total_y: Optional[GridTotal] = None
    offset_tepi: List[GridSpan] = Field(default_factory=list)


class Level(BaseModel):
    label_raw: str
    nilai_m: float
    lantai: Optional[str] = None


RebarPosisi = Literal[
    "tul_atas", "tul_bawah", "tul_pinggang", "tul_utama", "tul_sebar_x",
    "tul_sebar_y", "sengkang", "sengkang_tumpuan", "sengkang_lapangan",
]


class RebarSpec(BaseModel):
    posisi: RebarPosisi
    raw: str
    jumlah: Optional[int] = None
    diameter_mm: Optional[float] = None
    jarak_mm: Optional[float] = None
    jenis: Literal["D", "O"] = "D"


TypeKategori = Literal[
    "pondasi_telapak", "pondasi_menerus", "sloof", "kolom", "kolom_praktis",
    "balok", "ring_balok", "latei", "plat", "dinding_beton", "tangga",
    "kuda_kuda", "gording", "ikatan_angin", "trekstang", "lain",
]


class TypeRecord(BaseModel):
    kode: str
    lantai: Optional[str] = None
    kategori: Optional[TypeKategori] = None
    dimensi: Dict[str, float] = Field(default_factory=dict)
    satuan_dimensi: Literal["mm", "cm", "m"] = "mm"
    tulangan: List[RebarSpec] = Field(default_factory=list)
    mutu_beton: Optional[str] = None
    keterangan: Optional[str] = None
    raw_cells: Optional[Dict[str, str]] = None


class TkgTable(BaseModel):
    judul: str
    records: List[TypeRecord] = Field(default_factory=list)


class RuasGrid(BaseModel):
    sumbu: Literal["x", "y"]
    dari: str
    ke: str
    pada: Optional[str] = None


class ElementInstance(BaseModel):
    kode: str
    alamat: str
    bentuk: Literal["titik", "ruas", "bidang"] = "titik"
    n: int = 1
    count_simbol: Optional[int] = None
    count_label: Optional[int] = None
    lantai: Optional[str] = None
    ruas: Optional[RuasGrid] = None
    panjang_m: Optional[float] = None


class Dimension(BaseModel):
    nilai: float
    unit: Literal["mm", "cm", "m"] = "mm"
    anchor: str
    raw: Optional[str] = None
    target_kode: Optional[str] = None


SheetJenis = Literal[
    "denah", "tabel", "detail", "potongan", "tampak", "denah_atap",
    "notes", "campuran",
]


class SheetMeta(BaseModel):
    judul: str
    nomor: Optional[str] = None
    skala: Optional[str] = None
    disiplin: Optional[str] = None


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
    generated_by: str = "manual"
    sheets: List[TkgSheet] = Field(default_factory=list)
