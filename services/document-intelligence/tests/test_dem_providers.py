from __future__ import annotations

import json

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


def test_qwen_adapter_extract_page_sends_json_schema_and_disables_thinking(monkeypatch):
    # 2026-07-15: a manual test against the real PLHUT fixture showed the
    # model inventing its own JSON shape when only told "follow schema X" in
    # prose. Fixed by forcing json_schema-constrained output + disabling
    # thinking mode (Qwen3.7-Plus does not support structured output while
    # thinking is on). This test locks in both request-shape requirements so
    # a future edit can't silently regress back to free-form JSON.
    #
    # The "reasoning" field (not "extra_body.enable_thinking") is what
    # actually disables thinking on this provider route -- confirmed by an
    # A/B test against two fresh PLHUT pages: extra_body.enable_thinking was
    # silently ignored (reasoning_tokens stayed non-zero), while the
    # top-level "reasoning": {"enabled": false} field genuinely zeroed it
    # out. The same A/B test found reasoning ON extracts ~2.5x fewer
    # evidence items at ~2.5x the cost for this task (transcription, not
    # multi-step judgment) -- so this is a deliberate choice, not just a
    # workaround for the API's thinking/json_schema exclusivity.
    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["payload"] = json.loads(req.data.decode("utf-8"))

        class _FakeResponse:
            def read(self_inner):
                return json.dumps({
                    "choices": [{"message": {"content": json.dumps({
                        "sheet_identity": {
                            "sheet_number": {"value": "A-01", "confidence": 0.9},
                            "title": {"value": "Denah", "confidence": 0.9},
                            "discipline": {"value": "architecture", "confidence": 0.9, "status": "ai_interpreted"},
                        },
                        "completion": {"sections_expected": 13, "sections_completed": 13, "is_complete": True},
                    })}}],
                }).encode("utf-8")

            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *args):
                return False

        return _FakeResponse()

    monkeypatch.setattr("app.transcription.providers.qwen.urllib_request.urlopen", fake_urlopen)

    adapter = QwenDemAdapter(api_key="test-key", base_url="https://openrouter.ai/api/v1", model="qwen/qwen3.7-plus")
    context = PageContext(document_id="DOC-1", page_index=0, page_number=1)
    result = adapter.extract_page(b"fake-png-bytes", context, "dem-extraction-v1.0.0")

    assert result["sheet_identity"]["title"]["value"] == "Denah"
    payload = captured["payload"]
    assert payload["reasoning"]["enabled"] is False
    assert "extra_body" not in payload
    assert payload["response_format"]["type"] == "json_schema"
    assert payload["response_format"]["json_schema"]["strict"] is True
    # The schema sent to the model must be derived from DemModelOutput --
    # sheet_identity is a required top-level property; run_id/document_id/
    # source/generation must NOT appear (those are metadata page_loop.py
    # fills in, never something the vision model is asked to produce).
    schema_properties = payload["response_format"]["json_schema"]["schema"]["properties"]
    assert "sheet_identity" in schema_properties
    assert "run_id" not in schema_properties
    assert "source" not in schema_properties
