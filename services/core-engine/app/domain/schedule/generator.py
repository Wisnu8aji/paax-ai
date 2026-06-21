"""
Schedule generator — create a project schedule from project parameters.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.domain.schedule.models import (
    ScheduleTask,
    ScheduleVersion,
    ScenarioType,
    TaskStatus,
)

# ── Standard work-item durations (days per 100 m²) ─────────────────────────

_BASE_DURATIONS: list[dict] = [
    {"wbs": "1", "nama": "Pekerjaan Persiapan", "durasi_per_100m2": 7, "bobot": 3.0},
    {"wbs": "2", "nama": "Pekerjaan Tanah", "durasi_per_100m2": 10, "bobot": 5.0},
    {"wbs": "3", "nama": "Pekerjaan Pondasi", "durasi_per_100m2": 14, "bobot": 12.0},
    {"wbs": "4", "nama": "Pekerjaan Struktur", "durasi_per_100m2": 30, "bobot": 25.0},
    {"wbs": "5", "nama": "Pekerjaan Dinding", "durasi_per_100m2": 21, "bobot": 10.0},
    {"wbs": "6", "nama": "Pekerjaan Lantai", "durasi_per_100m2": 10, "bobot": 8.0},
    {"wbs": "7", "nama": "Pekerjaan Atap", "durasi_per_100m2": 14, "bobot": 10.0},
    {"wbs": "8", "nama": "Pekerjaan Pintu & Jendela", "durasi_per_100m2": 10, "bobot": 7.0},
    {"wbs": "9", "nama": "Pekerjaan Plafon", "durasi_per_100m2": 7, "bobot": 4.0},
    {"wbs": "10", "nama": "Pekerjaan Sanitasi", "durasi_per_100m2": 10, "bobot": 6.0},
    {"wbs": "11", "nama": "Pekerjaan MEP", "durasi_per_100m2": 10, "bobot": 5.0},
    {"wbs": "12", "nama": "Pekerjaan Finishing", "durasi_per_100m2": 14, "bobot": 3.0},
    {"wbs": "13", "nama": "Pekerjaan Luar", "durasi_per_100m2": 7, "bobot": 2.0},
]

# ── Scenario duration multipliers ──────────────────────────────────────────

_SCENARIO_FACTOR: dict[ScenarioType, float] = {
    ScenarioType.HEMAT: 1.30,     # 30 % longer (fewer crews)
    ScenarioType.NORMAL: 1.00,
    ScenarioType.CEPAT: 0.70,     # 30 % faster (overtime/extra crews)
    ScenarioType.RECOVERY: 0.65,  # Aggressive acceleration
}

# ── Predecessor relationships (WBS → predecessor WBS) ──────────────────────

_PREDECESSORS: dict[str, str | None] = {
    "1": None,
    "2": "1",
    "3": "2",
    "4": "3",
    "5": "4",
    "6": "5",
    "7": "4",   # Atap can start after struktur
    "8": "5",   # Pintu/jendela after dinding
    "9": "7",   # Plafon after atap
    "10": "5",  # Sanitasi parallel with lantai
    "11": "5",  # MEP parallel with lantai
    "12": "9",  # Finishing after plafon
    "13": "12", # Luar after finishing
}


def _add_workdays(start: date, days: int) -> date:
    """Add business days (skip weekends)."""
    current = start
    added = 0
    while added < days:
        current += timedelta(days=1)
        if current.weekday() < 5:  # Mon-Fri
            added += 1
    return current


def generate_schedule(
    project_id: str,
    luas_bangunan: float,
    jumlah_lantai: int,
    start_date: date,
    scenario: ScenarioType = ScenarioType.NORMAL,
) -> ScheduleVersion:
    """Generate a complete project schedule."""
    total_luas = luas_bangunan * jumlah_lantai
    factor = _SCENARIO_FACTOR[scenario]

    # Build tasks with predecessor-driven scheduling
    task_map: dict[str, ScheduleTask] = {}
    tasks: list[ScheduleTask] = []

    for bd in _BASE_DURATIONS:
        wbs = bd["wbs"]
        raw_durasi = max(1, round(bd["durasi_per_100m2"] * (total_luas / 100) * factor))
        # Cap duration for sanity
        durasi = min(raw_durasi, 365)

        pred_wbs = _PREDECESSORS.get(wbs)
        if pred_wbs and pred_wbs in task_map:
            task_start = task_map[pred_wbs].end_date + timedelta(days=1)
            # Skip to next Monday if on weekend
            while task_start.weekday() >= 5:
                task_start += timedelta(days=1)
        else:
            task_start = start_date

        task_end = _add_workdays(task_start, durasi)

        task = ScheduleTask(
            wbs=wbs,
            nama=bd["nama"],
            durasi_hari=durasi,
            start_date=task_start,
            end_date=task_end,
            predecessor=pred_wbs,
            bobot_pct=bd["bobot"],
            status=TaskStatus.NOT_STARTED,
        )
        task_map[wbs] = task
        tasks.append(task)

    total_durasi = (max(t.end_date for t in tasks) - start_date).days
    end_date = max(t.end_date for t in tasks)

    label_map = {
        ScenarioType.HEMAT: "Jadwal Hemat (Lambat)",
        ScenarioType.NORMAL: "Jadwal Normal",
        ScenarioType.CEPAT: "Jadwal Cepat (Dipercepat)",
        ScenarioType.RECOVERY: "Jadwal Recovery",
    }

    return ScheduleVersion(
        project_id=project_id,
        scenario=scenario,
        label=label_map.get(scenario, "Jadwal Draft"),
        tasks=tasks,
        total_durasi_hari=total_durasi,
        start_date=start_date,
        end_date=end_date,
    )
