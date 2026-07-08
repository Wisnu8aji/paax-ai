"""Fase 2 P4 — uji integrasi endpoint /drawings/analyze memakai pipeline baru."""
from __future__ import annotations

import time

from fastapi.testclient import TestClient

from app.main import app
from tests.fixtures.perception._generate_synthetic_table_pdf import build_synthetic_table_pdf_bytes

client = TestClient(app)
AUTH_HEADERS = {"X-Internal-Key": "test-internal-key", "X-User-Id": "test-suite"}


def test_analyze_returns_real_metrics_and_gerbang():
    pdf_bytes = build_synthetic_table_pdf_bytes()
    upload_res = client.post(
        "/upload",
        headers=AUTH_HEADERS,
        files={"file": ("p4_test_sheet.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload_res.status_code == 200

    analyze_res = client.post(
        "/drawings/analyze",
        headers=AUTH_HEADERS,
        json={"file_metadata": {"file_name": "p4_test_sheet.pdf", "file_type": "DRAWING_PDF", "project_id": "prj-test"}},
    )
    assert analyze_res.status_code == 200
    data = analyze_res.json()

    assert data["tkg_document"] is not None
    assert data["tkg_document"]["prj_id"] == "prj-test"
    assert data["tkg_document"]["sheets"][0]["tables"][0]["records"]

    assert data["metrics"] is not None
    assert data["metrics"]["span_total"] > 0
    assert 0.0 <= data["metrics"]["cakupan"] <= 1.0

    assert data["gerbang"] is not None
    assert data["gerbang"]["status"] in ("draft", "lolos")
    codes = {c["code"] for c in data["gerbang"]["checks"]}
    assert "V-06" in codes

    assert data["tkg_text"]
    assert "RECORD" in data["tkg_text"]

    # Fase E: field `consolidated` (ConsolidatedExtraction) ikut dikembalikan.
    assert data["consolidated"] is not None
    assert len(data["consolidated"]["sheets"]) == 1
    assert data["consolidated"]["sheets"][0]["judul"]
    assert data["ai_report"] is not None
    assert data["ai_report"]["next_action_label"] == "Proses RAB"
    assert data["ai_report"]["project_summary"]["total_pages"] == 1


def test_analyze_missing_file_reports_warning_not_crash():
    analyze_res = client.post(
        "/drawings/analyze",
        headers=AUTH_HEADERS,
        json={"file_metadata": {"file_name": "tidak-ada-di-server.pdf", "file_type": "DRAWING_PDF"}},
    )
    assert analyze_res.status_code == 200
    data = analyze_res.json()
    assert data["tkg_document"] is None
    assert any(w["level"] == "CRITICAL" for w in data["warnings"])


def test_analyze_start_and_poll_status_reaches_completed():
    """Fase F: proses latar belakang — job_id segera, poll sampai COMPLETED
    dgn hasil identik ke jalur sinkron /drawings/analyze."""
    pdf_bytes = build_synthetic_table_pdf_bytes()
    upload_res = client.post(
        "/upload",
        headers=AUTH_HEADERS,
        files={"file": ("p4_test_sheet_async.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload_res.status_code == 200

    start_res = client.post(
        "/drawings/analyze/start",
        headers=AUTH_HEADERS,
        json={"file_metadata": {"file_name": "p4_test_sheet_async.pdf", "file_type": "DRAWING_PDF", "project_id": "prj-async"}},
    )
    assert start_res.status_code == 200
    job_id = start_res.json()["job_id"]
    assert start_res.json()["status"] == "PENDING"

    deadline = time.monotonic() + 10
    status_data = None
    while time.monotonic() < deadline:
        status_res = client.get(f"/drawings/analyze/status/{job_id}", headers=AUTH_HEADERS)
        assert status_res.status_code == 200
        status_data = status_res.json()
        if status_data["status"] in ("COMPLETED", "FAILED"):
            break
        time.sleep(0.05)

    assert status_data is not None
    assert status_data["status"] == "COMPLETED", status_data
    assert status_data["result"]["tkg_document"]["prj_id"] == "prj-async"
    assert status_data["result"]["consolidated"] is not None


def test_analyze_status_unknown_job_returns_404():
    res = client.get("/drawings/analyze/status/not-a-real-job-id", headers=AUTH_HEADERS)
    assert res.status_code == 404

