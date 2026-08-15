from __future__ import annotations

import json

import pytest

from app.transcription.failure_classification import DemProviderError
from app.transcription.providers.base import PageContext
from app.transcription.providers.mock import MockDemAdapter
from app.transcription.providers.qwen import QwenDemAdapter, _build_partial_fallback


# ---------------------------------------------------------------------------
# MockDemAdapter tests (unchanged)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# QwenDemAdapter.from_env() tests
# ---------------------------------------------------------------------------

def test_qwen_adapter_from_env_returns_none_when_key_missing(monkeypatch):
    monkeypatch.delenv("DRAWING_INTELLIGENCE_API_KEY", raising=False)

    assert QwenDemAdapter.from_env() is None


def test_qwen_adapter_from_env_builds_when_key_present(monkeypatch):
    monkeypatch.setenv("DRAWING_INTELLIGENCE_API_KEY", "test-key-123")
    monkeypatch.setenv(
        "DRAWING_INTELLIGENCE_BASE_URL",
        "https://opencode.ai/zen/go/v1",
    )
    monkeypatch.setenv("DRAWING_INTELLIGENCE_QWEN_MODEL", "mimo-v2.5")
    monkeypatch.setenv("DRAWING_INTELLIGENCE_DEEPSEEK_MODEL", "deepseek-v4-flash")

    adapter = QwenDemAdapter.from_env()

    assert adapter is not None
    assert adapter.model == "mimo-v2.5"
    assert adapter.deepseek_model == "deepseek-v4-flash"


def test_qwen_adapter_from_env_uses_defaults_when_deepseek_model_empty(monkeypatch):
    monkeypatch.setenv("DRAWING_INTELLIGENCE_API_KEY", "test-key-123")
    monkeypatch.delenv("DRAWING_INTELLIGENCE_DEEPSEEK_MODEL", raising=False)

    adapter = QwenDemAdapter.from_env()

    assert adapter is not None
    assert adapter.deepseek_model == "deepseek-v4-flash"


# ---------------------------------------------------------------------------
# Two-stage pipeline request shape tests
# ---------------------------------------------------------------------------

def _make_valid_dem_output(sheet_number="A-01", sheet_title="Denah"):
    """Build a minimal DemModelOutput-valid dict for use in tests."""
    return {
        "sheet_identity": {
            "sheet_number": {"value": sheet_number, "raw": sheet_number, "confidence": 0.9, "evidence_refs": ["ev-sheet-num"]},
            "title": {"value": sheet_title, "raw": sheet_title, "confidence": 0.9, "evidence_refs": ["ev-sheet-title"]},
            "discipline": {"value": "architecture", "confidence": 0.85, "status": "ai_interpreted"},
            "scale_candidates": [],
        },
        "views": [],
        "observations": {
            "texts": [{"raw": "DENAH LANTAI 1", "confidence": 0.95, "status": "extracted", "evidence_refs": ["ev-text-0"]}],
            "dimensions": [],
            "grids": [],
            "levels": [],
            "spaces": [],
            "element_labels": [],
            "symbols": [],
            "tables": [],
            "materials": [],
            "notes": [],
            "references": [],
            "patterns": [],
            "geometry_descriptions": [],
        },
        "evidence": [
            {"evidence_id": "ev-sheet-num", "kind": "ocr_text", "raw": sheet_number, "confidence": 0.9},
            {"evidence_id": "ev-sheet-title", "kind": "ocr_text", "raw": sheet_title, "confidence": 0.9},
            {"evidence_id": "ev-text-0", "kind": "ocr_text", "raw": "DENAH LANTAI 1", "confidence": 0.95},
        ],
        "ambiguities": [],
        "conflicts": [],
        "unclassified": [],
        "completion": {"sections_expected": 13, "sections_completed": 13, "is_complete": True},
    }


def _make_stage1_raw():
    """Minimal stage-1 raw dict (mimo-v2.5 simple schema output)."""
    return {
        "sheet_number": "A-01",
        "sheet_title": "DENAH LANTAI 1",
        "discipline": "architecture",
        "scale": "1:100",
        "texts": [{"value": "DENAH LANTAI 1"}],
        "dimensions": [{"value": "3600"}],
        "grids": [],
        "levels": [],
        "spaces": [],
        "element_labels": [],
        "symbols": [],
        "tables": [],
        "materials": [],
        "notes": [],
        "references": [],
        "patterns": [],
        "geometry_descriptions": [],
        "views": [],
    }


class _FakeUrlopen:
    """Mock urllib_request.urlopen for two-stage pipeline testing."""

    def __init__(self, stage1_response: dict, stage2_response: dict):
        self._stage1_response = stage1_response
        self._stage2_response = stage2_response
        self.calls: list[dict] = []

    def __call__(self, req, timeout=None):
        payload = json.loads(req.data.decode("utf-8"))
        self.calls.append(payload)
        # Stage 2 response has no image_url in the messages
        has_image = any(
            isinstance(c, dict) and c.get("type") == "image_url"
            for msg in payload.get("messages", [])
            for c in (msg.get("content") if isinstance(msg.get("content"), list) else [])
        )
        response_body = self._stage1_response if has_image else self._stage2_response

        class _Resp:
            def read(self_inner):
                return json.dumps(response_body).encode("utf-8")
            def __enter__(self_inner): return self_inner
            def __exit__(self_inner, *a): return False

        return _Resp()


def test_two_stage_pipeline_calls_both_stages(monkeypatch):
    """extract_page() must make exactly two HTTP calls: stage1 (with image) + stage2 (text-only)."""
    stage1_raw = _make_stage1_raw()
    stage2_result = _make_valid_dem_output()

    fake = _FakeUrlopen(
        stage1_response={"choices": [{"message": {"content": json.dumps(stage1_raw)}}]},
        stage2_response={"choices": [{"message": {"content": json.dumps(stage2_result)}}]},
    )
    monkeypatch.setattr("app.transcription.providers.qwen.urllib_request.urlopen", fake)

    adapter = QwenDemAdapter(
        api_key="test-key",
        base_url="https://opencode.ai/zen/go/v1",
        model="mimo-v2.5",
        deepseek_model="deepseek-v4-flash",
    )
    result = adapter.extract_page(
        b"fake-png-bytes",
        PageContext(document_id="DOC-1", page_index=0, page_number=1),
        "dem-extraction-v2.0.0",
    )

    assert len(fake.calls) == 2, f"Expected 2 HTTP calls, got {len(fake.calls)}"

    # Stage 1 call: must use mimo-v2.5, must include image_url
    stage1_payload = fake.calls[0]
    assert stage1_payload["model"] == "mimo-v2.5"
    has_image = any(
        isinstance(c, dict) and c.get("type") == "image_url"
        for msg in stage1_payload.get("messages", [])
        for c in (msg.get("content") if isinstance(msg.get("content"), list) else [])
    )
    assert has_image, "Stage 1 payload must include an image_url content part"
    assert stage1_payload.get("max_tokens", 0) >= 4096, "Stage 1 max_tokens must be >= 4096"

    # Stage 2 call: must use deepseek-v4-flash, must NOT include image_url
    stage2_payload = fake.calls[1]
    assert stage2_payload["model"] == "deepseek-v4-flash"
    has_image_s2 = any(
        isinstance(c, dict) and c.get("type") == "image_url"
        for msg in stage2_payload.get("messages", [])
        for c in (msg.get("content") if isinstance(msg.get("content"), list) else [])
    )
    assert not has_image_s2, "Stage 2 payload must NOT include image_url (text-only)"
    assert stage2_payload.get("max_tokens", 0) >= 16384, "Stage 2 max_tokens must be >= 16384"
    assert stage2_payload.get("response_format", {}).get("type") == "json_object"

    # Final result must be the stage-2 output
    assert result["sheet_identity"]["sheet_number"]["value"] == "A-01"
    assert result["completion"]["is_complete"] is True


def test_two_stage_pipeline_both_requests_have_curl_user_agent(monkeypatch):
    """Both stage 1 and stage 2 HTTP requests must use User-Agent: curl/8.5.0 (WAF bypass)."""
    stage1_raw = _make_stage1_raw()
    stage2_result = _make_valid_dem_output()
    captured_headers = []

    class _UaCaptureFake:
        def __init__(self):
            self.calls = []

        def __call__(self, req, timeout=None):
            captured_headers.append(dict(req.headers))
            payload = json.loads(req.data.decode("utf-8"))
            has_image = any(
                isinstance(c, dict) and c.get("type") == "image_url"
                for msg in payload.get("messages", [])
                for c in (msg.get("content") if isinstance(msg.get("content"), list) else [])
            )
            body = stage1_raw if has_image else stage2_result

            class _Resp:
                def read(self_inner):
                    return json.dumps({"choices": [{"message": {"content": json.dumps(body)}}]}).encode()
                def __enter__(self_inner): return self_inner
                def __exit__(self_inner, *a): return False

            return _Resp()

    monkeypatch.setattr("app.transcription.providers.qwen.urllib_request.urlopen", _UaCaptureFake())
    adapter = QwenDemAdapter(
        api_key="test-key", base_url="https://opencode.ai/zen/go/v1",
        model="mimo-v2.5", deepseek_model="deepseek-v4-flash",
    )
    adapter.extract_page(b"img", PageContext("D", 0, 1), "v1")

    assert len(captured_headers) == 2
    for headers in captured_headers:
        # urllib capitalizes first letter of each header word
        ua = headers.get("User-agent") or headers.get("User-Agent") or ""
        assert ua == "curl/8.5.0", f"Expected 'curl/8.5.0', got {ua!r}"


def test_stage2_failure_returns_partial_fallback_not_raises(monkeypatch):
    """If stage 2 (deepseek) fails, extract_page() must return a partial fallback dict
    (not raise), with is_complete=False and next_cursor pointing to stage2_formatting."""
    stage1_raw = _make_stage1_raw()
    call_count = [0]

    def _fake_urlopen(req, timeout=None):
        call_count[0] += 1
        payload = json.loads(req.data.decode("utf-8"))
        has_image = any(
            isinstance(c, dict) and c.get("type") == "image_url"
            for msg in payload.get("messages", [])
            for c in (msg.get("content") if isinstance(msg.get("content"), list) else [])
        )
        if has_image:
            # Stage 1 succeeds
            class _Resp1:
                def read(self_inner):
                    return json.dumps({"choices": [{"message": {"content": json.dumps(stage1_raw)}}]}).encode()
                def __enter__(self_inner): return self_inner
                def __exit__(self_inner, *a): return False
            return _Resp1()
        else:
            # Stage 2 fails with HTTP 429
            from urllib.error import HTTPError
            raise HTTPError(url="", code=429, msg="Too Many Requests", hdrs={}, fp=None)

    monkeypatch.setattr("app.transcription.providers.qwen.urllib_request.urlopen", _fake_urlopen)
    adapter = QwenDemAdapter(
        api_key="test-key", base_url="https://opencode.ai/zen/go/v1",
        model="mimo-v2.5", deepseek_model="deepseek-v4-flash",
    )
    result = adapter.extract_page(b"img", PageContext("D", 0, 1), "v1")

    assert result["completion"]["is_complete"] is False
    assert result["completion"]["next_cursor"] == "stage2_formatting"
    assert result["sheet_identity"]["sheet_number"]["value"] == "A-01"


def test_stage1_failure_propagates_dem_provider_error(monkeypatch):
    """If stage 1 (mimo) fails, DemProviderError must propagate (no silent fallback)."""
    from urllib.error import HTTPError

    def _fake_urlopen(req, timeout=None):
        raise HTTPError(url="", code=503, msg="Service Unavailable", hdrs={}, fp=None)

    monkeypatch.setattr("app.transcription.providers.qwen.urllib_request.urlopen", _fake_urlopen)
    adapter = QwenDemAdapter(
        api_key="test-key", base_url="https://opencode.ai/zen/go/v1",
        model="mimo-v2.5", deepseek_model="deepseek-v4-flash",
    )
    with pytest.raises(DemProviderError) as exc_info:
        adapter.extract_page(b"img", PageContext("D", 0, 1), "v1")

    assert exc_info.value.kind == "transient"


def test_stage1_uses_simple_schema_not_full_dem_schema(monkeypatch):
    """Stage 1 (mimo) must use a simple schema, not the complex DemModelOutput schema.
    Specifically: schema must NOT contain 'evidence_refs' or 'EvidenceItem' (complex parts
    that mimo-v2.5 ignores in training). It MUST be a simple schema with sheet_number/sheet_title."""
    stage1_raw = _make_stage1_raw()
    stage2_result = _make_valid_dem_output()
    captured_s1_payload = {}

    fake = _FakeUrlopen(
        stage1_response={"choices": [{"message": {"content": json.dumps(stage1_raw)}}]},
        stage2_response={"choices": [{"message": {"content": json.dumps(stage2_result)}}]},
    )

    original_call = fake.__call__
    def _capturing_call(req, timeout=None):
        payload = json.loads(req.data.decode("utf-8"))
        has_image = any(
            isinstance(c, dict) and c.get("type") == "image_url"
            for msg in payload.get("messages", [])
            for c in (msg.get("content") if isinstance(msg.get("content"), list) else [])
        )
        if has_image:
            captured_s1_payload.update(payload)
        return original_call(req, timeout=timeout)

    monkeypatch.setattr("app.transcription.providers.qwen.urllib_request.urlopen", _capturing_call)
    adapter = QwenDemAdapter(
        api_key="test-key", base_url="https://opencode.ai/zen/go/v1",
        model="mimo-v2.5", deepseek_model="deepseek-v4-flash",
    )
    adapter.extract_page(b"img", PageContext("D", 0, 1), "v1")

    schema = captured_s1_payload.get("response_format", {}).get("json_schema", {}).get("schema", {})
    props = schema.get("properties", {})
    # Simple schema must have sheet_number and sheet_title
    assert "sheet_number" in props, "Stage 1 schema must have sheet_number"
    assert "sheet_title" in props, "Stage 1 schema must have sheet_title"
    # Must NOT contain complex DemModelOutput-specific fields
    schema_str = json.dumps(schema)
    assert "EvidenceItem" not in schema_str, "Stage 1 schema must NOT contain 'EvidenceItem'"
    assert "evidence_refs" not in schema_str, "Stage 1 schema must NOT contain 'evidence_refs' (mimo-v2.5 ignores it)"


def test_partial_fallback_builder_structure():
    """_build_partial_fallback must return a DemModelOutput-compatible dict."""
    raw = {
        "sheet_number": "S-01",
        "sheet_title": "DENAH STRUKTUR",
        "discipline": "structure",
    }
    fallback = _build_partial_fallback(raw, "stage2 rate limited")

    assert fallback["completion"]["is_complete"] is False
    assert fallback["completion"]["next_cursor"] == "stage2_formatting"
    assert fallback["sheet_identity"]["sheet_number"]["value"] == "S-01"
    assert fallback["sheet_identity"]["title"]["value"] == "DENAH STRUKTUR"
    assert fallback["sheet_identity"]["discipline"]["value"] == "structure"
    # Must have all 13 observation categories
    obs = fallback["observations"]
    for cat in ["texts", "dimensions", "grids", "levels", "spaces", "element_labels",
                "symbols", "tables", "materials", "notes", "references", "patterns",
                "geometry_descriptions"]:
        assert cat in obs, f"observations.{cat} missing from fallback"
    # ambiguities must mention the failure reason
    assert any("stage2_failed" in a for a in fallback["ambiguities"])


# ---------------------------------------------------------------------------
# Stage2 retry-with-larger-budget tests (REV4 fix)
# ---------------------------------------------------------------------------

def _make_urlopen_with_finish_reason(stage1_raw, stage2_body_fn):
    """Return a fake urlopen that routes by image presence.
    stage2_body_fn(call_index) -> dict response body for stage2 calls.
    """
    call_count = [0]

    def _fake(req, timeout=None):
        payload = json.loads(req.data.decode("utf-8"))
        has_image = any(
            isinstance(c, dict) and c.get("type") == "image_url"
            for msg in payload.get("messages", [])
            for c in (msg.get("content") if isinstance(msg.get("content"), list) else [])
        )

        class _Resp:
            def __init__(self, body):
                self._body = body
            def read(self_inner):
                return json.dumps(self_inner._body).encode("utf-8")
            def __enter__(self_inner): return self_inner
            def __exit__(self_inner, *a): return False

        if has_image:
            return _Resp({"choices": [{"message": {"content": json.dumps(stage1_raw)}, "finish_reason": "stop"}]})
        else:
            idx = call_count[0]
            call_count[0] += 1
            return _Resp(stage2_body_fn(idx, payload))

    _fake.call_count = call_count
    return _fake


def test_stage2_retries_on_finish_reason_length(monkeypatch):
    """If attempt 1 returns finish_reason=length, attempt 2 must be made with max_tokens=32768."""
    stage1_raw = _make_stage1_raw()
    stage2_result = _make_valid_dem_output()

    # Attempt 0 (16384): finish_reason=length (truncated).
    # Attempt 1 (32768): finish_reason=stop, valid JSON.
    def stage2_body(idx, payload):
        if idx == 0:
            return {"choices": [{"message": {"content": "{\"incomplete\":"}, "finish_reason": "length"}]}
        return {"choices": [{"message": {"content": json.dumps(stage2_result)}, "finish_reason": "stop"}]}

    fake = _make_urlopen_with_finish_reason(stage1_raw, stage2_body)
    monkeypatch.setattr("app.transcription.providers.qwen.urllib_request.urlopen", fake)

    adapter = QwenDemAdapter(
        api_key="test-key", base_url="https://opencode.ai/zen/go/v1",
        model="mimo-v2.5", deepseek_model="deepseek-v4-flash",
    )
    result = adapter.extract_page(b"img", PageContext("D", 0, 1), "v1")

    assert result["completion"]["is_complete"] is True
    assert fake.call_count[0] == 2, f"Expected 2 stage2 calls (attempt1 + retry), got {fake.call_count[0]}"


def test_stage2_retries_on_invalid_json(monkeypatch):
    """If attempt 1 returns invalid/truncated JSON (finish_reason=stop), attempt 2 must be made."""
    stage1_raw = _make_stage1_raw()
    stage2_result = _make_valid_dem_output()

    def stage2_body(idx, payload):
        if idx == 0:
            # Unterminated JSON — typical real-world truncation
            return {"choices": [{"message": {"content": '{"sheet_identity": {"sheet_number": {"value": "A-01"'}, "finish_reason": "stop"}]}
        return {"choices": [{"message": {"content": json.dumps(stage2_result)}, "finish_reason": "stop"}]}

    fake = _make_urlopen_with_finish_reason(stage1_raw, stage2_body)
    monkeypatch.setattr("app.transcription.providers.qwen.urllib_request.urlopen", fake)

    adapter = QwenDemAdapter(
        api_key="test-key", base_url="https://opencode.ai/zen/go/v1",
        model="mimo-v2.5", deepseek_model="deepseek-v4-flash",
    )
    result = adapter.extract_page(b"img", PageContext("D", 0, 1), "v1")

    assert result["completion"]["is_complete"] is True
    assert fake.call_count[0] == 2, f"Expected 2 stage2 calls, got {fake.call_count[0]}"
    # Attempt 2 must use extended budget
    # (verified via call_count — the 2nd call has max_tokens=32768 per _ATTEMPTS definition)


def test_stage2_both_attempts_truncated_returns_partial_fallback(monkeypatch):
    """If both attempt 1 AND attempt 2 are truncated, extract_page must return partial fallback."""
    stage1_raw = _make_stage1_raw()

    def stage2_body(idx, payload):
        # Both attempts return finish_reason=length
        return {"choices": [{"message": {"content": '{"incomplete":'}, "finish_reason": "length"}]}

    fake = _make_urlopen_with_finish_reason(stage1_raw, stage2_body)
    monkeypatch.setattr("app.transcription.providers.qwen.urllib_request.urlopen", fake)

    adapter = QwenDemAdapter(
        api_key="test-key", base_url="https://opencode.ai/zen/go/v1",
        model="mimo-v2.5", deepseek_model="deepseek-v4-flash",
    )
    result = adapter.extract_page(b"img", PageContext("D", 0, 1), "v1")

    assert result["completion"]["is_complete"] is False
    assert result["completion"]["next_cursor"] == "stage2_formatting"
    assert fake.call_count[0] == 2, f"Expected 2 stage2 attempts before giving up, got {fake.call_count[0]}"


def test_stage2_attempt2_uses_larger_budget(monkeypatch):
    """Verify that attempt 2 uses max_tokens=32768 (double the default 16384)."""
    stage1_raw = _make_stage1_raw()
    stage2_result = _make_valid_dem_output()
    captured_payloads = []

    def stage2_body(idx, payload):
        captured_payloads.append(payload)
        if idx == 0:
            return {"choices": [{"message": {"content": '{"bad json'}, "finish_reason": "stop"}]}
        return {"choices": [{"message": {"content": json.dumps(stage2_result)}, "finish_reason": "stop"}]}

    fake = _make_urlopen_with_finish_reason(stage1_raw, stage2_body)
    monkeypatch.setattr("app.transcription.providers.qwen.urllib_request.urlopen", fake)

    adapter = QwenDemAdapter(
        api_key="test-key", base_url="https://opencode.ai/zen/go/v1",
        model="mimo-v2.5", deepseek_model="deepseek-v4-flash",
    )
    adapter.extract_page(b"img", PageContext("D", 0, 1), "v1")

    assert len(captured_payloads) == 2
    assert captured_payloads[0]["max_tokens"] == 16384, "Attempt 1 must use max_tokens=16384"
    assert captured_payloads[1]["max_tokens"] == 32768, "Attempt 2 must use max_tokens=32768"


def test_stage1_retries_truncated_json_with_larger_budget(monkeypatch):
    """A truncated MiMo response must be retried before the page is failed.

    This guards the live failure where the first vision response ended in an
    unterminated JSON string.  The external HTTP boundary is faked, while the
    real adapter must retry Stage 1 at the larger budget and still complete
    the Stage-2 formatting pass.
    """
    stage1_raw = _make_stage1_raw()
    stage2_result = _make_valid_dem_output()
    stage1_payloads: list[dict] = []

    def _fake_urlopen(req, timeout=None):
        payload = json.loads(req.data.decode("utf-8"))
        has_image = any(
            isinstance(content, dict) and content.get("type") == "image_url"
            for message in payload.get("messages", [])
            for content in (message.get("content") if isinstance(message.get("content"), list) else [])
        )

        if has_image:
            stage1_payloads.append(payload)
            response = (
                {"choices": [{"message": {"content": '{"sheet_number":"A-01'}, "finish_reason": "length"}]}
                if len(stage1_payloads) == 1
                else {"choices": [{"message": {"content": json.dumps(stage1_raw)}, "finish_reason": "stop"}]}
            )
        else:
            response = {"choices": [{"message": {"content": json.dumps(stage2_result)}, "finish_reason": "stop"}]}

        class _Resp:
            def read(self_inner):
                return json.dumps(response).encode("utf-8")
            def __enter__(self_inner): return self_inner
            def __exit__(self_inner, *args): return False

        return _Resp()

    monkeypatch.setattr("app.transcription.providers.qwen.urllib_request.urlopen", _fake_urlopen)
    adapter = QwenDemAdapter(
        api_key="test-key", base_url="https://opencode.ai/zen/go/v1",
        model="mimo-v2.5", deepseek_model="deepseek-v4-flash",
    )

    result = adapter.extract_page(b"img", PageContext("D", 3, 4), "v1")

    assert result["completion"]["is_complete"] is True
    assert [payload["max_tokens"] for payload in stage1_payloads] == [4096, 8192]


def test_stage1_retries_invalid_json_even_when_finish_reason_is_stop(monkeypatch):
    """MiMo can return malformed JSON without declaring `length`; retry it too."""
    stage1_raw = _make_stage1_raw()
    stage2_result = _make_valid_dem_output()
    stage1_payloads: list[dict] = []

    def _fake_urlopen(req, timeout=None):
        payload = json.loads(req.data.decode("utf-8"))
        has_image = any(
            isinstance(content, dict) and content.get("type") == "image_url"
            for message in payload.get("messages", [])
            for content in (message.get("content") if isinstance(message.get("content"), list) else [])
        )
        if has_image:
            stage1_payloads.append(payload)
            response = (
                {"choices": [{"message": {"content": '{"dimensions": ['}, "finish_reason": "stop"}]}
                if len(stage1_payloads) == 1
                else {"choices": [{"message": {"content": json.dumps(stage1_raw)}, "finish_reason": "stop"}]}
            )
        else:
            response = {"choices": [{"message": {"content": json.dumps(stage2_result)}, "finish_reason": "stop"}]}

        class _Resp:
            def read(self_inner):
                return json.dumps(response).encode("utf-8")
            def __enter__(self_inner): return self_inner
            def __exit__(self_inner, *args): return False

        return _Resp()

    monkeypatch.setattr("app.transcription.providers.qwen.urllib_request.urlopen", _fake_urlopen)
    adapter = QwenDemAdapter(
        api_key="test-key", base_url="https://opencode.ai/zen/go/v1",
        model="mimo-v2.5", deepseek_model="deepseek-v4-flash",
    )

    result = adapter.extract_page(b"img", PageContext("D", 3, 4), "v1")

    assert result["completion"]["is_complete"] is True
    assert [payload["max_tokens"] for payload in stage1_payloads] == [4096, 8192]


def test_stage1_retries_after_extended_truncation_before_failing(monkeypatch):
    """Dense sheets get a final larger vision budget before invalidating the page."""
    stage1_raw = _make_stage1_raw()
    stage2_result = _make_valid_dem_output()
    stage1_payloads: list[dict] = []

    def _fake_urlopen(req, timeout=None):
        payload = json.loads(req.data.decode("utf-8"))
        has_image = any(
            isinstance(content, dict) and content.get("type") == "image_url"
            for message in payload.get("messages", [])
            for content in (message.get("content") if isinstance(message.get("content"), list) else [])
        )
        if has_image:
            stage1_payloads.append(payload)
            if len(stage1_payloads) < 3:
                response = {"choices": [{"message": {"content": '{"truncated":'}, "finish_reason": "length"}]}
            else:
                response = {"choices": [{"message": {"content": json.dumps(stage1_raw)}, "finish_reason": "stop"}]}
        else:
            response = {"choices": [{"message": {"content": json.dumps(stage2_result)}, "finish_reason": "stop"}]}

        class _Resp:
            def read(self_inner):
                return json.dumps(response).encode("utf-8")
            def __enter__(self_inner): return self_inner
            def __exit__(self_inner, *args): return False

        return _Resp()

    monkeypatch.setattr("app.transcription.providers.qwen.urllib_request.urlopen", _fake_urlopen)
    adapter = QwenDemAdapter(
        api_key="test-key", base_url="https://opencode.ai/zen/go/v1",
        model="mimo-v2.5", deepseek_model="deepseek-v4-flash",
    )

    result = adapter.extract_page(b"img", PageContext("D", 3, 4), "v1")

    assert result["completion"]["is_complete"] is True
    assert [payload["max_tokens"] for payload in stage1_payloads] == [4096, 8192, 16384]
