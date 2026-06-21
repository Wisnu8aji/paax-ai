"""
Pydantic models for project schedule (Jadwal Pelaksanaan).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    DELAYED = "delayed"
    ON_HOLD = "on_hold"


class ScenarioType(str, Enum):
    HEMAT = "hemat"        # Budget-optimised, slower
    NORMAL = "normal"      # Standard pace
    CEPAT = "cepat"        # Accelerated, higher cost
    RECOVERY = "recovery"  # Delay-recovery plan


class ScheduleTask(BaseModel):
    """Single task in a project schedule."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    wbs: str = Field(..., description="WBS code, e.g. '1.1.1'")
    nama: str = Field(..., description="Nama pekerjaan")
    durasi_hari: int = Field(..., ge=1, description="Durasi (hari kerja)")
    start_date: date
    end_date: date
    predecessor: Optional[str] = Field(None, description="WBS predecessor (finish-to-start)")
    progress_pct: float = Field(default=0.0, ge=0, le=100)
    status: TaskStatus = TaskStatus.NOT_STARTED
    bobot_pct: float = Field(default=0.0, description="Bobot (% dari total proyek)")
    resources: list[str] = Field(default_factory=list, description="Daftar sumber daya")


class ScheduleVersion(BaseModel):
    """A complete schedule snapshot."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    version: int = 1
    scenario: ScenarioType = ScenarioType.NORMAL
    label: str = "Jadwal Draft"
    tasks: list[ScheduleTask] = []
    total_durasi_hari: int = 0
    start_date: date
    end_date: date
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ScenarioRequest(BaseModel):
    """Request to generate a schedule scenario."""
    project_id: str
    scenario: ScenarioType = ScenarioType.NORMAL
    luas_bangunan: float = Field(..., gt=0)
    jumlah_lantai: int = Field(default=1, ge=1)
    start_date: date


class DelayRecoveryRequest(BaseModel):
    """Request to generate a delay-recovery plan."""
    project_id: str
    tasks: list[ScheduleTask]
    current_date: date
    target_end_date: date


class DelayAnalysis(BaseModel):
    """Result of delay analysis."""
    task_id: str
    task_name: str
    planned_end: date
    expected_end: date
    delay_days: int
    is_critical: bool


class RecoveryAction(BaseModel):
    """Single recovery action recommendation."""
    action: str
    task_id: str
    description: str
    new_durasi_hari: int
    cost_impact_pct: float = Field(default=0.0, description="Estimated cost increase %")


class DelayRecoveryResponse(BaseModel):
    """Response for delay-recovery plan."""
    project_id: str
    total_delay_days: int
    delays: list[DelayAnalysis]
    recovery_actions: list[RecoveryAction]
    recovered_tasks: list[ScheduleTask]
    new_end_date: date
    feasible: bool
