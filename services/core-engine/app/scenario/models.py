"""
PAAX Core Engine — Model Simulasi Skenario (What-If).

Semua angka deterministik. Durasi dihitung dari produktivitas AHSP
(orang-hari/OH), biaya dari engine RAB. Tidak ada LLM di sini.

Rumus kanonik (MASTER_PLAN §11.3-§11.4):
    mandays_item   = volume × Σ(koef upah)           ; koef tenaga dalam OH
    durasi_item    = mandays_item ÷ jumlah pekerja
    durasi proyek  = Σ durasi (sequential) | max durasi (parallel)
    biaya tenaga   = Σ volume × upah_HSP × (1 + overhead_profit)
"""
from __future__ import annotations
from typing import List, Literal
from pydantic import BaseModel, Field


class ScenarioLineInput(BaseModel):
    ahsp_code: str
    volume: float
    workers: int = Field(default=4, ge=1)  # jumlah pekerja efektif untuk item ini


class ScenarioConfig(BaseModel):
    region_code: str = "jateng"
    ppn_rate: float = 0.11
    base_mode: Literal["sequential", "parallel"] = "sequential"
    crew_factor: float = Field(default=2.0, gt=0)        # pengali crew untuk skenario "tambah_crew"
    overtime_speedup: float = Field(default=1.25, gt=0)  # laju kerja saat lembur (×)
    overtime_cost_factor: float = Field(default=1.4, gt=0)  # pengali biaya tenaga saat lembur
    lines: List[ScenarioLineInput]


class ItemSchedule(BaseModel):
    ahsp_code: str
    name: str
    unit: str
    volume: float
    labor_oh_per_unit: float   # Σ koef upah (OH per satuan)
    mandays: float             # volume × labor_oh_per_unit
    workers: int
    duration_days: float       # mandays ÷ workers


class ScenarioCandidate(BaseModel):
    key: str
    label: str
    total_days: float
    total_cost: float          # total proyek termasuk PPN
    delta_days: float          # selisih hari vs baseline
    delta_cost: float          # selisih biaya vs baseline
    delta_days_pct: float
    delta_cost_pct: float
    note: str


class ScenarioResult(BaseModel):
    region: str
    region_code: str
    base_mode: str
    items: List[ItemSchedule]
    baseline_total_days: float
    baseline_total_cost: float
    baseline_labor_cost: float   # porsi tenaga kerja dari subtotal (auditable)
    candidates: List[ScenarioCandidate]
