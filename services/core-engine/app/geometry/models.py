"""
PAAX Core Engine — Model Geometri → Volume.

Jembatan visi PAAX: AI membaca gambar kerja & mengeluarkan DIMENSI per elemen
(mis. kolom K1: lebar 0.3, tebal 0.4, tinggi 3.5, jumlah 5). ENGINE yang
menghitung volume/luas-nya — deterministik, auditable. AI tidak pernah
menghitung angka; ia hanya menyetor dimensi & tipe elemen.
"""
from __future__ import annotations
from typing import Dict
from pydantic import BaseModel


class VolumeRequest(BaseModel):
    element_type: str            # mis. "kolom", "balok", "dinding"
    dims: Dict[str, float]       # mis. {"lebar":0.3,"tebal":0.4,"tinggi":3.5,"jumlah":5}


class VolumeResult(BaseModel):
    element_type: str
    unit: str                    # "m3" | "m2" | "m"
    volume: float                # hasil deterministik
    formula: str                 # rumus simbolik, mis. "lebar x tebal x tinggi x jumlah"
    detail: str                  # substitusi angka, mis. "0.3 x 0.4 x 3.5 x 5 = 2.1 m3"
    inputs: Dict[str, float]     # dimensi efektif yang dipakai (termasuk default)


class ElementSpec(BaseModel):
    element_type: str
    unit: str
    needs: list[str]             # dimensi wajib
    optional: Dict[str, float]   # dimensi opsional + default
    formula: str
    description: str
