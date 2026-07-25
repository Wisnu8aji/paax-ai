from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Callable, Literal, Mapping
from urllib import error, request

from app.project_graph.synthesis_types import (
    ModelUsage,
    PckmProviderResult,
    PckmResolutionProposal,
    PckmSynthesisProvider,
    ResolutionCandidate,
)
from app.project_graph.level_canonicalizer import (
    LevelProviderResult,
    LevelSemanticCandidate,
)

from .base import PckmProviderError

DEFAULT_API_URL = "https://api.deepseek.com/chat/completions"
SUPPORTED_MODEL_ALIASES = frozenset({"deepseek-v4-flash", "deepseek-v4-pro"})
PROMPT_VERSION = "pckm-resolution-v1"
LEVEL_PROMPT_VERSION = "level-semantic-v1"
DEFAULT_FLASH_MODEL = "deepseek-v4-flash"
DEFAULT_PRO_MODEL = "deepseek-v4-pro"


@dataclass(frozen=True)
class DeepSeekJsonResult:
    payload: dict[str, Any]
    usage: ModelUsage
    model: str
    latency_ms: int


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
        # Drawing Intelligence has its own key, separate from Command Room's
        # DEEPSEEK_API_KEY (Lucent/Arete/Noir), so PCKM synthesis spend never
        # mixes with Command Room chat spend.
        api_key = os.getenv("DRAWING_INTELLIGENCE_API_KEY", "").strip()
        if not api_key:
            return None
        model_alias = os.getenv("DRAWING_INTELLIGENCE_DEEPSEEK_MODEL", "deepseek-v4-flash").strip() or "deepseek-v4-flash"
        api_url = os.getenv("DRAWING_INTELLIGENCE_BASE_URL", DEFAULT_API_URL).strip() or DEFAULT_API_URL
        return cls(api_key=api_key, model_alias=model_alias, api_url=api_url)

    def resolve(self, candidate: ResolutionCandidate) -> PckmProviderResult:
        candidate_payload = self._candidate_payload(candidate)
        completion = self.complete_json(
            system_prompt=(
                "Review the supplied construction knowledge candidate. "
                "Return only this JSON object, with no additional fields: "
                '{"decision":"merge|keep_separate|possibly_same|requires_review",'
                '"rationale":"brief evidence-grounded explanation"}. '
                "This is an auditable proposal only; do not calculate values or "
                "assert unprovided facts."
            ),
            user_payload={"candidate": candidate_payload},
        )
        try:
            proposal = PckmResolutionProposal.model_validate(completion.payload)
        except Exception as exc:
            raise PckmProviderError("provider proposal contract was invalid") from exc
        return PckmProviderResult(
            payload=proposal.model_dump(mode="json"),
            usage=completion.usage,
            model=completion.model,
            prompt_version=PROMPT_VERSION,
            latency_ms=completion.latency_ms,
        )

    def complete_json(self, *, system_prompt: str, user_payload: Mapping[str, Any]) -> DeepSeekJsonResult:
        """Run the shared DeepSeek JSON transport without domain-specific validation."""
        started = self._clock()
        body = {
            "model": self.model_alias,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload, separators=(",", ":"))},
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
        return DeepSeekJsonResult(
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


class DeepSeekLevelProvider:
    """Drawing-Intelligence-only semantic level adapter over shared transport."""

    def __init__(
        self,
        *,
        api_key: str,
        flash_model: str = DEFAULT_FLASH_MODEL,
        pro_model: str = DEFAULT_PRO_MODEL,
        api_url: str = DEFAULT_API_URL,
        timeout_seconds: float = 30.0,
        urlopen: Callable[..., Any] | None = None,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        max_retries: int = 3,
        backoff_base_seconds: float = 0.5,
        max_backoff_seconds: float = 8.0,
    ) -> None:
        shared = {
            "api_key": api_key,
            "api_url": api_url,
            "timeout_seconds": timeout_seconds,
            "urlopen": urlopen,
            "clock": clock,
            "sleep": sleep,
            "max_retries": max_retries,
            "backoff_base_seconds": backoff_base_seconds,
            "max_backoff_seconds": max_backoff_seconds,
        }
        self._flash = DeepSeekPckmProvider(model_alias=flash_model, **shared)
        self._pro = DeepSeekPckmProvider(model_alias=pro_model, **shared)

    @classmethod
    def from_env(cls) -> "DeepSeekLevelProvider | None":
        # Do not fall back to the Command Room key: Drawing Intelligence keeps
        # model spend, endpoint routing, and audit scope separate.
        api_key = os.getenv("DRAWING_INTELLIGENCE_API_KEY", "").strip()
        enabled = os.getenv("DRAWING_INTELLIGENCE_LEVEL_PROVIDER", "").strip().casefold()
        if not api_key or enabled not in {"1", "true"}:
            return None
        flash_model = (
            os.getenv("DRAWING_INTELLIGENCE_DEEPSEEK_MODEL", DEFAULT_FLASH_MODEL).strip()
            or DEFAULT_FLASH_MODEL
        )
        pro_model = (
            os.getenv("DRAWING_INTELLIGENCE_DEEPSEEK_PRO_MODEL", DEFAULT_PRO_MODEL).strip()
            or DEFAULT_PRO_MODEL
        )
        api_url = os.getenv("DRAWING_INTELLIGENCE_BASE_URL", DEFAULT_API_URL).strip() or DEFAULT_API_URL
        return cls(
            api_key=api_key,
            flash_model=flash_model,
            pro_model=pro_model,
            api_url=api_url,
        )

    def propose(
        self,
        candidate: LevelSemanticCandidate,
        *,
        tier: Literal["flash", "pro"],
    ) -> LevelProviderResult:
        provider = self._flash if tier == "flash" else self._pro
        system_prompt = (
            "Resolve one construction drawing level candidate against the supplied "
            "project canonical levels. Return only this JSON object, with no extra fields: "
            '{"decision":"merge_to|possibly_same|keep_separate",'
            '"merge_to":"existing canonical level or null",'
            '"rationale":"brief evidence-grounded explanation","confidence":0.0}. '
            "This is an auditable proposal only. Do not invent levels, calculate values, "
            "or override the supplied evidence."
        )
        completion = provider.complete_json(
            system_prompt=system_prompt,
            user_payload={"candidate": candidate.as_audit_input()},
        )
        prompt_hash = sha256(
            f"{LEVEL_PROMPT_VERSION}:{system_prompt}".encode("utf-8")
        ).hexdigest()
        return LevelProviderResult(
            payload=completion.payload,
            model=completion.model,
            prompt_version=LEVEL_PROMPT_VERSION,
            prompt_hash=prompt_hash,
        )


__all__ = [
    "DEFAULT_FLASH_MODEL",
    "DEFAULT_PRO_MODEL",
    "DEFAULT_API_URL",
    "DeepSeekJsonResult",
    "DeepSeekLevelProvider",
    "DeepSeekPckmProvider",
    "LEVEL_PROMPT_VERSION",
    "PROMPT_VERSION",
    "SUPPORTED_MODEL_ALIASES",
]
