"""
PAAX Site Agent — Models (Pydantic v2)

Aturan emas:
  - actual_progress_pct HANYA bisa diisi manusia (role=lapangan/pm/owner).
  - TIDAK ADA proses otomatis/AI yang mengisi actual_progress_pct.
  - DILARANG KERAS: import google.generativeai, vision LLM, atau apapun yang
    menganalisa gambar. Vision-LLM tetap ditunda per SAYA.md §1.1.
"""
from __future__ import annotations
from typing import Optional, Literal
from pydantic import BaseModel, Field


# ==================== Input ====================
class SiteLogInput(BaseModel):
    """Laporan harian lapangan — HANYA diisi manusia terverifikasi."""
    project_id: str
    date: str  # ISO date: "2026-07-07"
    weather: Optional[Literal["cerah", "mendung", "hujan_ringan", "hujan_deras"]] = None
    workers_count: Optional[int] = None
    notes: Optional[str] = None
    actual_progress_pct: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Persentase progres aktual (0-100). WAJIB diisi manusia, tidak pernah otomatis."
    )
    photo_refs: list[str] = Field(
        default_factory=list,
        description="Daftar path/URL foto sebagai referensi. Analisa AI atas foto DITUNDA (v2.0)."
    )


# ==================== Output ====================
class SiteLogRecord(SiteLogInput):
    """Laporan harian tersimpan."""
    id: str
    created_at: str


# Ambang on_track: |deviation| <= ON_TRACK_THRESHOLD_PCT
# Didefinisikan eksplisit di sini (bukan implisit) — lihat report R14 untuk alasan pemilihan nilai.
ON_TRACK_THRESHOLD_PCT: float = 2.0


class DeviationResult(BaseModel):
    """Hasil perbandingan rencana-vs-realisasi deterministik."""
    project_id: str
    date: str
    planned_progress_pct: float   # dari core-engine /schedule/s-curve
    actual_progress_pct: float    # dari SiteLogInput manusia
    deviation_pct: float          # actual - planned (pengurangan sederhana, bukan pelanggaran Aturan Emas)
    status: Literal["on_track", "behind", "ahead"]
    threshold_pct: float = ON_TRACK_THRESHOLD_PCT
