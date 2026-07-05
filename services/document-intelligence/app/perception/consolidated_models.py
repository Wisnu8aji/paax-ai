"""
PAAX Document Intelligence — Skema `ConsolidatedExtraction` (Fase E, rencana
besar 2026-07-05: `docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`).

Template OUTPUT TETAP untuk gambar APA PUN (feedback owner eksplisit: "AI
mengisi template", bukan "AI mengarang bentuk baru tiap kali") — field
SELALU ADA dengan nilai kosong/null yang jujur bila suatu gambar tidak
punya data itu, BUKAN field yang muncul-hilang tergantung isi gambar
tertentu (mis. PLHUT).

INV-TKG-05 tetap berlaku: ini murni STRUKTURISASI hasil persepsi, TIDAK ADA
angka RAB/HSP/biaya di sini.
"""
from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from app.perception.tkg.models import Grid, RebarSpec


class AiZoneSuggestion(BaseModel):
    """Usulan AI-assist (Fase X2) utk sheet yang gagal diklasifikasi
    rule-based (`zone is None`). TIDAK PERNAH menimpa `zone` asli -- murni
    metadata tambahan menunggu review manusia. Lihat `CLAUDE.md` §1.1 dan
    `app/perception/ai_assist/zone_assist.py`."""
    zone: str
    confidence: float
    reasoning: str
    model: str
    generated_at: str


class SheetSummary(BaseModel):
    page: int
    sheet_id: str
    zone: Optional[str] = None
    judul: str
    skala: Optional[str] = None
    zone_ai_suggestion: Optional[AiZoneSuggestion] = None


class ElementInstanceRef(BaseModel):
    sheet_page: int
    alamat: str
    kode_raw: Optional[str] = None
    catatan: Optional[str] = None


class ElementDefinisi(BaseModel):
    dimensi: Dict[str, float] = Field(default_factory=dict)
    satuan_dimensi: str = "mm"
    tulangan: List[RebarSpec] = Field(default_factory=list)
    mutu_beton: Optional[str] = None
    sumber_halaman: Optional[int] = None


class AiDimensionSuggestion(BaseModel):
    """Usulan AI-assist (Fase X2) utk dimensi elemen yang tidak lengkap dari
    rule-based (mis. `pondasi_telapak` yang dimensinya hanya ada di halaman
    detail/grafis, bukan tabel kode-dimensi -- temuan X1/X1B). TIDAK PERNAH
    dipakai langsung sbg input `core-engine` -- ini murni kandidat yang
    sudah lolos validasi deterministik (anti-halusinasi angka + rentang
    wajar), menunggu gerbang review manusia. Lihat `CLAUDE.md` §1.1 dan
    `app/perception/ai_assist/dimension_assist.py`."""
    b_mm: Optional[float] = None
    l_mm: Optional[float] = None
    d_gali_mm: Optional[float] = None
    confidence: float
    reasoning: str
    source_texts: List[str] = Field(default_factory=list)
    model: str
    generated_at: str


class AiDindingSuggestion(BaseModel):
    """Usulan AI-assist (2026-07-05, lanjutan Fase X2) utk dinding pasangan
    bata -- kategori yang TIDAK PERNAH dideteksi rule-based sama sekali
    (tidak ada kode per-segmen spt kolom/footplat, lihat audit B0
    `docs/ai-map/STATE.md`). Diisi HANYA dari catatan teks eksplisit ttg
    panjang/tinggi dinding yang sudah diekstrak PyMuPDF -- BUKAN dari
    deteksi geometri garis gambar (di luar cakupan slice ini). Lihat
    `app/perception/ai_assist/wall_assist.py`."""
    l_dinding_m: Optional[float] = None
    h_dinding_m: Optional[float] = None
    bukaan_total_m2: Optional[float] = None
    plester_sisi: int = 0
    acian: bool = False
    cat: bool = False
    confidence: float
    reasoning: str
    source_texts: List[str] = Field(default_factory=list)
    model: str
    generated_at: str


class AiRoofFrameSuggestion(BaseModel):
    """Usulan AI-assist (2026-07-05, lanjutan Fase X2) utk rangka atap
    non-beton (`gording`/`trekstang`/`ikatan_angin`) -- kategori ini SUDAH
    dikenali taksonomi (kode GORDING/GD, TS, IA) tapi belum pernah dihitung
    krn `app/tkg/takeoff.py` tidak punya cabang utk kategori ini (rumus ada
    di `app/takeoff/atap.py`, butuh field numerik spesifik per kategori).
    `fields` berisi SEMUA field yang dibutuhkan rumus kategori itu (semua
    WAJIB lengkap, beda dari footplat yang boleh sebagian). Lihat
    `app/perception/ai_assist/roof_frame_assist.py`."""
    kategori: str
    fields: Dict[str, float] = Field(default_factory=dict)
    confidence: float
    reasoning: str
    source_texts: List[str] = Field(default_factory=list)
    model: str
    generated_at: str


class AiKudaKudaSuggestion(BaseModel):
    """Usulan AI-assist utk kuda_kuda (rangka utama atap, profil baja).
    kg_per_m WAJIB dari teks eksplisit gambar -- TIDAK PERNAH dari
    pengetahuan umum model (app/takeoff/baja.py: "berat profil adalah
    DATA"). Lihat app/perception/ai_assist/kuda_kuda_assist.py."""
    designation: str
    kg_per_m: float
    length_m: float
    qty: int
    confidence: float
    reasoning: str
    source_texts: List[str] = Field(default_factory=list)
    model: str
    generated_at: str


class AiKusenSuggestion(BaseModel):
    """Usulan AI-assist (2026-07-05, lanjutan Fase X2) utk SATU baris jadwal
    kusen pintu/jendela. TIDAK PERNAH diikat ke kode asli di gambar --
    kode tipe kusen (mis. "P1") SERING bentrok dgn prefiks taksonomi lain
    (P1 = pondasi_telapak) -- lihat `app/perception/ai_assist/
    kusen_assist.py`. Selalu jadi entry sintetis berprefiks aman
    (`KUSEN-AUTO-...`)."""
    tipe: str
    width_m: Optional[float] = None
    height_m: Optional[float] = None
    qty: Optional[int] = None
    confidence: float
    reasoning: str
    source_texts: List[str] = Field(default_factory=list)
    model: str
    generated_at: str


class AiMepSuggestion(BaseModel):
    """Usulan AI-assist (2026-07-05, lanjutan Fase X2, slice TERAKHIR
    rangkaian) utk SATU jenis titik MEP (lampu/stop kontak/saklar/dll).
    HANYA dari catatan jumlah eksplisit di teks -- deteksi simbol/ikon dari
    piksel TIDAK dicoba (vision-on-pixel tetap dihindari, `CLAUDE.md`
    §1.1). Lihat `app/perception/ai_assist/mep_assist.py`."""
    jenis: str
    count: Optional[int] = None
    confidence: float
    reasoning: str
    source_texts: List[str] = Field(default_factory=list)
    model: str
    generated_at: str


class ElementRegistryEntry(BaseModel):
    kode: str
    kode_asli: List[str] = Field(default_factory=list)
    kategori: Optional[str] = None
    instances: List[ElementInstanceRef] = Field(default_factory=list)
    definisi: Optional[ElementDefinisi] = None
    status: Literal["terbaca", "perlu_review"] = "terbaca"
    ai_dimension_suggestion: Optional[AiDimensionSuggestion] = None
    ai_dinding_suggestion: Optional[AiDindingSuggestion] = None
    ai_roof_frame_suggestion: Optional[AiRoofFrameSuggestion] = None
    ai_kuda_kuda_suggestion: Optional[AiKudaKudaSuggestion] = None
    ai_kusen_suggestion: Optional[AiKusenSuggestion] = None
    ai_mep_suggestion: Optional[AiMepSuggestion] = None


class Assumption(BaseModel):
    pernyataan: str
    alasan: str
    sheet_page: Optional[int] = None
    dampak: Literal["rendah", "sedang", "tinggi"] = "sedang"


class BuildingDimensions(BaseModel):
    total_x_mm: Optional[float] = None
    total_y_mm: Optional[float] = None
    sumber: Literal["grid", "bounding_box_elemen", "tidak_tersedia"] = "tidak_tersedia"


class ConsolidatedExtraction(BaseModel):
    sheets: List[SheetSummary] = Field(default_factory=list)
    grid: Optional[Grid] = None
    element_registry: List[ElementRegistryEntry] = Field(default_factory=list)
    assumptions: List[Assumption] = Field(default_factory=list)
    building_dimensions: BuildingDimensions = Field(default_factory=BuildingDimensions)
