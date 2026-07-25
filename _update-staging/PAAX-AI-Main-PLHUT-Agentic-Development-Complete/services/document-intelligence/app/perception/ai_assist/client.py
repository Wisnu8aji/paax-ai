"""
PAAX Document Intelligence — Klien LLM untuk lapisan AI-assist (Fase X2,
2026-07-05: `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md`
§X2, aturan `SAYA.md` §1.1).

Ini BUKAN Vision-LLM (tidak pernah menerima gambar/piksel) -- client ini
HANYA menerima teks (span/unclassified yang SUDAH diekstrak PyMuPDF di
tempat lain) dan mengembalikan JSON terstruktur (`responseSchema`, pola
IDENTIK dengan `apps/web/src/lib/ai/orchestrator.ts::geminiGenerateContent`,
model `gemini-2.5-flash`, header `x-goog-api-key`, temperature rendah).

Pakai stdlib `urllib.request` (BUKAN dependency baru) -- pola sama dengan
`app/perception/bridging_tanah.py::HttpTanahTakeoffClient`, konsisten
`SAYA.md` §2 ("jangan tambah dependency tanpa alasan jelas").

Degradasi anggun WAJIB: kalau `GEMINI_API_KEY` tidak diset, kalau request
gagal (timeout/network/HTTP error), atau kalau response tidak bisa di-parse
jadi JSON, `generate_json` mengembalikan `None` -- caller (dimension_assist/
zone_assist) HARUS memperlakukan `None` sebagai "tidak ada usulan AI", TIDAK
PERNAH crash pipeline utama. Pola ini identik dengan
`app/perception/ocr/paddle_ocr_extractor.py` (lazy, opsional, gagal anggun).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Protocol
from urllib import error, request

GEMINI_MODEL = "gemini-2.5-flash"
_GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_DRAWING_REVIEW_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
NVIDIA_AI_ASSIST_MODEL = NVIDIA_DRAWING_REVIEW_MODEL
_DEFAULT_TEMPERATURE = 0.1
_DEFAULT_TIMEOUT_SECONDS = 20.0
_NVIDIA_TIMEOUT_SECONDS = 3600.0


def _model_env(name: str, fallback: str) -> str:
    value = os.getenv(name, "").strip()
    if not value or value.startswith("nvapi-"):
        return fallback
    return value


def _nvidia_key_env(*names: str) -> str:
    for name in (*names, "NVIDIA_API_KEY"):
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


class AiAssistClient(Protocol):
    """Kontrak client AI-assist. HANYA menerima teks (system+user prompt)
    dan schema JSON tertutup -- tidak pernah menerima/dikirimi gambar."""

    def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        response_schema: dict[str, Any],
        operation_name: str = "ai_assist:default",
    ) -> dict[str, Any] | None:
        ...


@dataclass
class GeminiAiAssistClient:
    api_key: str
    model: str = GEMINI_MODEL
    temperature: float = _DEFAULT_TEMPERATURE
    timeout_seconds: float = _DEFAULT_TIMEOUT_SECONDS
    usage_logger: Any = None

    @classmethod
    def from_env(cls, usage_logger: Any = None) -> "GeminiAiAssistClient | None":
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key or not api_key.strip():
            return None
        return cls(api_key=api_key.strip(), usage_logger=usage_logger)

    def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        response_schema: dict[str, Any],
        operation_name: str = "ai_assist:default",
    ) -> dict[str, Any] | None:
        import time
        start_time = time.time()
        
        body = {
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "generationConfig": {
                "temperature": self.temperature,
                "responseMimeType": "application/json",
                "responseSchema": response_schema,
            },
        }
        req = request.Request(
            _GEMINI_URL,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": self.api_key,
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (error.URLError, TimeoutError, OSError, ValueError) as e:
            if self.usage_logger:
                latency_ms = int((time.time() - start_time) * 1000)
                self.usage_logger(operation=operation_name, success=False, latency_ms=latency_ms)
            return None

        try:
            text = payload["candidates"][0]["content"]["parts"][0]["text"]
            parsed = json.loads(text)
            usage = payload.get("usageMetadata", {})
            tokens_in = usage.get("promptTokenCount", 0)
            tokens_out = usage.get("candidatesTokenCount", 0)
        except (KeyError, IndexError, TypeError, ValueError):
            if self.usage_logger:
                latency_ms = int((time.time() - start_time) * 1000)
                self.usage_logger(operation=operation_name, success=False, latency_ms=latency_ms)
            return None
            
        if not isinstance(parsed, dict):
            if self.usage_logger:
                latency_ms = int((time.time() - start_time) * 1000)
                self.usage_logger(operation=operation_name, success=False, latency_ms=latency_ms)
            return None
            
        if self.usage_logger:
            latency_ms = int((time.time() - start_time) * 1000)
            self.usage_logger(
                operation=operation_name,
                success=True,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                latency_ms=latency_ms
            )
            
        return parsed


@dataclass
class NvidiaAiAssistClient:
    api_key: str
    model: str = NVIDIA_AI_ASSIST_MODEL
    api_url: str = f"{NVIDIA_BASE_URL}/chat/completions"
    temperature: float = _DEFAULT_TEMPERATURE
    timeout_seconds: float = _NVIDIA_TIMEOUT_SECONDS
    usage_logger: Any = None

    @classmethod
    def from_env(cls, usage_logger: Any = None) -> "NvidiaAiAssistClient | None":
        api_key = _nvidia_key_env(
            "NVIDIA_DRAWING_REVIEW_API_KEY",
            "NVIDIA_SOLACE_API_KEY",
            "NVIDIA_DEEPSEEK_API_KEY",
        )
        if not api_key:
            return None
        base_url = os.getenv("NVIDIA_BASE_URL", NVIDIA_BASE_URL).strip() or NVIDIA_BASE_URL
        model = _model_env("NVIDIA_AI_ASSIST_MODEL", _model_env("NVIDIA_DRAWING_REVIEW_MODEL", NVIDIA_AI_ASSIST_MODEL))
        return cls(
            api_key=api_key,
            model=model,
            api_url=f"{base_url.rstrip('/')}/chat/completions",
            usage_logger=usage_logger,
        )

    def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        response_schema: dict[str, Any],
        operation_name: str = "ai_assist:default",
    ) -> dict[str, Any] | None:
        import time
        start_time = time.time()
        prompt = (
            f"{system_prompt}\n\n"
            "Kembalikan HANYA JSON object valid tanpa markdown. "
            "Ikuti bentuk schema berikut sebagai kontrak output:\n"
            f"{json.dumps(response_schema, ensure_ascii=False)}\n\n"
            f"DATA:\n{user_prompt}"
        )
        body = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": self.temperature,
            "max_tokens": 2048,
            "chat_template_kwargs": {"thinking": False},
        }
        req = request.Request(
            self.api_url,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key.strip()}",
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
            text = payload["choices"][0]["message"]["content"]
            parsed = json.loads(_strip_code_fence(text))
        except (error.URLError, TimeoutError, OSError, ValueError, KeyError, IndexError, TypeError, json.JSONDecodeError):
            if self.usage_logger:
                latency_ms = int((time.time() - start_time) * 1000)
                self.usage_logger(operation=operation_name, success=False, latency_ms=latency_ms)
            return None
        if not isinstance(parsed, dict):
            if self.usage_logger:
                latency_ms = int((time.time() - start_time) * 1000)
                self.usage_logger(operation=operation_name, success=False, latency_ms=latency_ms)
            return None
        if self.usage_logger:
            latency_ms = int((time.time() - start_time) * 1000)
            self.usage_logger(operation=operation_name, success=True, latency_ms=latency_ms)
        return parsed


def _strip_code_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if len(lines) >= 3:
            return "\n".join(lines[1:-1]).strip()
    return stripped


class NullAiAssistClient:
    """Dipakai saat `GEMINI_API_KEY` tidak diset. Pipeline utama tetap jalan
    normal (fallback ke `perlu_review`/`zone=None` biasa, tanpa usulan AI)."""

    def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        response_schema: dict[str, Any],
        operation_name: str = "ai_assist:default",
    ) -> dict[str, Any] | None:
        return None
