from __future__ import annotations

import io
import json
from urllib.error import HTTPError

import pytest

from app.project_graph.providers.deepseek import (
    DeepSeekPckmProvider,
    PckmProviderError,
)


class FakeResponse:
    def __init__(self, payload: dict | bytes):
        self._body = payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self._body


class FakeClock:
    def __init__(self, *values: float):
        self._values = iter(values)

    def __call__(self) -> float:
        return next(self._values)


def _response(
    *,
    usage: dict | None = None,
    model: str = "deepseek-v4-flash",
    content: str = '{"decision":"requires_review","rationale":"Evidence remains ambiguous."}',
) -> FakeResponse:
    payload = {
        "model": model,
        "choices": [{"message": {"content": content}}],
    }
    if usage is not None:
        payload["usage"] = usage
    return FakeResponse(payload)


def _http_error(status: int) -> HTTPError:
    return HTTPError(
        url="https://provider.test/chat/completions",
        code=status,
        msg=f"status {status}",
        hdrs=None,
        fp=io.BytesIO(b'{"error":{"message":"failure"}}'),
    )


def test_resolve_captures_all_usage_fields_and_latency_from_injected_clock():
    sent: dict[str, object] = {}

    def transport(request, timeout):
        sent["url"] = request.full_url
        sent["body"] = json.loads(request.data.decode("utf-8"))
        sent["timeout"] = timeout
        return _response(
            usage={
                "prompt_tokens": 11,
                "completion_tokens": 7,
                "prompt_cache_hit_tokens": 3,
                "completion_tokens_details": {"reasoning_tokens": 2},
            },
            model="provider-flash-2026",
        )

    provider = DeepSeekPckmProvider(
        api_key="test-key",
        model_alias="deepseek-v4-flash",
        api_url="https://provider.test/chat/completions",
        urlopen=transport,
        clock=FakeClock(10.0, 10.125),
    )

    result = provider.resolve({"candidate_id": "C-1", "kind": "alias"})

    assert result.payload == {
        "decision": "requires_review",
        "rationale": "Evidence remains ambiguous.",
    }
    assert result.prompt_version == "pckm-resolution-v1"
    assert result.model == "provider-flash-2026"
    assert result.latency_ms == 125
    assert result.usage.prompt_tokens == 11
    assert result.usage.completion_tokens == 7
    assert result.usage.cached_tokens == 3
    assert result.usage.reasoning_tokens == 2
    assert sent["url"] == "https://provider.test/chat/completions"
    assert sent["body"]["model"] == "deepseek-v4-flash"
    assert "candidate" not in sent["body"]
    assert json.loads(sent["body"]["messages"][1]["content"]) == {
        "candidate": {"candidate_id": "C-1", "kind": "alias"}
    }


def test_resolve_defaults_usage_fields_when_response_omits_usage():
    provider = DeepSeekPckmProvider(
        api_key="test-key",
        model_alias="deepseek-v4-pro",
        urlopen=lambda request, timeout: _response(),
        clock=FakeClock(2.0, 2.001),
    )

    result = provider.resolve({"candidate_id": "C-2"})

    assert result.usage.prompt_tokens == 0
    assert result.usage.completion_tokens == 0
    assert result.usage.cached_tokens == 0
    assert result.usage.reasoning_tokens == 0


def test_resolve_retries_rate_limit_with_bounded_exponential_backoff():
    attempts = iter([_http_error(429), _http_error(429), _response()])
    sleeps: list[float] = []
    calls = 0

    def transport(request, timeout):
        nonlocal calls
        calls += 1
        return next(attempts)

    provider = DeepSeekPckmProvider(
        api_key="test-key",
        model_alias="deepseek-v4-flash",
        urlopen=transport,
        clock=FakeClock(4.0, 4.01, 4.02),
        sleep=sleeps.append,
        backoff_base_seconds=0.25,
        max_backoff_seconds=0.3,
        max_retries=2,
    )

    result = provider.resolve({"candidate_id": "C-3"})

    assert result.payload["decision"] == "requires_review"
    assert sleeps == [0.25, 0.3]
    assert calls == 3


def test_resolve_exhausts_retryable_errors_after_the_backoff_cap():
    attempts = iter([_http_error(503), _http_error(503), _http_error(503)])
    sleeps: list[float] = []
    calls = 0

    def transport(request, timeout):
        nonlocal calls
        calls += 1
        return next(attempts)

    provider = DeepSeekPckmProvider(
        api_key="test-key",
        model_alias="deepseek-v4-flash",
        urlopen=transport,
        clock=FakeClock(5.0),
        sleep=sleeps.append,
        backoff_base_seconds=0.25,
        max_backoff_seconds=0.3,
        max_retries=2,
    )

    with pytest.raises(PckmProviderError) as exc_info:
        provider.resolve({"candidate_id": "C-3b"})

    assert calls == 3
    assert sleeps == [0.25, 0.3]
    assert exc_info.value.retryable is True


def test_resolve_retries_server_error_then_succeeds():
    attempts = iter([_http_error(503), _response()])
    calls = 0

    def transport(request, timeout):
        nonlocal calls
        calls += 1
        return next(attempts)

    provider = DeepSeekPckmProvider(
        api_key="test-key",
        model_alias="deepseek-v4-pro",
        urlopen=transport,
        clock=FakeClock(8.0, 8.01, 8.02),
        sleep=lambda _seconds: None,
        max_retries=2,
    )

    assert provider.resolve({"candidate_id": "C-4"}).payload["decision"] == "requires_review"
    assert calls == 2


def test_resolve_classifies_permanent_client_error_without_retry():
    calls = 0

    def transport(request, timeout):
        nonlocal calls
        calls += 1
        raise _http_error(422)

    provider = DeepSeekPckmProvider(
        api_key="test-key",
        model_alias="deepseek-v4-flash",
        urlopen=transport,
        clock=FakeClock(12.0),
        sleep=lambda _seconds: pytest.fail("permanent errors must not sleep"),
        max_retries=3,
    )

    with pytest.raises(PckmProviderError) as exc_info:
        provider.resolve({"candidate_id": "C-5"})

    assert calls == 1
    assert exc_info.value.status_code == 422
    assert exc_info.value.retryable is False


def test_provider_rejects_unsupported_system_alias():
    with pytest.raises(ValueError, match="unsupported model alias"):
        DeepSeekPckmProvider(api_key="test-key", model_alias="deepseek-v3")


def test_resolve_classifies_invalid_transport_json():
    provider = DeepSeekPckmProvider(
        api_key="test-key",
        urlopen=lambda request, timeout: FakeResponse(b"not-json"),
        clock=FakeClock(20.0),
    )

    with pytest.raises(PckmProviderError) as exc_info:
        provider.resolve({"candidate_id": "C-6"})

    assert exc_info.value.retryable is False


def test_resolve_classifies_invalid_message_content_json():
    payload = {"choices": [{"message": {"content": "not-json"}}]}
    provider = DeepSeekPckmProvider(
        api_key="test-key",
        urlopen=lambda request, timeout: FakeResponse(payload),
        clock=FakeClock(21.0),
    )

    with pytest.raises(PckmProviderError) as exc_info:
        provider.resolve({"candidate_id": "C-7"})

    assert exc_info.value.retryable is False


def test_resolve_rejects_a_payload_outside_the_pckm_proposal_contract():
    provider = DeepSeekPckmProvider(
        api_key="test-key",
        urlopen=lambda request, timeout: _response(content='{"decision":"merge"}'),
        clock=FakeClock(22.0, 22.001),
    )

    with pytest.raises(PckmProviderError, match="proposal contract"):
        provider.resolve({"candidate_id": "C-8"})
