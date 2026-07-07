"""
Tests untuk PAAX Site Agent scaffold.

Skenario yang diverifikasi:
  1. POST /site-logs menyimpan laporan
  2. actual_progress_pct < 0 atau > 100 → validasi Pydantic gagal (422)
  3. GET /site-logs riwayat laporan
  4. GET /deviation: 3 skenario (ahead, on_track, behind)
  5. Tidak ada laporan → 404 eksplisit
  6. Test negatif: tidak ada import vision/Gemini di seluruh app/
"""
import importlib
import pkgutil
import sys
import ast
from pathlib import Path
from typing import Any
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.store import reset_store

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_store():
    """Reset in-memory store sebelum setiap test."""
    reset_store()
    yield
    reset_store()


# ===== 1. POST /site-logs menyimpan laporan =====
class TestCreateSiteLog:
    def test_create_log_returns_201(self):
        r = client.post("/site-logs", json={
            "project_id": "proj-1",
            "date": "2026-07-07",
            "weather": "cerah",
            "workers_count": 10,
            "notes": "Progress pondasi 70%",
            "actual_progress_pct": 70.0,
            "photo_refs": ["gs://bucket/foto1.jpg"]
        })
        assert r.status_code == 201
        data = r.json()
        assert data["project_id"] == "proj-1"
        assert data["date"] == "2026-07-07"
        assert data["actual_progress_pct"] == 70.0
        assert "id" in data
        assert "created_at" in data

    def test_photo_refs_stored_as_is(self):
        """foto hanya disimpan sebagai referensi, tidak dianalisa."""
        photos = ["gs://bucket/foto1.jpg", "/local/path/foto2.png"]
        r = client.post("/site-logs", json={
            "project_id": "proj-2",
            "date": "2026-07-07",
            "actual_progress_pct": 50.0,
            "photo_refs": photos
        })
        assert r.status_code == 201
        assert r.json()["photo_refs"] == photos


# ===== 2. Validasi actual_progress_pct =====
class TestValidation:
    def test_progress_below_zero_fails_422(self):
        r = client.post("/site-logs", json={
            "project_id": "proj-1",
            "date": "2026-07-07",
            "actual_progress_pct": -1.0
        })
        assert r.status_code == 422

    def test_progress_above_100_fails_422(self):
        r = client.post("/site-logs", json={
            "project_id": "proj-1",
            "date": "2026-07-07",
            "actual_progress_pct": 101.0
        })
        assert r.status_code == 422

    def test_progress_exactly_0_valid(self):
        r = client.post("/site-logs", json={
            "project_id": "proj-1",
            "date": "2026-07-07",
            "actual_progress_pct": 0.0
        })
        assert r.status_code == 201

    def test_progress_exactly_100_valid(self):
        r = client.post("/site-logs", json={
            "project_id": "proj-1",
            "date": "2026-07-07",
            "actual_progress_pct": 100.0
        })
        assert r.status_code == 201

    def test_weather_invalid_enum_fails(self):
        r = client.post("/site-logs", json={
            "project_id": "proj-1",
            "date": "2026-07-07",
            "actual_progress_pct": 50.0,
            "weather": "badai_salju"
        })
        assert r.status_code == 422


# ===== 3. GET /site-logs riwayat =====
class TestListSiteLogs:
    def test_list_empty_project(self):
        r = client.get("/site-logs?project_id=proj-x")
        assert r.status_code == 200
        assert r.json() == []

    def test_list_returns_all_logs(self):
        client.post("/site-logs", json={"project_id": "p1", "date": "2026-07-01", "actual_progress_pct": 10.0})
        client.post("/site-logs", json={"project_id": "p1", "date": "2026-07-02", "actual_progress_pct": 20.0})
        r = client.get("/site-logs?project_id=p1")
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_list_filter_by_from_date(self):
        client.post("/site-logs", json={"project_id": "p1", "date": "2026-07-01", "actual_progress_pct": 10.0})
        client.post("/site-logs", json={"project_id": "p1", "date": "2026-07-05", "actual_progress_pct": 20.0})
        r = client.get("/site-logs?project_id=p1&from=2026-07-03")
        assert r.status_code == 200
        assert len(r.json()) == 1
        assert r.json()[0]["date"] == "2026-07-05"


# ===== 4. GET /deviation: 3 skenario =====
class TestDeviation:
    def _create_log_and_get_deviation(self, actual_pct: float, planned_day: int, total_days: int):
        client.post("/site-logs", json={
            "project_id": "proj-dev",
            "date": "2026-07-07",
            "actual_progress_pct": actual_pct
        })
        r = client.get(
            "/site-logs/proj-dev/deviation",
            params={"date": "2026-07-07", "total_days": total_days, "planned_day": planned_day}
        )
        return r

    def test_deviation_ahead(self):
        """Aktual 80%, rencana 50% → ahead (+30%)"""
        r = self._create_log_and_get_deviation(actual_pct=80.0, planned_day=50, total_days=100)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ahead"
        assert data["deviation_pct"] > 0

    def test_deviation_on_track(self):
        """Aktual 50.5%, rencana 50% → on_track (|dev| ≤ 2%)"""
        r = self._create_log_and_get_deviation(actual_pct=50.5, planned_day=50, total_days=100)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "on_track"
        assert abs(data["deviation_pct"]) <= 2.0

    def test_deviation_behind(self):
        """Aktual 30%, rencana 70% → behind (-40%)"""
        r = self._create_log_and_get_deviation(actual_pct=30.0, planned_day=70, total_days=100)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "behind"
        assert data["deviation_pct"] < 0

    def test_deviation_threshold_boundary(self):
        """Ambang on_track = |deviation| ≤ 2% — dikembalikan di response"""
        r = self._create_log_and_get_deviation(actual_pct=52.0, planned_day=50, total_days=100)
        assert r.status_code == 200
        data = r.json()
        assert data["threshold_pct"] == 2.0


# ===== 5. 404 saat tidak ada laporan =====
class TestNotFound:
    def test_deviation_no_log_returns_404(self):
        r = client.get(
            "/site-logs/proj-missing/deviation",
            params={"date": "2026-07-07", "total_days": 100, "planned_day": 50}
        )
        assert r.status_code == 404
        assert "tidak ada laporan" in r.json()["detail"].lower()


# ===== 6. Test negatif: tidak ada import vision/Gemini =====
class TestNoVisionImport:
    """
    Verifikasi bahwa seluruh kode app/ site-agent TIDAK mengimport:
      - google.generativeai
      - vertexai
      - PIL (bisa untuk vision)
      - cv2
    Ini membuktikan larangan Vision-LLM ditegakkan di level kode.
    """
    FORBIDDEN_MODULES = [
        "google.generativeai",
        "vertexai",
        "google.cloud.vision",
        "PIL",
        "cv2",
    ]

    def test_no_vision_imports_in_app(self):
        app_dir = Path(__file__).resolve().parent.parent / "app"
        for py_file in app_dir.rglob("*.py"):
            source = py_file.read_text(encoding="utf-8")
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        for forbidden in self.FORBIDDEN_MODULES:
                            assert not alias.name.startswith(forbidden.split(".")[0].replace(".", "")), (
                                f"PELANGGARAN: {py_file.name} mengimport {alias.name} "
                                f"(modul vision/AI terlarang untuk site-agent scaffold)"
                            )
                elif isinstance(node, ast.ImportFrom):
                    module = node.module or ""
                    for forbidden in self.FORBIDDEN_MODULES:
                        assert not module.startswith(forbidden.split(".")[0]), (
                            f"PELANGGARAN: {py_file.name} mengimport from {module} "
                            f"(modul vision/AI terlarang untuk site-agent scaffold)"
                        )
