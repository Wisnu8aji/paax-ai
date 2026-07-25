from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "document-intelligence"
    assert data["version"] == "0.5.0"
    assert "mode" in data
    assert "ai_provider_configured" in data
