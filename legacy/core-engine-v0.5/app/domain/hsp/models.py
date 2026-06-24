"""
Pydantic models for AHSP (Analisa Harga Satuan Pekerjaan).

An AHSP recipe breaks down a work item into components:
- Tenaga (labour)
- Bahan (material)
- Alat (equipment)

Each component has a koefisien (coefficient) and harga (price).
The harga satuan pekerjaan = Σ (koefisien × harga) for all components.
"""

from __future__ import annotations

import uuid
from enum import Enum

from pydantic import BaseModel, Field


class KomponenTipe(str, Enum):
    TENAGA = "tenaga"
    BAHAN = "bahan"
    ALAT = "alat"


class AHSPKomponen(BaseModel):
    """Single component in an AHSP recipe."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tipe: KomponenTipe
    uraian: str = Field(..., description="Nama komponen, e.g. 'Pekerja (tukang batu)'")
    satuan: str = Field(..., description="Satuan komponen, e.g. 'OH', 'kg', 'jam'")
    koefisien: float = Field(..., description="Koefisien pemakaian")
    harga: float = Field(..., ge=0, description="Harga satuan komponen (IDR)")
    jumlah: float = Field(default=0.0, description="koefisien × harga")

    def hitung(self) -> float:
        self.jumlah = round(self.koefisien * self.harga, 2)
        return self.jumlah


class AHSPRecipe(BaseModel):
    """Complete AHSP recipe for a work item."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kode_analisa: str = Field(..., description="Kode analisa, e.g. 'SNI.01'")
    uraian_pekerjaan: str = Field(..., description="Nama pekerjaan")
    satuan_pekerjaan: str = Field(..., description="Satuan hasil, e.g. 'm³'")
    komponen: list[AHSPKomponen] = []
    harga_satuan: float = Field(default=0.0, description="Harga satuan pekerjaan = Σ jumlah")

    def hitung_harga_satuan(self) -> float:
        for k in self.komponen:
            k.hitung()
        self.harga_satuan = round(sum(k.jumlah for k in self.komponen), 2)
        return self.harga_satuan
