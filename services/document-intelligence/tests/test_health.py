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


def test_health_reports_portable_opencode_go_models(monkeypatch):
    monkeypatch.setenv("DRAWING_INTELLIGENCE_API_KEY", "shared-opencode-go-test-key")
    monkeypatch.setenv("DRAWING_INTELLIGENCE_QWEN_MODEL", "mimo-v2.5")
    monkeypatch.setenv("DRAWING_INTELLIGENCE_DEEPSEEK_MODEL", "deepseek-v4-flash")
    monkeypatch.delenv("OPENCODE_GO_API_KEY", raising=False)

    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["mode"] == "real_ai"
    assert data["ai_provider_configured"] is True
    assert data["providers"] == ["opencode-go"]
    assert data["opencode_go_models"] == {
        "vision": "mimo-v2.5",
        "agent": "deepseek-v4-flash",
    }
