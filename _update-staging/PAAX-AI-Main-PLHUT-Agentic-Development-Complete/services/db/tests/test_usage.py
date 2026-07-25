import pytest
from fastapi.testclient import TestClient
from paax_db.main import app
import os

client = TestClient(app)

# Override internal key for tests
os.environ["INTERNAL_SERVICE_KEY"] = "test-internal-key"

@pytest.fixture
def auth_headers():
    return {
        "X-Internal-Key": "test-internal-key",
        "X-User-Id": "tenant-123"
    }

def test_check_quota_creates_default(auth_headers):
    # Testing GET /usage/quota/check
    res = client.get("/usage/quota/check?tenant_id=tenant-123", headers=auth_headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["tenant_id"] == "tenant-123"
    assert data["plan"] == "free"
    assert data["limit"] == 100
    assert data["used"] == 0
    assert data["remaining"] == 100
    assert data["quota_exceeded"] is False

def test_log_usage_increments_quota(auth_headers):
    # Log usage
    payload = {
        "tenant_id": "tenant-123",
        "service": "document-intelligence",
        "operation": "test-ops",
        "success": True,
        "tokens_in": 10,
        "tokens_out": 20
    }
    res = client.post("/usage/log", json=payload, headers=auth_headers)
    assert res.status_code == 200, res.text
    
    # Check quota again, used should be 1
    res = client.get("/usage/quota/check?tenant_id=tenant-123", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["used"] == 1
    assert data["remaining"] == 99

def test_usage_summary(auth_headers):
    payload = {
        "tenant_id": "tenant-123",
        "service": "document-intelligence",
        "operation": "test-ops",
        "success": True,
        "tokens_in": 10,
        "tokens_out": 20
    }
    seed = client.post("/usage/log", json=payload, headers=auth_headers)
    assert seed.status_code == 200, seed.text

    res = client.get("/usage/summary?tenant_id=tenant-123", headers=auth_headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["total_tokens_in"] >= 10
    assert data["total_tokens_out"] >= 20
    assert "test-ops" in data["operations_count"]

def test_usage_anomalies(auth_headers):
    res = client.get("/usage/anomalies?tenant_id=tenant-123", headers=auth_headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["tenant_id"] == "tenant-123"
    # Anomaly requires threshold, but just check schema
    assert "today_calls" in data
    assert "avg_7day" in data
    assert "is_anomaly" in data
