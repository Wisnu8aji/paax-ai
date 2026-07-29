from __future__ import annotations

import pytest

from app.perception.ai_assist.model_router import (
    ALLOWED_DI_KEY_NAME,
    DrawingIntelligenceModelRouter,
)


def test_router_fails_when_only_other_keys_are_present(monkeypatch):
    monkeypatch.delenv(ALLOWED_DI_KEY_NAME, raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-secret-123")
    monkeypatch.setenv("NVIDIA_API_KEY", "nvapi-secret-456")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-deepseek-secret-789")
    monkeypatch.setenv("DASHSCOPE_API_KEY", "sk-dashscope-secret-000")

    with pytest.raises(RuntimeError, match=ALLOWED_DI_KEY_NAME):
        DrawingIntelligenceModelRouter()


def test_router_succeeds_only_with_drawing_intelligence_api_key(monkeypatch):
    monkeypatch.setenv(ALLOWED_DI_KEY_NAME, "di-secret-key-999")
    router = DrawingIntelligenceModelRouter()
    assert router.get_api_key() == "di-secret-key-999"


def test_api_key_is_never_leaked_in_exceptions(monkeypatch):
    secret_key = "secret_key_value_12345"
    monkeypatch.setenv(ALLOWED_DI_KEY_NAME, secret_key)
    router = DrawingIntelligenceModelRouter()
    err_str = str(router)
    assert secret_key not in err_str
