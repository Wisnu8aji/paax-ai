import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.rab.schedule import CPMRequest, TaskInput, compute_cpm


client = TestClient(app, raise_server_exceptions=False)


REFERENCE_TASKS = [
    TaskInput(id="A", name="A", duration_days=3, predecessors=[]),
    TaskInput(id="B", name="B", duration_days=4, predecessors=["A"]),
    TaskInput(id="C", name="C", duration_days=2, predecessors=["A"]),
    TaskInput(id="D", name="D", duration_days=5, predecessors=["B"]),
    TaskInput(id="E", name="E", duration_days=1, predecessors=["C"]),
    TaskInput(id="F", name="F", duration_days=2, predecessors=["D", "E"]),
]


def by_id(result):
    return {task.id: task for task in result.tasks}


def test_cpm_reference_network_matches_manual_anchor():
    result = compute_cpm(CPMRequest(tasks=REFERENCE_TASKS))
    tasks = by_id(result)

    assert result.project_duration_days == 14
    assert result.critical_path == ["A", "B", "D", "F"]

    expected = {
        "A": (3, 0, 3, 0, 3, 0, True),
        "B": (4, 3, 7, 3, 7, 0, True),
        "C": (2, 3, 5, 9, 11, 6, False),
        "D": (5, 7, 12, 7, 12, 0, True),
        "E": (1, 5, 6, 11, 12, 6, False),
        "F": (2, 12, 14, 12, 14, 0, True),
    }

    for task_id, (dur, es, ef, ls, lf, total_float, critical) in expected.items():
        task = tasks[task_id]
        assert task.duration_days == dur
        assert task.early_start == es
        assert task.early_finish == ef
        assert task.late_start == ls
        assert task.late_finish == lf
        assert task.total_float == total_float
        assert task.is_critical is critical


def test_cpm_independent_tasks_float_non_longest_task():
    result = compute_cpm(CPMRequest(tasks=[
        TaskInput(id="A", duration_days=3),
        TaskInput(id="B", duration_days=5),
    ]))
    tasks = by_id(result)

    assert result.project_duration_days == 5
    assert tasks["A"].total_float == 2
    assert tasks["A"].is_critical is False
    assert tasks["B"].is_critical is True
    assert result.critical_path == ["B"]


def test_cpm_linear_chain_all_critical():
    result = compute_cpm(CPMRequest(tasks=[
        TaskInput(id="A", duration_days=2),
        TaskInput(id="B", duration_days=3, predecessors=["A"]),
        TaskInput(id="C", duration_days=4, predecessors=["B"]),
    ]))

    assert result.project_duration_days == 9
    assert result.critical_path == ["A", "B", "C"]
    assert all(task.total_float == 0 for task in result.tasks)
    assert all(task.is_critical for task in result.tasks)


def test_cpm_rejects_cycle_with_clear_message():
    with pytest.raises(ValueError, match="siklik"):
        compute_cpm(CPMRequest(tasks=[
            TaskInput(id="A", duration_days=1, predecessors=["B"]),
            TaskInput(id="B", duration_days=1, predecessors=["A"]),
        ]))


def test_cpm_rejects_unknown_predecessor():
    with pytest.raises(ValueError, match="tidak dikenal"):
        compute_cpm(CPMRequest(tasks=[
            TaskInput(id="A", duration_days=1, predecessors=["Z"]),
        ]))


def test_cpm_empty_request():
    result = compute_cpm(CPMRequest(tasks=[]))

    assert result.project_duration_days == 0
    assert result.tasks == []
    assert result.critical_path == []


def test_cpm_endpoint_reference_network():
    response = client.post("/schedule/cpm", json={
        "tasks": [
            {"id": "A", "name": "A", "duration_days": 3, "predecessors": []},
            {"id": "B", "name": "B", "duration_days": 4, "predecessors": ["A"]},
            {"id": "C", "name": "C", "duration_days": 2, "predecessors": ["A"]},
            {"id": "D", "name": "D", "duration_days": 5, "predecessors": ["B"]},
            {"id": "E", "name": "E", "duration_days": 1, "predecessors": ["C"]},
            {"id": "F", "name": "F", "duration_days": 2, "predecessors": ["D", "E"]},
        ],
    })

    assert response.status_code == 200
    data = response.json()
    assert data["project_duration_days"] == 14
    assert data["critical_path"] == ["A", "B", "D", "F"]
    assert data["tasks"][2]["id"] == "C"
    assert data["tasks"][2]["total_float"] == 6


def test_cpm_endpoint_rejects_cycle():
    response = client.post("/schedule/cpm", json={
        "tasks": [
            {"id": "A", "duration_days": 1, "predecessors": ["B"]},
            {"id": "B", "duration_days": 1, "predecessors": ["A"]},
        ],
    })

    assert response.status_code == 400
    assert "siklik" in response.json()["detail"]
