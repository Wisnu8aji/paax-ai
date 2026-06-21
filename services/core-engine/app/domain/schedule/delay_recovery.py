"""
Delay analysis and recovery plan generation.
"""

from __future__ import annotations

import copy
from datetime import date, timedelta

from app.domain.schedule.models import (
    DelayAnalysis,
    DelayRecoveryResponse,
    RecoveryAction,
    ScheduleTask,
    TaskStatus,
)


def _workdays_between(d1: date, d2: date) -> int:
    """Count business days between two dates."""
    if d2 <= d1:
        return 0
    days = 0
    current = d1
    while current < d2:
        current += timedelta(days=1)
        if current.weekday() < 5:
            days += 1
    return days


def analyze_delays(
    tasks: list[ScheduleTask],
    current_date: date,
) -> list[DelayAnalysis]:
    """Identify delayed tasks based on progress vs planned schedule."""
    delays: list[DelayAnalysis] = []

    for task in tasks:
        if task.status == TaskStatus.COMPLETED:
            continue

        total_days = _workdays_between(task.start_date, task.end_date)
        if total_days <= 0:
            continue

        elapsed_days = _workdays_between(task.start_date, current_date)
        expected_progress = min(100.0, (elapsed_days / total_days) * 100)

        if current_date > task.start_date and task.progress_pct < expected_progress * 0.8:
            # Task is behind schedule
            progress_ratio = task.progress_pct / max(expected_progress, 1.0)
            remaining_work_pct = 100.0 - task.progress_pct
            days_left = _workdays_between(current_date, task.end_date)

            if progress_ratio > 0:
                estimated_remaining = remaining_work_pct / (task.progress_pct / max(elapsed_days, 1))
            else:
                estimated_remaining = total_days

            estimated_end = current_date + timedelta(days=int(estimated_remaining * 1.4))
            delay_days = max(0, (estimated_end - task.end_date).days)

            if delay_days > 0:
                delays.append(
                    DelayAnalysis(
                        task_id=task.id,
                        task_name=task.nama,
                        planned_end=task.end_date,
                        expected_end=estimated_end,
                        delay_days=delay_days,
                        is_critical=task.bobot_pct >= 8.0,
                    )
                )

    return delays


def generate_recovery_plan(
    project_id: str,
    tasks: list[ScheduleTask],
    current_date: date,
    target_end_date: date,
) -> DelayRecoveryResponse:
    """Generate a recovery plan to meet the target end date."""
    delays = analyze_delays(tasks, current_date)
    total_delay = sum(d.delay_days for d in delays)

    recovery_actions: list[RecoveryAction] = []
    recovered_tasks = copy.deepcopy(tasks)

    for delay in delays:
        # Find the matching recovered task
        for task in recovered_tasks:
            if task.id == delay.task_id:
                reduction = max(1, delay.delay_days)
                new_durasi = max(
                    int(task.durasi_hari * 0.6),  # Can't reduce more than 40 %
                    task.durasi_hari - reduction,
                )

                cost_increase = ((task.durasi_hari - new_durasi) / task.durasi_hari) * 25.0

                if delay.is_critical:
                    action_desc = (
                        f"Tambah shift kerja (lembur) dan tambah tenaga kerja "
                        f"untuk '{task.nama}' — durasi dikurangi dari "
                        f"{task.durasi_hari} ke {new_durasi} hari"
                    )
                else:
                    action_desc = (
                        f"Percepat pekerjaan '{task.nama}' dengan lembur — "
                        f"durasi dikurangi dari {task.durasi_hari} ke {new_durasi} hari"
                    )

                recovery_actions.append(
                    RecoveryAction(
                        action="accelerate",
                        task_id=task.id,
                        description=action_desc,
                        new_durasi_hari=new_durasi,
                        cost_impact_pct=round(cost_increase, 1),
                    )
                )

                task.durasi_hari = new_durasi
                task.status = TaskStatus.IN_PROGRESS
                break

    new_end_date = max(t.end_date for t in recovered_tasks) if recovered_tasks else target_end_date
    feasible = new_end_date <= target_end_date

    return DelayRecoveryResponse(
        project_id=project_id,
        total_delay_days=total_delay,
        delays=delays,
        recovery_actions=recovery_actions,
        recovered_tasks=recovered_tasks,
        new_end_date=new_end_date,
        feasible=feasible,
    )
