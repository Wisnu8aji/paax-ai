"""DashScope Qwen vision adapter for Drawing Evidence Model extraction."""
from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from urllib import error, request as urllib_request

from app.transcription.failure_classification import DemProviderError, classify_http_error
from app.transcription.providers.base import PageContext

_DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
_DEFAULT_MODEL = "qwen3.7-plus"
_DEFAULT_TIMEOUT_SECONDS = 120.0


@dataclass
class QwenDemAdapter:
    api_key: str
    base_url: str
    model: str
    reasoning_effort: str = "xhigh"
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
            "reasoning_effort": self.reasoning_effort,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": _build_prompt(page_context, prompt_version)},
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
            result = json.loads(body["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
            raise DemProviderError(f"Qwen response not valid JSON: {exc}", kind="invalid_output") from exc
        if not isinstance(result, dict):
            raise DemProviderError("Qwen response JSON is not an object", kind="invalid_output")
        return result


def _build_prompt(page_context: PageContext, prompt_version: str) -> str:
    return (
        "Kembalikan HANYA JSON valid sesuai schema DrawingEvidenceSheet "
        f"(schema_version=paax.dem.sheet.v1, prompt_version={prompt_version}), "
        "tanpa markdown fence, tanpa teks di luar JSON. "
        f"Halaman ke-{page_context.page_number} (index {page_context.page_index}) dari dokumen {page_context.document_id}. "
        "Setiap fakta WAJIB punya confidence (0.0-1.0) + evidence_refs + status "
        "(extracted|ai_interpreted|ambiguous|conflicting|missing). JANGAN PERNAH menghitung nilai turunan "
        "(luas dari dimensi, dst) -- hanya transkrip apa yang tertulis/tergambar. Kalau output akan terpotong karena "
        "batas token, isi completion.is_complete=false + completion.next_cursor menunjuk section yang belum selesai."
    )
