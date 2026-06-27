"""
Test integrasi API PAAX Core Engine.
Menggunakan FastAPI TestClient (tidak perlu server berjalan).
Nilai acuan dihitung manual dari data contoh — lihat tests/test_rab.py untuk referensi.
"""
from fastapi.testclient import TestClient
from app.main import app

# raise_server_exceptions=False → exception tak tertangani di engine menjadi response 500
# (seperti server HTTP sungguhan), bukan dilempar ulang ke test. Dibutuhkan untuk menguji
# input invalid (mis. mode Kurva S salah) tanpa mengubah app/ (lihat aturan emas).
client = TestClient(app, raise_server_exceptions=False)


class TestHealth:
    def test_health_ok(self):
        r = client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["version"] == "0.6.0"
        assert data["ahsp_items"] >= 4
        assert "jateng" in data["regions"]

    def test_health_has_correct_fields(self):
        r = client.get("/health")
        data = r.json()
        assert "status" in data
        assert "version" in data
        assert "ahsp_items" in data
        assert "regions" in data


class TestAHSP:
    def test_list_ahsp_returns_array(self):
        r = client.get("/ahsp")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 4

    def test_list_ahsp_has_required_fields(self):
        r = client.get("/ahsp")
        item = r.json()[0]
        assert "code" in item
        assert "name" in item
        assert "unit" in item
        assert "bidang" in item

    def test_get_ahsp_detail_exists(self):
        r = client.get("/ahsp/AHSP.CK.001")
        assert r.status_code == 200
        data = r.json()
        assert data["code"] == "AHSP.CK.001"
        assert "components" in data
        assert len(data["components"]) > 0

    def test_get_ahsp_not_found(self):
        r = client.get("/ahsp/TIDAK_ADA_SAMA_SEKALI")
        assert r.status_code == 404

    def test_list_regions(self):
        r = client.get("/regions")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        codes = [item["code"] for item in data]
        assert "jateng" in codes


class TestHSP:
    def test_hsp_known_value(self):
        """HSP AHSP.CK.001 Jawa Tengah = 145.387 (dihitung manual di test_rab.py)"""
        r = client.post("/rab/hsp", json={
            "ahsp_code": "AHSP.CK.001",
            "region_code": "jateng"
        })
        assert r.status_code == 200
        data = r.json()
        assert data["hsp"] == 145387.0
        assert data["bahan"] == 81770.0
        assert data["upah"] == 50400.0
        assert data["alat"] == 0.0

    def test_hsp_has_components(self):
        r = client.post("/rab/hsp", json={
            "ahsp_code": "AHSP.CK.001",
            "region_code": "jateng"
        })
        data = r.json()
        assert "components" in data
        assert len(data["components"]) > 0
        for c in data["components"]:
            assert "resource_code" in c
            assert "category" in c
            assert "coefficient" in c
            assert "unit_price" in c
            assert "subtotal" in c

    def test_hsp_invalid_ahsp_code(self):
        r = client.post("/rab/hsp", json={
            "ahsp_code": "TIDAK_ADA",
            "region_code": "jateng"
        })
        assert r.status_code == 404


class TestRABCalculate:
    def test_rab_two_items_known_subtotal(self):
        """
        Nilai acuan:
          AHSP.CK.001 vol=50: 50 × 145387 = 7.269.350
          AHSP.CK.002 vol=50: 50 × 82845.4 = 4.142.270
          Subtotal = 11.411.620
          PPN 11% = 1.255.278,20
          Total = 12.666.898,20
        """
        r = client.post("/rab/calculate", json={
            "region_code": "jateng",
            "ppn_rate": 0.11,
            "lines": [
                {"ahsp_code": "AHSP.CK.001", "volume": 50},
                {"ahsp_code": "AHSP.CK.002", "volume": 50}
            ]
        })
        assert r.status_code == 200
        data = r.json()
        assert data["subtotal"] == 11411620.0
        assert data["ppn"] == round(11411620.0 * 0.11, 2)
        assert data["total"] == round(11411620.0 * 1.11, 2)
        assert data["region_code"] == "jateng"

    def test_rab_lines_have_weight(self):
        r = client.post("/rab/calculate", json={
            "region_code": "jateng",
            "ppn_rate": 0.11,
            "lines": [
                {"ahsp_code": "AHSP.CK.001", "volume": 100},
                {"ahsp_code": "AHSP.CK.002", "volume": 100}
            ]
        })
        data = r.json()
        total_weight = sum(ln["weight_pct"] for ln in data["lines"])
        assert abs(total_weight - 100.0) < 0.01, f"Bobot total {total_weight} bukan 100%"

    def test_rab_four_items_weights_sum_100(self):
        r = client.post("/rab/calculate", json={
            "region_code": "jateng",
            "lines": [
                {"ahsp_code": "AHSP.CK.001", "volume": 120, "duration_days": 6},
                {"ahsp_code": "AHSP.CK.002", "volume": 240, "duration_days": 8},
                {"ahsp_code": "AHSP.CK.003", "volume": 18,  "duration_days": 5},
                {"ahsp_code": "AHSP.CK.004", "volume": 85,  "duration_days": 7}
            ]
        })
        assert r.status_code == 200
        data = r.json()
        total_weight = sum(ln["weight_pct"] for ln in data["lines"])
        assert abs(total_weight - 100.0) < 0.01

    def test_rab_invalid_ahsp_returns_400(self):
        r = client.post("/rab/calculate", json={
            "region_code": "jateng",
            "lines": [{"ahsp_code": "TIDAK_ADA_KODE", "volume": 10}]
        })
        assert r.status_code == 400

    def test_rab_response_has_all_fields(self):
        r = client.post("/rab/calculate", json={
            "region_code": "jateng",
            "lines": [{"ahsp_code": "AHSP.CK.001", "volume": 10}]
        })
        data = r.json()
        assert "region" in data
        assert "region_code" in data
        assert "lines" in data
        assert "subtotal" in data
        assert "ppn_rate" in data
        assert "ppn" in data
        assert "total" in data


class TestSCurve:
    def test_scurve_sequential_cumulative_reaches_100(self):
        """Titik terakhir Kurva S sequential harus = 100.0"""
        r = client.post("/schedule/s-curve", json={
            "region_code": "jateng",
            "period_days": 7,
            "mode": "sequential",
            "lines": [
                {"ahsp_code": "AHSP.CK.001", "volume": 120, "duration_days": 6},
                {"ahsp_code": "AHSP.CK.002", "volume": 240, "duration_days": 8},
                {"ahsp_code": "AHSP.CK.003", "volume": 18,  "duration_days": 5},
                {"ahsp_code": "AHSP.CK.004", "volume": 85,  "duration_days": 7}
            ]
        })
        assert r.status_code == 200
        data = r.json()
        assert data["total_days"] == 26
        assert data["mode"] == "sequential"
        last = data["points"][-1]
        assert last["cumulative_pct"] == 100.0

    def test_scurve_parallel_cumulative_reaches_100(self):
        """Titik terakhir Kurva S parallel harus = 100.0"""
        r = client.post("/schedule/s-curve", json={
            "region_code": "jateng",
            "period_days": 7,
            "mode": "parallel",
            "lines": [
                {"ahsp_code": "AHSP.CK.001", "volume": 120, "duration_days": 6},
                {"ahsp_code": "AHSP.CK.002", "volume": 240, "duration_days": 8}
            ]
        })
        assert r.status_code == 200
        data = r.json()
        last = data["points"][-1]
        assert last["cumulative_pct"] == 100.0

    def test_scurve_is_monotonically_increasing(self):
        """Kurva S harus selalu naik atau sama, tidak pernah turun"""
        r = client.post("/schedule/s-curve", json={
            "region_code": "jateng",
            "period_days": 7,
            "mode": "sequential",
            "lines": [
                {"ahsp_code": "AHSP.CK.001", "volume": 100, "duration_days": 5},
                {"ahsp_code": "AHSP.CK.002", "volume": 200, "duration_days": 10}
            ]
        })
        data = r.json()
        cums = [p["cumulative_pct"] for p in data["points"]]
        for a, b in zip(cums, cums[1:]):
            assert b >= a, f"Kurva S turun dari {a} ke {b}"

    def test_scurve_points_have_required_fields(self):
        r = client.post("/schedule/s-curve", json={
            "region_code": "jateng",
            "mode": "sequential",
            "lines": [{"ahsp_code": "AHSP.CK.001", "volume": 50, "duration_days": 7}]
        })
        data = r.json()
        for point in data["points"]:
            assert "period" in point
            assert "day_start" in point
            assert "day_end" in point
            assert "planned_pct" in point
            assert "cumulative_pct" in point

    def test_scurve_invalid_mode_returns_422(self):
        r = client.post("/schedule/s-curve", json={
            "region_code": "jateng",
            "mode": "invalid_mode",
            "lines": [{"ahsp_code": "AHSP.CK.001", "volume": 50, "duration_days": 7}]
        })
        assert r.status_code in (400, 422, 500)
