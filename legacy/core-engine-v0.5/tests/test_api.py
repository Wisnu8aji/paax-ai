from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_generate_rab():
    payload = {
        "project_id": "proj-123",
        "project_type": "rumah_tinggal",
        "luas_bangunan": 80.0,
        "jumlah_lantai": 2,
        "lokasi": "jakarta",
        "kelas_bangunan": "menengah"
    }
    response = client.post("/rab/generate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data["groups"]) > 0
    assert data["summary"]["grand_total"] > 0

def test_recalculate_rab():
    payload = {
        "project_id": "proj-123",
        "groups": [
            {
                "id": "group-1",
                "nama": "Pekerjaan Persiapan",
                "kategori": "persiapan",
                "subtotal": 1000000,
                "items": [
                    {
                        "id": "item-1",
                        "kode": "A.01",
                        "uraian": "Pembersihan Lahan",
                        "satuan": "m²",
                        "volume": 100,
                        "harga_satuan": 10000,
                        "jumlah": 1000000,
                        "kategori": "persiapan"
                    }
                ]
            }
        ],
        "ppn_rate": 0.11,
        "contingency_rate": 0.05,
        "overhead_profit_rate": 0.10
    }
    response = client.post("/rab/recalculate", json=payload)
    assert response.status_code == 200
    data = response.json()
    # base total is 1,000,000
    # overhead 10% = 100,000
    # subtotal = 1,000,000
    # ppn 11% = 110,000
    # contingency 5% = 50,000
    # grand_total = 1,000,000 + 110,000 + 50,000 + 100,000 = 1,260,000
    assert data["subtotal"] == 1000000
    assert data["grand_total"] == 1260000
