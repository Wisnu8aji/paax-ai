"""
DashScope Qwen vision adapter for Drawing Evidence Model extraction.

JSON Schema-constrained output (2026-07-15 redesign, replacing free-form
"follow this schema name" prompting after a manual test against the real
PLHUT fixture showed the model inventing its own JSON shape instead of the
real DrawingEvidenceSheet structure). The schema sent to the model is
generated directly from DemModelOutput (app.transcription.models) -- one
source of truth, never hand-duplicated here.

Thinking/reasoning is explicitly disabled via the top-level OpenRouter
"reasoning": {"enabled": false} field -- NOT extra_body.enable_thinking,
which was tried first and silently ignored (confirmed by inspecting
usage.completion_tokens_details.reasoning_tokens: it stayed non-zero with
extra_body, and dropped to exactly 0 once switched to the top-level
"reasoning" field -- OpenRouter's own parameter, not a passthrough to
DashScope, which is what actually gets honored end to end).

Reasoning was A/B tested against two fresh, cache-cold PLHUT pages
(2026-07-15) before this decision: reasoning ON cost ~2.5x more tokens per
call and, more importantly, extracted MUCH LESS -- ~76 evidence items /
4 views without reasoning vs ~20 evidence items / 2 views with reasoning on
the same page. finish_reason was "stop" and completion.is_complete was true
in both cases (not a truncation artifact) -- the model spends its reasoning
tokens summarizing/filtering its own observations before writing the final
JSON, which actively hurts a task whose whole point is exhaustive transcription,
not judgment about what's "important" to keep.
"""
from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from urllib import error, request as urllib_request

from app.transcription.failure_classification import DemProviderError, classify_http_error
from app.transcription.models import DemModelOutput
from app.transcription.providers.base import PageContext

_DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
_DEFAULT_MODEL = "qwen3.7-plus"
_DEFAULT_TIMEOUT_SECONDS = 120.0


def _strict_json_schema() -> dict:
    """DemModelOutput.model_json_schema() as an OpenAI-strict-mode schema:
    additionalProperties=false everywhere (Pydantic v2 default already sets
    this) and every property present in "required" -- optional fields keep
    their real type but the key must still appear (nullable via type union),
    which is what OpenAI/OpenRouter's strict json_schema mode demands."""
    schema = DemModelOutput.model_json_schema()

    def _make_strict(node: dict) -> None:
        if node.get("type") == "object" and "properties" in node:
            node["additionalProperties"] = False
            node["required"] = list(node["properties"].keys())
        for value in node.values():
            if isinstance(value, dict):
                _make_strict(value)
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        _make_strict(item)

    _make_strict(schema)
    if "$defs" in schema:
        for definition in schema["$defs"].values():
            _make_strict(definition)
    return schema


# Built once at import time -- the schema is static (derived from a Pydantic
# class definition, not per-request data), so there is no reason to rebuild
# the dict on every extract_page() call across 88 pages.
_DEM_MODEL_OUTPUT_SCHEMA = _strict_json_schema()


@dataclass
class QwenDemAdapter:
    api_key: str
    base_url: str
    model: str
    timeout_seconds: float = _DEFAULT_TIMEOUT_SECONDS

    @classmethod
    def from_env(cls) -> "QwenDemAdapter | None":
        api_key = os.getenv("DEM_EXTRACTION_API_KEY", "").strip()
        if not api_key:
            return None
        base_url = os.getenv("DEM_EXTRACTION_BASE_URL", "").strip() or _DEFAULT_BASE_URL
        model = os.getenv("DEM_EXTRACTION_MODEL", "").strip() or _DEFAULT_MODEL
        return cls(api_key=api_key, base_url=base_url, model=model)

    def extract_page(
        self,
        image_bytes: bytes,
        page_context: PageContext,
        prompt_version: str,
    ) -> dict:
        image_b64 = base64.b64encode(image_bytes).decode("ascii")
        payload = {
            "model": self.model,
            # reasoning.enabled=false (top-level, OpenRouter-native field --
            # NOT extra_body.enable_thinking, which is silently ignored by
            # this provider route; see module docstring for the A/B test
            # that found this). Required for json_schema structured output
            # to work at all on Qwen3.7-Plus (thinking mode and structured
            # output are mutually exclusive on this model family), and also
            # the cheaper + more-complete option for pure transcription.
            "reasoning": {"enabled": False},
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "dem_model_output",
                    "strict": True,
                    "schema": _DEM_MODEL_OUTPUT_SCHEMA,
                },
            },
            # require_parameters: if the routed provider doesn't actually
            # support json_schema, fail loudly (classify_http_error handles
            # the resulting error) instead of OpenRouter silently falling
            # back to a provider that ignores response_format.
            "provider": {"require_parameters": True},
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": _STATIC_INSTRUCTIONS,
                            "cache_control": {"type": "ephemeral"},
                        },
                        {"type": "text", "text": _build_page_prompt(page_context, prompt_version)},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                        },
                    ],
                }
            ],
        }
        req = urllib_request.Request(
            f"{self.base_url.rstrip('/')}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib_request.urlopen(req, timeout=self.timeout_seconds) as response:
                body = json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            raise DemProviderError(
                f"Qwen HTTP {exc.code}: {exc.reason}",
                kind=classify_http_error(exc.code),
            ) from exc
        except error.URLError as exc:
            raise DemProviderError(f"Qwen network error: {exc.reason}", kind="transient") from exc

        try:
            content = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise DemProviderError(f"Qwen response missing message content: {exc}", kind="invalid_output") from exc
        if content is None:
            refusal = body.get("choices", [{}])[0].get("message", {}).get("refusal")
            raise DemProviderError(
                f"Qwen returned no content (refusal={refusal!r}) -- check enable_thinking/response_format support",
                kind="invalid_output",
            )
        try:
            result = json.loads(content)
        except json.JSONDecodeError as exc:
            raise DemProviderError(f"Qwen response not valid JSON: {exc}", kind="invalid_output") from exc
        if not isinstance(result, dict):
            raise DemProviderError("Qwen response JSON is not an object", kind="invalid_output")
        return result


# Static across every call -- marked cache_control:ephemeral so OpenRouter
# can cache this (and the schema-derived instructions folded into
# response_format, where supported) instead of re-billing the same ~9KB of
# schema-describing text on every one of 88 page calls per document.
_STATIC_INSTRUCTIONS = (
    "Anda membaca satu halaman gambar kerja konstruksi. Kembalikan HANYA JSON "
    "sesuai schema yang diberikan (dipaksa oleh response_format, jangan tambah "
    "field di luar itu). Setiap fakta bertekstual WAJIB punya confidence "
    "(0.0-1.0) + evidence_refs + status (extracted|ai_interpreted|ambiguous|"
    "conflicting|missing). JANGAN PERNAH menghitung nilai turunan (luas dari "
    "dimensi, dst) -- hanya transkrip apa yang tertulis/tergambar apa adanya. "
    "Kalau output akan terpotong karena batas token, isi completion."
    "is_complete=false dan completion.next_cursor menunjuk section yang belum "
    "selesai, jangan memotong JSON di tengah struktur."
)


def _build_page_prompt(page_context: PageContext, prompt_version: str) -> str:
    return (
        f"prompt_version={prompt_version}. Halaman ke-{page_context.page_number} "
        f"(index {page_context.page_index}) dari dokumen {page_context.document_id}."
    )
