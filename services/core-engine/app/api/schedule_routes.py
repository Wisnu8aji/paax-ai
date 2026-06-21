"""
Schedule API routes — generate, scenarios, delay-recovery.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.domain.schedule.delay_recovery import generate_recovery_plan
from app.domain.schedule.generator import generate_schedule
from app.domain.schedule.models import (
    DelayRecoveryRequest,
    DelayRecoveryResponse,
    ScenarioRequest,
    ScheduleVersion,
)
from app.domain.schedule.scenarios import generate_all_scenarios

router = APIRouter()


@router.post("/generate", response_model=ScheduleVersion)
async def generate(request: ScenarioRequest) -> ScheduleVersion:
    """Generate a project schedule for the given scenario."""
    return generate_schedule(
        project_id=request.project_id,
        luas_bangunan=request.luas_bangunan,
        jumlah_lantai=request.jumlah_lantai,
        start_date=request.start_date,
        scenario=request.scenario,
    )


@router.post("/scenario", response_model=list[ScheduleVersion])
async def scenarios(request: ScenarioRequest) -> list[ScheduleVersion]:
    """Generate Hemat / Normal / Cepat schedule variants."""
    return generate_all_scenarios(
        project_id=request.project_id,
        luas_bangunan=request.luas_bangunan,
        jumlah_lantai=request.jumlah_lantai,
        start_date=request.start_date,
    )


@router.post("/delay-recovery", response_model=DelayRecoveryResponse)
async def delay_recovery(request: DelayRecoveryRequest) -> DelayRecoveryResponse:
    """Analyze delays and generate a recovery plan."""
    return generate_recovery_plan(
        project_id=request.project_id,
        tasks=request.tasks,
        current_date=request.current_date,
        target_end_date=request.target_end_date,
    )
