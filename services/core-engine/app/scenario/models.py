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
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class ScenarioLineInput(BaseModel):
    ahsp_code: str
    volume: float
    workers: int = Field(default=4, ge=1)  # jumlah pekerja efektif untuk item ini


class ScenarioParams(BaseModel):
    crew_multiplier: float = Field(default=1.0, gt=0)
    shifts: int = Field(default=1, ge=1)
    efficiency: float = Field(default=1.0, gt=0)
    target_days: Optional[float] = Field(default=None, gt=0)
    shift_premium_rate: float = Field(default=0.3, ge=0)


class ScenarioConfig(BaseModel):
    region_code: str = "jateng"
    ppn_rate: float = 0.11
    base_mode: Literal["sequential", "parallel"] = "sequential"
    crew_factor: float = Field(default=2.0, gt=0)        # pengali crew untuk skenario "tambah_crew"
    overtime_speedup: float = Field(default=1.25, gt=0)  # laju kerja saat lembur (×)
    overtime_cost_factor: float = Field(default=1.4, gt=0)  # pengali biaya tenaga saat lembur
    params: ScenarioParams | None = None
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


class CustomItemSchedule(BaseModel):
    ahsp_code: str
    name: str
    volume: float
    base_mandays: float
    effective_workers: float
    duration_days: float


class CustomScenarioResult(BaseModel):
    applied_crew_multiplier: float
    shifts: int
    efficiency: float
    target_days: float | None
    resolved_from_target: bool
    items: List[CustomItemSchedule]
    total_days: float
    subtotal: float
    labor_cost: float
    total_cost: float
    delta_days: float
    delta_cost: float
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
    custom: CustomScenarioResult | None = None
