from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

ROOT = Path(__file__).resolve().parents[3]
PDF = ROOT / "GAMBAR KERJA PLHUT SURAKARTA (1).pdf"
HEADERS = {"Authorization": "Bearer test-token-paax-web"}


def test_advanced_zone_definition_and_skill_endpoints(monkeypatch):
    monkeypatch.setenv("TESTING", "1")
    client = TestClient(app)
    with PDF.open("rb") as handle:
        response = client.post("/drawings/intelligence/v2/hierarchical-zones", headers=HEADERS,
                               files={"file": (PDF.name, handle, "application/pdf")}, data={"page_index": "53"})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["multi_scale"] is True
    assert {10,25,100}.issubset({x["denominator"] for x in data["scales"]})

    with PDF.open("rb") as handle:
        response = client.post("/drawings/intelligence/v2/schedule-definitions", headers=HEADERS,
                               files={"file": (PDF.name, handle, "application/pdf")}, data={"page_index": "49", "code": "K2"})
    assert response.status_code == 200, response.text
    selected = response.json()["selected"]
    assert [selected["width_mm"], selected["depth_mm"]] == [250, 600]

    response = client.get("/drawings/intelligence/v2/skills", headers=HEADERS)
    assert response.status_code == 200
    assert any(pack["discipline"] == "infrastructure" for pack in response.json())
