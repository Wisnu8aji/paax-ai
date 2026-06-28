"""
PAAX Core Engine — Pembangun Kurva S (deterministik).

Dari RAB (bobot tiap item) + durasi tiap item, bangun rencana progres kumulatif.
- mode "sequential": tiap item mulai setelah item sebelumnya selesai (baseline sederhana).
- mode "parallel":   semua item mulai di hari ke-0.
Bobot tiap item didistribusikan merata sepanjang durasinya, lalu diakumulasi per periode.
"""
from __future__ import annotations
from datetime import date, timedelta
from typing import List
import math
from pydantic import BaseModel, Field

from .models import RABResult, RABLineInput, SCurvePoint, SCurveResult


EPS = 1e-9


class TaskInput(BaseModel):
    id: str
    name: str | None = None
    duration_days: float
    predecessors: List[str] = Field(default_factory=list)
    dep_type: str = "FS"
    lag_days: float = 0


class CPMRequest(BaseModel):
    tasks: List[TaskInput]


class CPMTask(BaseModel):
    id: str
    name: str
    duration_days: float
    early_start: float
    early_finish: float
    late_start: float
    late_finish: float
    total_float: float
    is_critical: bool


class CPMResult(BaseModel):
    project_duration_days: float
    tasks: List[CPMTask]
    critical_path: List[str]


class CalendarConfig(BaseModel):
    working_weekdays: List[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4, 5])
    holidays: List[str] = Field(default_factory=list)


class PlanTaskInput(BaseModel):
    id: str
    name: str | None = None
    duration_days: float
    predecessors: List[str] = Field(default_factory=list)
    weight_pct: float | None = None


class SchedulePlanRequest(BaseModel):
    project_start_date: str
    calendar: CalendarConfig | None = None
    period_days: int = 7
    tasks: List[PlanTaskInput]


class ScheduledTask(CPMTask):
    start_date: str
    end_date: str


class SchedulePlanResult(BaseModel):
    project_duration_days: float
    project_start_date: str
    project_end_date: str
    tasks: List[ScheduledTask]
    critical_path: List[str]
    s_curve: SCurveResult | None


def _clean_number(value: float) -> float:
    if abs(value) < EPS:
        return 0
    rounded = round(value)
    if abs(value - rounded) < EPS:
        return float(rounded)
    return value


def _topological_order(tasks: List[TaskInput]) -> tuple[List[str], dict[str, List[str]]]:
    ids: dict[str, int] = {}
    for index, task in enumerate(tasks):
        if task.id in ids:
            raise ValueError(f"id duplikat: {task.id}")
        ids[task.id] = index
        if task.duration_days < 0:
            raise ValueError(f"duration_days tugas {task.id} harus >= 0")
        if task.dep_type != "FS" or task.lag_days != 0:
            raise ValueError("v0.9A hanya mendukung dependency FS dengan lag_days 0")

    successors: dict[str, List[str]] = {task.id: [] for task in tasks}
    indegree: dict[str, int] = {task.id: 0 for task in tasks}
    for task in tasks:
        for predecessor in task.predecessors:
            if predecessor not in ids:
                raise ValueError(f"predecessor tidak dikenal: {predecessor}")
            successors[predecessor].append(task.id)
            indegree[task.id] += 1

    for task_id in successors:
        successors[task_id].sort(key=lambda item: ids[item])

    ready = sorted(
        [task.id for task in tasks if indegree[task.id] == 0],
        key=lambda item: ids[item],
    )
    order: List[str] = []
    while ready:
        current = ready.pop(0)
        order.append(current)
        for successor in successors[current]:
            indegree[successor] -= 1
            if indegree[successor] == 0:
                ready.append(successor)
                ready.sort(key=lambda item: ids[item])

    if len(order) != len(tasks):
        raise ValueError("dependency siklik terdeteksi")
    return order, successors


def compute_cpm(req: CPMRequest) -> CPMResult:
    if not req.tasks:
        return CPMResult(project_duration_days=0, tasks=[], critical_path=[])

    by_id = {task.id: task for task in req.tasks}
    input_index = {task.id: index for index, task in enumerate(req.tasks)}
    topo, successors = _topological_order(req.tasks)

    early_start: dict[str, float] = {}
    early_finish: dict[str, float] = {}
    for task_id in topo:
        task = by_id[task_id]
        early_start[task_id] = max(
            (early_finish[predecessor] for predecessor in task.predecessors),
            default=0,
        )
        early_finish[task_id] = early_start[task_id] + task.duration_days

    project_duration = max(early_finish.values(), default=0)

    late_start: dict[str, float] = {}
    late_finish: dict[str, float] = {}
    for task_id in reversed(topo):
        task = by_id[task_id]
        late_finish[task_id] = min(
            (late_start[successor] for successor in successors[task_id]),
            default=project_duration,
        )
        late_start[task_id] = late_finish[task_id] - task.duration_days

    output_tasks: List[CPMTask] = []
    critical_ids: set[str] = set()
    for task in req.tasks:
        total_float = late_start[task.id] - early_start[task.id]
        is_critical = abs(total_float) < EPS
        if is_critical:
            total_float = 0
            critical_ids.add(task.id)
        output_tasks.append(CPMTask(
            id=task.id,
            name=task.name or task.id,
            duration_days=_clean_number(task.duration_days),
            early_start=_clean_number(early_start[task.id]),
            early_finish=_clean_number(early_finish[task.id]),
            late_start=_clean_number(late_start[task.id]),
            late_finish=_clean_number(late_finish[task.id]),
            total_float=_clean_number(total_float),
            is_critical=is_critical,
        ))

    start_candidates = [
        task.id
        for task in req.tasks
        if task.id in critical_ids
        and not any(predecessor in critical_ids for predecessor in task.predecessors)
    ]
    critical_path: List[str] = []
    if start_candidates:
        current = min(start_candidates, key=lambda task_id: input_index[task_id])
        critical_path.append(current)
        while True:
            next_candidates = [
                successor
                for successor in successors[current]
                if successor in critical_ids
                and abs(early_start[successor] - early_finish[current]) < EPS
            ]
            if not next_candidates:
                break
            current = min(next_candidates, key=lambda task_id: input_index[task_id])
            critical_path.append(current)

    return CPMResult(
        project_duration_days=_clean_number(project_duration),
        tasks=output_tasks,
        critical_path=critical_path,
    )


def _integer_value(value: float, message: str) -> int:
    rounded = round(value)
    if abs(value - rounded) > EPS:
        raise ValueError(message)
    return int(rounded)


def _parse_iso_date(value: str, field_name: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{field_name} harus format ISO YYYY-MM-DD") from exc


def _calendar_parts(calendar: CalendarConfig | None) -> tuple[set[int], set[date]]:
    cfg = calendar or CalendarConfig()
    working_weekdays = set(cfg.working_weekdays)
    if not working_weekdays:
        raise ValueError("working_weekdays tidak boleh kosong")
    if any(day < 0 or day > 6 for day in working_weekdays):
        raise ValueError("working_weekdays harus bernilai 0 sampai 6")
    holidays = {_parse_iso_date(item, "holidays") for item in cfg.holidays}
    return working_weekdays, holidays


def nth_working_day(start_date: date, n: int, calendar: CalendarConfig | None = None) -> date:
    if n < 0:
        raise ValueError("offset hari kerja harus >= 0")

    working_weekdays, holidays = _calendar_parts(calendar)
    current = start_date
    seen = -1
    while True:
        if current.weekday() in working_weekdays and current not in holidays:
            seen += 1
            if seen == n:
                return current
        current += timedelta(days=1)


def build_s_curve_cpm(
    tasks: List[CPMTask],
    weights: dict[str, float],
    period_days: int = 7,
    total_days: int | None = None,
) -> SCurveResult:
    if period_days <= 0:
        raise ValueError("period_days harus >= 1")

    resolved_total_days = (
        total_days
        if total_days is not None
        else max((_integer_value(task.early_finish, "offset CPM harus bilangan bulat") for task in tasks), default=0)
    )
    if resolved_total_days <= 0:
        return SCurveResult(total_days=0, period_days=period_days, mode="cpm", points=[])

    daily = [0.0] * resolved_total_days
    for task in tasks:
        duration = _integer_value(task.duration_days, "durasi harus bilangan bulat untuk plan")
        if duration <= 0:
            if weights.get(task.id, 0) != 0:
                raise ValueError("durasi tugas berbobot harus > 0 untuk kurva S")
            continue
        start = _integer_value(task.early_start, "offset CPM harus bilangan bulat")
        per_day = weights[task.id] / duration
        for day in range(start, start + duration):
            daily[day] += per_day

    n_periods = math.ceil(resolved_total_days / period_days)
    points: List[SCurvePoint] = []
    cumulative = 0.0
    for period_index in range(n_periods):
        d0 = period_index * period_days
        d1 = min(d0 + period_days, resolved_total_days)
        planned = sum(daily[d0:d1])
        cumulative += planned
        points.append(SCurvePoint(
            period=period_index + 1,
            day_start=d0 + 1,
            day_end=d1,
            planned_pct=round(planned, 4),
            cumulative_pct=round(cumulative, 4),
        ))

    if points and abs(cumulative - 100.0) < 0.5:
        points[-1].cumulative_pct = 100.0

    return SCurveResult(
        total_days=resolved_total_days,
        period_days=period_days,
        mode="cpm",
        points=points,
    )


def build_schedule_plan(req: SchedulePlanRequest) -> SchedulePlanResult:
    cpm = compute_cpm(CPMRequest(tasks=[
        TaskInput(
            id=task.id,
            name=task.name,
            duration_days=task.duration_days,
            predecessors=task.predecessors,
        )
        for task in req.tasks
    ]))

    project_start = _parse_iso_date(req.project_start_date, "project_start_date")
    if req.period_days <= 0:
        raise ValueError("period_days harus >= 1")

    for task in req.tasks:
        _integer_value(task.duration_days, "durasi harus bilangan bulat untuk plan")

    project_duration = _integer_value(
        cpm.project_duration_days,
        "project_duration_days harus bilangan bulat untuk plan",
    )
    if project_duration >= 1:
        project_end = nth_working_day(project_start, project_duration - 1, req.calendar)
    else:
        project_end = project_start

    scheduled_tasks: List[ScheduledTask] = []
    for task in cpm.tasks:
        duration = _integer_value(task.duration_days, "durasi harus bilangan bulat untuk plan")
        early_start = _integer_value(task.early_start, "offset CPM harus bilangan bulat")
        early_finish = _integer_value(task.early_finish, "offset CPM harus bilangan bulat")
        start = nth_working_day(project_start, early_start, req.calendar)
        end = start if duration == 0 else nth_working_day(project_start, early_finish - 1, req.calendar)
        scheduled_tasks.append(ScheduledTask(
            **task.model_dump(),
            start_date=start.isoformat(),
            end_date=end.isoformat(),
        ))

    s_curve = None
    if all(task.weight_pct is not None for task in req.tasks):
        weights = {task.id: task.weight_pct or 0.0 for task in req.tasks}
        s_curve = build_s_curve_cpm(cpm.tasks, weights, req.period_days, project_duration)

    return SchedulePlanResult(
        project_duration_days=cpm.project_duration_days,
        project_start_date=req.project_start_date,
        project_end_date=project_end.isoformat(),
        tasks=scheduled_tasks,
        critical_path=cpm.critical_path,
        s_curve=s_curve,
    )


def build_s_curve(
    rab: RABResult,
    lines_input: List[RABLineInput],
    period_days: int = 7,
    mode: str = "sequential",
    default_duration: int = 1,
) -> SCurveResult:
    """Bangun Kurva S rencana. Urutan lines_input harus sama dengan rab.lines."""
    if mode not in ("sequential", "parallel"):
        raise ValueError("mode harus 'sequential' atau 'parallel'")

    weights = [ln.weight_pct for ln in rab.lines]
    durations = [
        (li.duration_days if li.duration_days and li.duration_days > 0 else default_duration)
        for li in lines_input
    ]

    # Tentukan hari mulai tiap item
    starts: List[int] = []
    if mode == "sequential":
        cursor = 0
        for d in durations:
            starts.append(cursor)
            cursor += d
        total_days = cursor
    else:  # parallel
        starts = [0] * len(durations)
        total_days = max(durations) if durations else 0

    if total_days <= 0:
        return SCurveResult(total_days=0, period_days=period_days, mode=mode, points=[])

    # Bobot per hari untuk tiap item, lalu jumlahkan ke array harian
    daily = [0.0] * total_days
    for w, d, s in zip(weights, durations, starts):
        per_day = w / d
        for day in range(s, s + d):
            daily[day] += per_day

    # Kelompokkan ke periode (mis. mingguan) + akumulasi
    n_periods = math.ceil(total_days / period_days)
    points: List[SCurvePoint] = []
    cumulative = 0.0
    for p in range(n_periods):
        d0 = p * period_days
        d1 = min(d0 + period_days, total_days)
        planned = sum(daily[d0:d1])
        cumulative += planned
        points.append(SCurvePoint(
            period=p + 1,
            day_start=d0 + 1,
            day_end=d1,
            planned_pct=round(planned, 4),
            cumulative_pct=round(cumulative, 4),
        ))

    # Koreksi pembulatan: pastikan titik akhir = 100.0 jika bobot ~100
    if points and abs(cumulative - 100.0) < 0.5:
        points[-1].cumulative_pct = 100.0

    return SCurveResult(
        total_days=total_days,
        period_days=period_days,
        mode=mode,
        points=points,
    )
