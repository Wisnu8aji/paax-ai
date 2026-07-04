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


class SheetSummary(BaseModel):
    page: int
    sheet_id: str
    zone: Optional[str] = None
    judul: str
    skala: Optional[str] = None


class ElementInstanceRef(BaseModel):
    sheet_page: int
    alamat: str
    catatan: Optional[str] = None


class ElementDefinisi(BaseModel):
    dimensi: Dict[str, float] = Field(default_factory=dict)
    satuan_dimensi: str = "mm"
    tulangan: List[RebarSpec] = Field(default_factory=list)
    mutu_beton: Optional[str] = None
    sumber_halaman: Optional[int] = None


class ElementRegistryEntry(BaseModel):
    kode: str
    kategori: Optional[str] = None
    instances: List[ElementInstanceRef] = Field(default_factory=list)
    definisi: Optional[ElementDefinisi] = None
    status: Literal["terbaca", "perlu_review"] = "terbaca"


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
