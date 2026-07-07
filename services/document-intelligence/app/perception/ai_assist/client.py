"""
PAAX Document Intelligence — Klien LLM untuk lapisan AI-assist (Fase X2,
2026-07-05: `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md`
§X2, aturan `CLAUDE.md` §1.1).

Ini BUKAN Vision-LLM (tidak pernah menerima gambar/piksel) -- client ini
HANYA menerima teks (span/unclassified yang SUDAH diekstrak PyMuPDF di
tempat lain) dan mengembalikan JSON terstruktur (`responseSchema`, pola
IDENTIK dengan `apps/web/src/lib/ai/orchestrator.ts::geminiGenerateContent`,
model `gemini-2.5-flash`, header `x-goog-api-key`, temperature rendah).

Pakai stdlib `urllib.request` (BUKAN dependency baru) -- pola sama dengan
`app/perception/bridging_tanah.py::HttpTanahTakeoffClient`, konsisten
`CLAUDE.md` §2 ("jangan tambah dependency tanpa alasan jelas").

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
_DEFAULT_TEMPERATURE = 0.1
_DEFAULT_TIMEOUT_SECONDS = 20.0


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
