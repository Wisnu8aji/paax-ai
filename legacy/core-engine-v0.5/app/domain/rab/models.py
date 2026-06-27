"""
Pydantic models for RAB (Rencana Anggaran Biaya).

Terminology
-----------
- Uraian Pekerjaan : Work-item description
- Satuan           : Unit (m², m³, kg, ls, unit, titik, m', bh)
- Volume           : Quantity
- Harga Satuan     : Unit price (IDR)
- Jumlah           : Amount = Volume × Harga Satuan
- PPN              : Pajak Pertambahan Nilai (VAT 11 %)
- Kontingensi      : Contingency reserve
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── Enums ───────────────────────────────────────────────────────────────────

class Satuan(str, Enum):
    """Allowed engineering units."""
    M2 = "m²"
    M3 = "m³"
    M1 = "m'"
    KG = "kg"
    BH = "bh"
    UNIT = "unit"
    LS = "ls"
    TITIK = "titik"
    SET = "set"
    BTG = "btg"
    LBR = "lbr"
    ZAK = "zak"
    LITER = "liter"
    ROLL = "roll"


class KategoriPekerjaan(str, Enum):
    """Work-item category."""
    PERSIAPAN = "persiapan"
    TANAH = "pekerjaan_tanah"
    PONDASI = "pondasi"
    STRUKTUR = "struktur"
    DINDING = "dinding"
    LANTAI = "lantai"
    ATAP = "atap"
    PINTU_JENDELA = "pintu_jendela"
    PLAFON = "plafon"
    SANITASI = "sanitasi"
    MEP = "mep"
    FINISHING = "finishing"
    LUAR = "pekerjaan_luar"


# ── Core item models ───────────────────────────────────────────────────────

class RABItem(BaseModel):
    """Single line-item in a RAB."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kode: str = Field(..., description="Kode item pekerjaan, e.g. 'A.01'")
    uraian: str = Field(..., description="Uraian pekerjaan / deskripsi item")
    satuan: Satuan
    volume: float = Field(..., gt=0, description="Volume / kuantitas")
    harga_satuan: float = Field(..., ge=0, description="Harga satuan dalam IDR")
    jumlah: float = Field(default=0.0, description="Jumlah = volume × harga_satuan")
    kategori: KategoriPekerjaan = KategoriPekerjaan.PERSIAPAN
    catatan: Optional[str] = None
    locked: bool = Field(default=False, description="Item terkunci tidak boleh dioptimasi")

    def hitung_jumlah(self) -> float:
        """Compute amount = volume × harga_satuan."""
        self.jumlah = round(self.volume * self.harga_satuan, 2)
        return self.jumlah


class RABGroup(BaseModel):
    """Group of RAB items (divisi pekerjaan)."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nama: str = Field(..., description="Nama divisi, e.g. 'Pekerjaan Struktur'")
    kategori: KategoriPekerjaan
    items: list[RABItem] = []
    subtotal: float = 0.0

    def hitung_subtotal(self) -> float:
        """Sum all item amounts in this group."""
        for item in self.items:
            item.hitung_jumlah()
        self.subtotal = round(sum(item.jumlah for item in self.items), 2)
        return self.subtotal


class RABSummary(BaseModel):
    """Calculated summary for an entire RAB."""
    subtotal: float = Field(..., description="Total sebelum pajak & kontingensi")
    ppn_rate: float = Field(default=0.11, description="Tarif PPN (11 %)")
    ppn: float = Field(default=0.0, description="PPN = subtotal × ppn_rate")
    contingency_rate: float = Field(default=0.05, description="Tarif kontingensi (5 %)")
    contingency: float = Field(default=0.0, description="Kontingensi = subtotal × contingency_rate")
    overhead_profit_rate: float = Field(default=0.10, description="Overhead & profit (10 %)")
    overhead_profit: float = Field(default=0.0, description="Overhead & profit = subtotal × rate")
    grand_total: float = Field(default=0.0, description="Grand total = subtotal + ppn + contingency + overhead_profit")


class RABVersion(BaseModel):
    """A complete RAB snapshot."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    version: int = 1
    label: str = "Draft"
    groups: list[RABGroup] = []
    summary: Optional[RABSummary] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ── Request / Response models ──────────────────────────────────────────────

class GenerateRABRequest(BaseModel):
    """Request body for POST /rab/generate."""
    project_id: str
    project_type: str = Field(..., description="Tipe proyek: rumah_tinggal, gedung, jalan, jembatan, irigasi")
    luas_bangunan: float = Field(..., gt=0, description="Luas bangunan (m²)")
    jumlah_lantai: int = Field(default=1, ge=1, le=50)
    lokasi: str = Field(default="jakarta", description="Kota lokasi proyek")
    kelas_bangunan: str = Field(default="menengah", description="Kelas: sederhana, menengah, mewah")


class RecalculateRABRequest(BaseModel):
    """Request body for POST /rab/recalculate — pass existing items to recompute."""
    project_id: str
    groups: list[RABGroup]
    ppn_rate: float = 0.11
    contingency_rate: float = 0.05
    overhead_profit_rate: float = 0.10


class ReviewRABRequest(BaseModel):
    """Request for AI-assisted review — deterministic checks + flagging."""
    project_id: str
    groups: list[RABGroup]


class OptimizeRABRequest(BaseModel):
    """Request to optimise budget while preserving structural items."""
    project_id: str
    groups: list[RABGroup]
    target_reduction_pct: float = Field(default=10.0, ge=1, le=50, description="Target pengurangan (%)")


class RABWarning(BaseModel):
    """Single warning / flag from review or validation."""
    severity: str = Field(..., description="info | warning | error")
    code: str
    message: str
    item_id: Optional[str] = None
    suggestion: Optional[str] = None


class ReviewRABResponse(BaseModel):
    """Response from POST /rab/review."""
    project_id: str
    warnings: list[RABWarning] = []
    score: float = Field(default=100.0, description="RAB health score 0-100")


class OptimizeRABResponse(BaseModel):
    """Response from POST /rab/optimize."""
    project_id: str
    original_total: float
    optimized_total: float
    savings: float
    savings_pct: float
    groups: list[RABGroup]
    changes: list[str] = Field(default_factory=list, description="Daftar perubahan yang dilakukan")
