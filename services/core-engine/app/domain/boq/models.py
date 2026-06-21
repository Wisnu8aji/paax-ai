"""
Pydantic models for BOQ (Bill of Quantities).
"""

from __future__ import annotations

import uuid
from typing import Optional

from pydantic import BaseModel, Field


class BOQItem(BaseModel):
    """Single line in a BOQ."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    no: str = Field(..., description="Nomor urut, e.g. '1.1'")
    uraian: str = Field(..., description="Uraian pekerjaan")
    satuan: str
    volume: float = Field(..., gt=0)
    harga_satuan: float = Field(..., ge=0)
    jumlah: float = 0.0
    keterangan: Optional[str] = None


class BOQSection(BaseModel):
    """Section in a BOQ (e.g. Pekerjaan Struktur)."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nomor: str
    nama: str
    items: list[BOQItem] = []
    subtotal: float = 0.0


class BOQDocument(BaseModel):
    """Complete BOQ document."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    judul: str = "Bill of Quantities"
    sections: list[BOQSection] = []
    total: float = 0.0
