"""
PAAX Core Engine — Data Models (Pydantic v2)

Aturan emas: SEMUA angka di sini dihitung secara deterministik dari koefisien AHSP
dan harga satuan. Tidak ada LLM yang menyentuh perhitungan. LLM (di service lain)
hanya boleh MENJELASKAN angka-angka ini, tidak pernah MENGHITUNGNYA.
"""
from __future__ import annotations
from typing import Literal, Optional, List
from pydantic import BaseModel, Field

Category = Literal["bahan", "upah", "alat"]


# ----------------------------- Input / Referensi -----------------------------
class Component(BaseModel):
    """Satu komponen dalam analisa (bahan/upah/alat) beserta koefisiennya."""
    resource_code: str
    category: Category
    coefficient: float


class AHSPItem(BaseModel):
    """Satu item Analisa Harga Satuan Pekerjaan."""
    code: str
    name: str
    unit: str
    bidang: str = ""
    source: str = ""
    overhead_profit: float = 0.10  # BUK (Biaya Umum & Keuntungan), maks. 15% per Permen
    components: List[Component]


class ResourcePrice(BaseModel):
    """Harga satuan sumber daya (bahan/upah/alat) untuk satu wilayah."""
    code: str
    name: str
    category: Category
    unit: str
    price: float


# ----------------------------- Output: HSP -----------------------------
class ComponentCost(BaseModel):
    resource_code: str
    resource_name: str
    category: Category
    unit: str
    coefficient: float
    unit_price: float
    subtotal: float  # coefficient * unit_price


class HSPBreakdown(BaseModel):
    """Rincian Harga Satuan Pekerjaan yang sepenuhnya dapat diaudit."""
    ahsp_code: str
    name: str
    unit: str
    bahan: float           # A = Σ komponen bahan
    upah: float            # B = Σ komponen upah
    alat: float            # C = Σ komponen alat
    base: float            # A + B + C
    overhead_profit: float          # persentase (mis. 0.10)
    overhead_profit_value: float    # base * overhead_profit
    hsp: float             # base + overhead_profit_value
    components: List[ComponentCost]


# ----------------------------- Output: RAB -----------------------------
class RABLineInput(BaseModel):
    ahsp_code: str
    volume: float
    duration_days: Optional[int] = None   # untuk penjadwalan / Kurva S
    description: Optional[str] = None
    section: Optional[str] = None          # kode seksi WBS (I..VII) untuk /rab/build


class RABLine(BaseModel):
    ahsp_code: str
    name: str
    unit: str
    volume: float
    hsp: float
    amount: float          # volume * hsp
    weight_pct: float      # bobot = amount / subtotal * 100


class RABResult(BaseModel):
    region: str
    region_code: str
    lines: List[RABLine]
    subtotal: float
    ppn_rate: float
    ppn: float
    total: float


# ----------------------------- Output: Kurva S -----------------------------
class SCurvePoint(BaseModel):
    period: int            # indeks periode (mis. minggu ke-1, ke-2, ...)
    day_start: int
    day_end: int
    planned_pct: float       # bobot rencana pada periode ini
    cumulative_pct: float    # akumulasi bobot rencana


class SCurveResult(BaseModel):
    total_days: int
    period_days: int
    mode: str
    points: List[SCurvePoint]
