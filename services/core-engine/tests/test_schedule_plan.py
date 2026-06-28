from fastapi.testclient import TestClient

from app.main import app
from app.rab.schedule import (
    CalendarConfig,
    PlanTaskInput,
    SchedulePlanRequest,
    build_schedule_plan,
)


client = TestClient(app, raise_server_exceptions=False)


def by_id(result):
    return {task.id: task for task in result.tasks}


def anchor_a_request() -> SchedulePlanRequest:
    return SchedulePlanRequest(
        project_start_date="2026-06-01",
        calendar=CalendarConfig(holidays=["2026-06-04"]),
        tasks=[
            PlanTaskInput(id="A", duration_days=3, predecessors=[]),
            PlanTaskInput(id="B", duration_days=2, predecessors=["A"]),
            PlanTaskInput(id="C", duration_days=4, predecessors=["B"]),
        ],
    )


def test_schedule_plan_maps_cpm_offsets_to_working_calendar_dates():
    result = build_schedule_plan(anchor_a_request())
    tasks = by_id(result)

    assert result.project_duration_days == 9
    assert result.project_start_date == "2026-06-01"
    assert result.project_end_date == "2026-06-11"
    assert result.critical_path == ["A", "B", "C"]

    assert tasks["A"].start_date == "2026-06-01"
    assert tasks["A"].end_date == "2026-06-03"
    assert tasks["B"].start_date == "2026-06-05"
    assert tasks["B"].end_date == "2026-06-06"
    assert tasks["C"].start_date == "2026-06-08"
    assert tasks["C"].end_date == "2026-06-11"

    assert all(task.is_critical for task in result.tasks)
    assert all(task.total_float == 0 for task in result.tasks)


def test_schedule_plan_builds_dependency_aware_s_curve_from_cpm_early_starts():
    result = build_schedule_plan(SchedulePlanRequest(
        project_start_date="2026-06-01",
        period_days=3,
        tasks=[
            PlanTaskInput(id="A", duration_days=3, predecessors=[], weight_pct=30),
            PlanTaskInput(id="B", duration_days=2, predecessors=["A"], weight_pct=20),
            PlanTaskInput(id="C", duration_days=4, predecessors=["A"], weight_pct=50),
        ],
    ))

    assert result.project_duration_days == 7
    assert result.s_curve is not None
    assert result.s_curve.total_days == 7
    assert result.s_curve.period_days == 3
    assert result.s_curve.mode == "cpm"
    assert [(p.period, p.day_start, p.day_end, p.planned_pct, p.cumulative_pct) for p in result.s_curve.points] == [
        (1, 1, 3, 30.0, 30.0),
        (2, 4, 6, 57.5, 87.5),
        (3, 7, 7, 12.5, 100.0),
    ]


def test_schedule_plan_omits_s_curve_when_any_task_weight_is_missing():
    result = build_schedule_plan(anchor_a_request())

    assert result.s_curve is None
    assert result.project_end_date == "2026-06-11"
    assert result.critical_path == ["A", "B", "C"]


def test_schedule_plan_endpoint_returns_calendar_anchor():
    response = client.post("/schedule/plan", json={
        "project_start_date": "2026-06-01",
        "calendar": {"holidays": ["2026-06-04"]},
        "tasks": [
            {"id": "A", "duration_days": 3, "predecessors": []},
            {"id": "B", "duration_days": 2, "predecessors": ["A"]},
            {"id": "C", "duration_days": 4, "predecessors": ["B"]},
        ],
    })

    assert response.status_code == 200
    data = response.json()
    assert data["project_duration_days"] == 9
    assert data["project_end_date"] == "2026-06-11"
    assert data["critical_path"] == ["A", "B", "C"]
    assert data["s_curve"] is None
    assert data["tasks"][0]["start_date"] == "2026-06-01"
    assert data["tasks"][1]["start_date"] == "2026-06-05"
    assert data["tasks"][2]["end_date"] == "2026-06-11"


def test_schedule_plan_endpoint_rejects_fractional_duration():
    response = client.post("/schedule/plan", json={
        "project_start_date": "2026-06-01",
        "tasks": [{"id": "A", "duration_days": 2.5, "predecessors": []}],
    })

    assert response.status_code == 400
    assert "bilangan bulat" in response.json()["detail"]


def test_schedule_plan_endpoint_rejects_cycle():
    response = client.post("/schedule/plan", json={
        "project_start_date": "2026-06-01",
        "tasks": [
            {"id": "A", "duration_days": 1, "predecessors": ["B"]},
            {"id": "B", "duration_days": 1, "predecessors": ["A"]},
        ],
    })

    assert response.status_code == 400
    assert "siklik" in response.json()["detail"]


def test_schedule_plan_endpoint_rejects_unknown_predecessor():
    response = client.post("/schedule/plan", json={
        "project_start_date": "2026-06-01",
        "tasks": [{"id": "A", "duration_days": 1, "predecessors": ["Z"]}],
    })

    assert response.status_code == 400
    assert "tidak dikenal" in response.json()["detail"]


def test_schedule_plan_endpoint_rejects_invalid_project_start_date():
    response = client.post("/schedule/plan", json={
        "project_start_date": "not-a-date",
        "tasks": [{"id": "A", "duration_days": 1, "predecessors": []}],
    })

    assert response.status_code == 400
    assert "project_start_date" in response.json()["detail"]
    assert "ISO" in response.json()["detail"]


def test_schedule_plan_endpoint_rejects_invalid_holiday_date():
    response = client.post("/schedule/plan", json={
        "project_start_date": "2026-06-01",
        "calendar": {"holidays": ["not-a-date"]},
        "tasks": [{"id": "A", "duration_days": 1, "predecessors": []}],
    })

    assert response.status_code == 400
    assert "holidays" in response.json()["detail"]
    assert "ISO" in response.json()["detail"]


def test_schedule_plan_moves_non_working_start_date_to_next_working_day():
    response = client.post("/schedule/plan", json={
        "project_start_date": "2026-06-07",
        "tasks": [{"id": "A", "duration_days": 1, "predecessors": []}],
    })

    assert response.status_code == 200
    data = response.json()
    assert data["project_start_date"] == "2026-06-07"
    assert data["project_end_date"] == "2026-06-08"
    assert data["tasks"][0]["start_date"] == "2026-06-08"
    assert data["tasks"][0]["end_date"] == "2026-06-08"
