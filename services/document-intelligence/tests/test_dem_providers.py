from __future__ import annotations

import pytest

from app.transcription.failure_classification import DemProviderError
from app.transcription.providers.base import PageContext
from app.transcription.providers.mock import MockDemAdapter
from app.transcription.providers.qwen import QwenDemAdapter


def test_mock_adapter_returns_configured_response():
    adapter = MockDemAdapter(response={"sheet_identity": {"title": {"value": "Test"}}})

    result = adapter.extract_page(
        image_bytes=b"fake-png-bytes",
        page_context=PageContext(document_id="DOC-1", page_index=0, page_number=1),
        prompt_version="dem-extraction-v1.0.0",
    )

    assert result == {"sheet_identity": {"title": {"value": "Test"}}}


def test_mock_adapter_raises_configured_error():
    adapter = MockDemAdapter(error=DemProviderError("rate limited", kind="transient"))

    with pytest.raises(DemProviderError) as exc_info:
        adapter.extract_page(
            image_bytes=b"fake-png-bytes",
            page_context=PageContext(document_id="DOC-1", page_index=0, page_number=1),
            prompt_version="dem-extraction-v1.0.0",
        )

    assert exc_info.value.kind == "transient"


def test_qwen_adapter_from_env_returns_none_when_key_missing(monkeypatch):
    monkeypatch.delenv("DEM_EXTRACTION_API_KEY", raising=False)

    assert QwenDemAdapter.from_env() is None


def test_qwen_adapter_from_env_builds_when_key_present(monkeypatch):
    monkeypatch.setenv("DEM_EXTRACTION_API_KEY", "test-key-123")
    monkeypatch.setenv(
        "DEM_EXTRACTION_BASE_URL",
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    )
    monkeypatch.setenv("DEM_EXTRACTION_MODEL", "qwen3.7-plus")

    adapter = QwenDemAdapter.from_env()

    assert adapter is not None
    assert adapter.model == "qwen3.7-plus"
    assert adapter.reasoning_effort == "xhigh"
