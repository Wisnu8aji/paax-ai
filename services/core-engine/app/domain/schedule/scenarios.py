"""
Schedule scenarios — generate Hemat / Normal / Cepat / Recovery schedules.
"""

from __future__ import annotations

from datetime import date

from app.domain.schedule.generator import generate_schedule
from app.domain.schedule.models import ScheduleVersion, ScenarioType


def generate_all_scenarios(
    project_id: str,
    luas_bangunan: float,
    jumlah_lantai: int,
    start_date: date,
) -> list[ScheduleVersion]:
    """Generate schedules for all four scenario types."""
    return [
        generate_schedule(project_id, luas_bangunan, jumlah_lantai, start_date, scenario)
        for scenario in [
            ScenarioType.HEMAT,
            ScenarioType.NORMAL,
            ScenarioType.CEPAT,
        ]
    ]


def generate_scenario(
    project_id: str,
    luas_bangunan: float,
    jumlah_lantai: int,
    start_date: date,
    scenario: ScenarioType,
) -> ScheduleVersion:
    """Generate a schedule for a specific scenario."""
    return generate_schedule(project_id, luas_bangunan, jumlah_lantai, start_date, scenario)
