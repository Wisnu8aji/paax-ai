"""Fase 2 P4 — uji integrasi endpoint /drawings/analyze memakai pipeline baru."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from tests.fixtures.perception._generate_synthetic_table_pdf import build_synthetic_table_pdf_bytes

client = TestClient(app)


def test_analyze_returns_real_metrics_and_gerbang():
    pdf_bytes = build_synthetic_table_pdf_bytes()
    upload_res = client.post(
        "/upload",
        files={"file": ("p4_test_sheet.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload_res.status_code == 200

    analyze_res = client.post(
        "/drawings/analyze",
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


def test_analyze_missing_file_reports_warning_not_crash():
    analyze_res = client.post(
        "/drawings/analyze",
        json={"file_metadata": {"file_name": "tidak-ada-di-server.pdf", "file_type": "DRAWING_PDF"}},
    )
    assert analyze_res.status_code == 200
    data = analyze_res.json()
    assert data["tkg_document"] is None
    assert any(w["level"] == "CRITICAL" for w in data["warnings"])
