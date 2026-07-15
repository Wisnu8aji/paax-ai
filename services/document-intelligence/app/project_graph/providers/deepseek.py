from __future__ import annotations

import json
import os
import re
import time
from typing import Any, Callable
from urllib import error, request

from app.project_graph.synthesis_types import ModelUsage, PckmProviderResult, PckmSynthesisProvider, ResolutionCandidate

from .base import PckmProviderError

DEFAULT_API_URL = "https://api.deepseek.com/chat/completions"
SUPPORTED_MODEL_ALIASES = frozenset({"deepseek-v4-flash", "deepseek-v4-pro"})


def _as_non_negative_int(value: Any) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return 0
    return max(parsed, 0)


def _usage_from_response(payload: dict[str, Any]) -> ModelUsage:
    usage = payload.get("usage")
    if not isinstance(usage, dict):
        usage = {}
    prompt_details = usage.get("prompt_tokens_details")
    completion_details = usage.get("completion_tokens_details")
    if not isinstance(prompt_details, dict):
        prompt_details = {}
    if not isinstance(completion_details, dict):
        completion_details = {}
    cached_tokens = usage.get("cached_tokens")
    if cached_tokens is None:
        cached_tokens = usage.get("prompt_cache_hit_tokens", prompt_details.get("cached_tokens", 0))
    return ModelUsage(
        prompt_tokens=_as_non_negative_int(usage.get("prompt_tokens", 0)),
        completion_tokens=_as_non_negative_int(usage.get("completion_tokens", 0)),
        cached_tokens=_as_non_negative_int(cached_tokens),
        reasoning_tokens=_as_non_negative_int(
            usage.get("reasoning_tokens", completion_details.get("reasoning_tokens", 0))
        ),
    )


def _content_payload(response_payload: dict[str, Any]) -> dict[str, Any]:
    try:
        choices = response_payload.get("choices")
        if isinstance(choices, list) and choices:
            message = choices[0].get("message")
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, dict):
                    return content
                if isinstance(content, str):
                    text = content.strip()
                    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", text, re.IGNORECASE | re.DOTALL)
                    if fenced:
                        text = fenced.group(1).strip()
                    parsed = json.loads(text)
                    if isinstance(parsed, dict):
                        return parsed
        direct_payload = response_payload.get("payload")
        if isinstance(direct_payload, dict):
            return direct_payload
    except (AttributeError, TypeError, json.JSONDecodeError) as exc:
        raise PckmProviderError("provider response content was not valid JSON") from exc
    raise PckmProviderError("provider response did not contain a JSON object payload")


def _status_code(response: Any) -> int:
    value = getattr(response, "status", getattr(response, "code", 200))
    return int(value)


def _is_retryable_status(status_code: int) -> bool:
    return status_code in {408, 425, 429} or 500 <= status_code <= 599


class DeepSeekPckmProvider(PckmSynthesisProvider):
    """Injectable chat-completions adapter for PCKM candidate resolution."""

    def __init__(
        self,
        *,
        api_key: str,
        model_alias: str | None = None,
        model: str | None = None,
        api_url: str = DEFAULT_API_URL,
        timeout_seconds: float = 30.0,
        urlopen: Callable[..., Any] | None = None,
        transport: Callable[..., Any] | None = None,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        max_retries: int = 3,
        backoff_base_seconds: float = 0.5,
        max_backoff_seconds: float = 8.0,
    ) -> None:
        selected_alias = model_alias or model or "deepseek-v4-flash"
        if selected_alias not in SUPPORTED_MODEL_ALIASES:
            raise ValueError(f"unsupported model alias: {selected_alias}")
        if urlopen is not None and transport is not None:
            raise ValueError("pass only one HTTP transport")
        if max_retries < 0:
            raise ValueError("max_retries must be non-negative")
        if backoff_base_seconds < 0 or max_backoff_seconds < 0:
            raise ValueError("backoff bounds must be non-negative")
        self.api_key = api_key
        self.model_alias = selected_alias
        self.api_url = api_url
        self.timeout_seconds = timeout_seconds
        self._urlopen = urlopen or transport or request.urlopen
        self._clock = clock
        self._sleep = sleep
        self.max_retries = max_retries
        self.backoff_base_seconds = backoff_base_seconds
        self.max_backoff_seconds = max_backoff_seconds

    @classmethod
    def from_env(cls) -> "DeepSeekPckmProvider | None":
        api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
        if not api_key:
            return None
        model_alias = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash").strip() or "deepseek-v4-flash"
        api_url = os.getenv("DEEPSEEK_API_URL", DEFAULT_API_URL).strip() or DEFAULT_API_URL
        return cls(api_key=api_key, model_alias=model_alias, api_url=api_url)

    def resolve(self, candidate: ResolutionCandidate) -> PckmProviderResult:
        started = self._clock()
        candidate_payload = self._candidate_payload(candidate)
        body = {
            "model": self.model_alias,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Resolve the supplied construction knowledge candidate. "
                        "Return only a JSON object with the proposed resolution."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps({"candidate": candidate_payload}, separators=(",", ":")),
                },
            ],
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }
        req = request.Request(
            self.api_url,
            data=json.dumps(body, separators=(",", ":")).encode("utf-8"),
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        response_payload = self._request_with_retry(req)
        result_payload = _content_payload(response_payload)
        elapsed_ms = max(0, int(round((self._clock() - started) * 1000)))
        response_model = response_payload.get("model")
        resolved_model = response_model.strip() if isinstance(response_model, str) and response_model.strip() else self.model_alias
        return PckmProviderResult(
            payload=result_payload,
            usage=_usage_from_response(response_payload),
            model=resolved_model,
            latency_ms=elapsed_ms,
        )

    @staticmethod
    def _candidate_payload(candidate: ResolutionCandidate) -> dict[str, Any]:
        if isinstance(candidate, dict):
            return candidate
        model_dump = getattr(candidate, "model_dump", None)
        if callable(model_dump):
            return model_dump(mode="json")
        as_dict = getattr(candidate, "_asdict", None)
        if callable(as_dict):
            return dict(as_dict())
        if hasattr(candidate, "__dict__"):
            return dict(candidate.__dict__)
        raise TypeError("candidate must be a mapping or structured model")

    def _request_with_retry(self, req: request.Request) -> dict[str, Any]:
        for attempt in range(self.max_retries + 1):
            try:
                with self._urlopen(req, timeout=self.timeout_seconds) as response:
                    status_code = _status_code(response)
                    raw_body = response.read()
                if status_code < 200 or status_code >= 300:
                    raise PckmProviderError(
                        f"provider returned HTTP {status_code}",
                        status_code=status_code,
                        retryable=_is_retryable_status(status_code),
                    )
                try:
                    parsed = json.loads(raw_body.decode("utf-8"))
                except (AttributeError, TypeError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                    raise PckmProviderError("provider response was not valid JSON") from exc
                if not isinstance(parsed, dict):
                    raise PckmProviderError("provider response must be a JSON object")
                return parsed
            except error.HTTPError as exc:
                provider_error = PckmProviderError(
                    f"provider returned HTTP {exc.code}",
                    status_code=exc.code,
                    retryable=_is_retryable_status(exc.code),
                )
                if not provider_error.retryable or attempt >= self.max_retries:
                    raise provider_error from exc
            except PckmProviderError as exc:
                if not exc.retryable or attempt >= self.max_retries:
                    raise
            except (error.URLError, TimeoutError, OSError) as exc:
                if attempt >= self.max_retries:
                    raise PckmProviderError("provider transport failed", retryable=True) from exc
            if attempt < self.max_retries:
                delay = min(self.backoff_base_seconds * (2**attempt), self.max_backoff_seconds)
                self._sleep(delay)
        raise AssertionError("unreachable")


__all__ = [
    "DEFAULT_API_URL",
    "DeepSeekPckmProvider",
    "SUPPORTED_MODEL_ALIASES",
]
