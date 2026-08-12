"""
DashScope / opencode-go two-stage DEM extraction adapter.

TWO-STAGE PIPELINE (2026-08-11 redesign, ORION REV3):

Stage 1 — Vision extraction (mimo-v2.5, model BEBAS format):
  Call mimo-v2.5 with image + a SIMPLE prompt asking for raw, free-form JSON.
  No strict json_schema enforced here — mimo-v2.5 is compliant with simple
  2-4 field schemas but silently ignores complex schemas like DemModelOutput
  (verified via direct probe: finish=stop, correct keys only when schema is
  trivial, free-form output when schema is complex).
  max_tokens=4096 (a dense drawing sheet needs room).

Stage 2 — Formatting (deepseek-v4-flash, text-only, schema strict):
  Send stage-1 raw JSON + full DemModelOutput JSON schema description to
  deepseek-v4-flash with response_format={"type":"json_object"}.
  No image, text only — deepseek-v4-flash does NOT support image_url on
  opencode-go ("unknown variant image_url" error confirmed via probe).
  max_tokens=16384, reasoning_effort="low" (deepseek reasoning model).

Fallback:
  If stage 2 fails (rate limit, error), return a partial result dict with
  completion.is_complete=false + next_cursor pointing to the failed stage.
  NEVER fabricate data; be honest about partial state.

WAF:
  User-Agent: curl/8.5.0 on BOTH stages (Cloudflare WAF on opencode.ai
  rejects the default Python-urllib UA with HTTP 403).

Prior one-stage approach (sent full DemModelOutput json_schema to mimo-v2.5):
  Result was 306 validation errors because mimo-v2.5 used training-time keys
  like `value`/`content` instead of `raw`/`kind`/`confidence`/`status`/
  `evidence_refs`. OCR content was accurate; only the shape was wrong.
  Fixed by the two-stage split: mimo-v2.5 does extraction, deepseek formats.
"""
from __future__ import annotations

import base64
import http.client
import json
import logging
import os
from dataclasses import dataclass, field
from urllib import error, request as urllib_request

from app.transcription.failure_classification import DemProviderError, classify_http_error
from app.transcription.models import DemModelOutput
from app.transcription.providers.base import PageContext

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
_DEFAULT_MODEL = "qwen3.7-plus"
_DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash"
_DEFAULT_TIMEOUT_SECONDS = 120.0
_STAGE1_TIMEOUT_SECONDS = 180.0
_STAGE2_TIMEOUT_SECONDS = 180.0


# ---------------------------------------------------------------------------
# Stage-2 schema: full DemModelOutput JSON schema, built once at import time.
# ---------------------------------------------------------------------------

def _build_dem_schema_description() -> str:
    """Render DemModelOutput JSON schema as a compact string for the stage-2 prompt."""
    schema = DemModelOutput.model_json_schema()
    return json.dumps(schema, ensure_ascii=False, separators=(",", ":"))


_DEM_SCHEMA_DESC = _build_dem_schema_description()


# ---------------------------------------------------------------------------
# Stage-1 simple schema (sent to mimo-v2.5 as response_format.json_schema)
# ---------------------------------------------------------------------------

_STAGE1_SIMPLE_SCHEMA = {
    "type": "object",
    "properties": {
        "sheet_number": {"type": "string"},
        "sheet_title": {"type": "string"},
        "discipline": {"type": "string"},
        "scale": {"type": "string"},
        "texts": {
            "type": "array",
            "items": {"type": "object", "properties": {"value": {"type": "string"}, "bbox": {"type": "array"}}, "required": ["value"]}
        },
        "dimensions": {
            "type": "array",
            "items": {"type": "object", "properties": {"value": {"type": "string"}, "bbox": {"type": "array"}}, "required": ["value"]}
        },
        "grids": {
            "type": "array",
            "items": {"type": "object", "properties": {"value": {"type": "string"}, "bbox": {"type": "array"}}, "required": ["value"]}
        },
        "levels": {
            "type": "array",
            "items": {"type": "object", "properties": {"value": {"type": "string"}, "numeric_value": {"type": "number"}, "unit": {"type": "string"}, "bbox": {"type": "array"}}, "required": ["value"]}
        },
        "spaces": {
            "type": "array",
            "items": {"type": "object", "properties": {"value": {"type": "string"}, "bbox": {"type": "array"}}, "required": ["value"]}
        },
        "element_labels": {
            "type": "array",
            "items": {"type": "object", "properties": {"value": {"type": "string"}, "bbox": {"type": "array"}}, "required": ["value"]}
        },
        "symbols": {
            "type": "array",
            "items": {"type": "object", "properties": {"value": {"type": "string"}, "bbox": {"type": "array"}}, "required": ["value"]}
        },
        "tables": {
            "type": "array",
            "items": {"type": "object", "properties": {"value": {"type": "string"}, "bbox": {"type": "array"}}, "required": ["value"]}
        },
        "materials": {
            "type": "array",
            "items": {"type": "object", "properties": {"value": {"type": "string"}, "bbox": {"type": "array"}}, "required": ["value"]}
        },
        "notes": {
            "type": "array",
            "items": {"type": "object", "properties": {"value": {"type": "string"}, "bbox": {"type": "array"}}, "required": ["value"]}
        },
        "references": {
            "type": "array",
            "items": {"type": "object", "properties": {"value": {"type": "string"}, "bbox": {"type": "array"}}, "required": ["value"]}
        },
        "patterns": {
            "type": "array",
            "items": {"type": "object", "properties": {"value": {"type": "string"}, "bbox": {"type": "array"}}, "required": ["value"]}
        },
        "geometry_descriptions": {
            "type": "array",
            "items": {"type": "object", "properties": {"value": {"type": "string"}, "bbox": {"type": "array"}}, "required": ["value"]}
        },
        "views": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "view_id": {"type": "string"},
                    "type": {"type": "string"},
                    "title": {"type": "string"},
                    "bbox": {"type": "array"}
                },
                "required": ["view_id", "type", "title"]
            }
        },
    },
    "required": ["sheet_number", "sheet_title", "discipline"],
    "additionalProperties": False,
}


# ---------------------------------------------------------------------------
# Stage-1 prompt
# ---------------------------------------------------------------------------

_STAGE1_INSTRUCTIONS = (
    "Anda membaca satu halaman gambar kerja konstruksi (arsitektur/struktur/MEP). "
    "Ekstrak SEMUA informasi yang terlihat dan kembalikan JSON sesuai skema yang diberikan.\n\n"
    "CAKUPAN WAJIB — periksa SETIAP kategori secara aktif:\n"
    "- sheet_number: nomor lembar/halaman (mis. A-01, S-02, M-03)\n"
    "- sheet_title: judul halaman\n"
    "- discipline: bidang (architecture/structure/mechanical/electrical/plumbing/civil)\n"
    "- scale: skala gambar (mis. 1:100, 1:50)\n"
    "- texts: judul, sub-judul, catatan bebas, teks title block\n"
    "- dimensions: SEMUA angka ukuran/jarak/ketebalan\n"
    "- grids: label as/grid (mis. A, B, 1, 2) dan jarak antar-as\n"
    "- levels: elevasi lantai/atap (mis. +4.00, +8.00, ±0.00)\n"
    "- spaces: label ruang/area\n"
    "- element_labels: kode elemen (kolom, balok, pintu, jendela -- PERSIS seperti tertulis, mis. K-01, C1, D-01)\n"
    "- symbols: notasi simbol dan artinya\n"
    "- tables: SETIAP tabel teknis (jadwal, spesifikasi, daftar tipe)\n"
    "- materials: SETIAP baris legenda/daftar material finishing -- satu item per baris\n"
    "- notes: catatan teknis/spesifikasi\n"
    "- references: rujukan ke detail/halaman/tabel lain\n"
    "- patterns: pola arsir/hatch dan artinya\n"
    "- geometry_descriptions: bentuk/layout yang dideskripsikan tapi bukan dimensi angka\n"
    "- views: area/view yang berbeda dalam halaman (denah, potongan, detail, dst)\n\n"
    "ATURAN:\n"
    "1. JANGAN mengarang informasi yang tidak terlihat.\n"
    "2. bbox WAJIB koordinat ternormalisasi 0.0-1.0 [x0, y0, x1, y1] relatif ukuran halaman. "
    "Kalau tidak bisa ditentukan, omit (jangan isi asal-asalan).\n"
    "3. Daftar panjang (legenda material, tabel notasi) -- buat SATU item per baris/entry, "
    "jangan digabung jadi satu string panjang.\n"
    "4. Kode elemen/material diambil PERSIS seperti tertulis.\n"
)


# ---------------------------------------------------------------------------
# Stage-2 prompt builder
# ---------------------------------------------------------------------------

_STAGE2_SYSTEM = (
    "Anda adalah formatter JSON teknis. Tugas: format ulang JSON ekstraksi mentah "
    "menjadi struktur DemModelOutput yang valid sesuai schema JSON yang diberikan. "
    "Kembalikan HANYA JSON valid, tanpa penjelasan, tanpa markdown code fence."
)


def _build_stage2_user_prompt(raw_json: dict, page_context: PageContext) -> str:
    raw_str = json.dumps(raw_json, ensure_ascii=False, separators=(",", ":"))
    return (
        f"Halaman ke-{page_context.page_number} (index {page_context.page_index}), "
        f"dokumen {page_context.document_id}.\n\n"
        "INPUT JSON MENTAH (dari vision model):\n"
        f"{raw_str}\n\n"
        "TARGET SCHEMA (DemModelOutput):\n"
        f"{_DEM_SCHEMA_DESC}\n\n"
        "INSTRUKSI PEMETAAN:\n"
        "1. sheet_identity.sheet_number: {value: <sheet_number>, raw: <sheet_number>, confidence: 0.9, evidence_refs: [\"ev-sheet-num\"]}\n"
        "2. sheet_identity.title: {value: <sheet_title>, raw: <sheet_title>, confidence: 0.9, evidence_refs: [\"ev-sheet-title\"]}\n"
        "3. sheet_identity.discipline: {value: <discipline>, confidence: 0.85, status: \"ai_interpreted\"}\n"
        "4. sheet_identity.scale_candidates: dari field 'scale' jika ada\n"
        "5. observations.*: setiap item di texts/dimensions/grids/levels/spaces/element_labels/symbols/"
        "tables/materials/notes/references/patterns/geometry_descriptions → ObservationValue:\n"
        "   {raw: <value>, normalized: <value_cleaned>, confidence: 0.9, status: \"extracted\", "
        "evidence_refs: [\"ev-<kategori>-<index>\"]}\n"
        "   Untuk levels: isi numeric_value (angka float) dan unit (\"m\") jika bisa diparsing.\n"
        "   Untuk bbox: gunakan bbox dari input jika ada (sudah ternormalisasi 0-1), omit jika tidak ada.\n"
        "6. evidence[]: buat satu EvidenceItem untuk SETIAP evidence_id yang dirujuk di evidence_refs:\n"
        "   {evidence_id: <id>, kind: \"ocr_text\", raw: <value_asli>, confidence: 0.9}\n"
        "   PASTIKAN setiap evidence_id di evidence_refs ada entri-nya di evidence[].\n"
        "7. views: dari field 'views' jika ada; bbox harus [x0,y0,x1,y1] normalized 0-1.\n"
        "8. completion: {sections_expected: 13, sections_completed: 13, is_complete: true}\n"
        "   Jika input tampak sangat parsial/kosong, set is_complete=false.\n"
        "9. ambiguities/conflicts/unclassified: array kosong [] kecuali ada konflik nyata.\n"
        "10. status ∈ extracted|ai_interpreted|ambiguous|conflicting|missing (DemStatus).\n"
        "11. confidence: 0.0-1.0 float.\n"
        "12. kind di EvidenceItem: gunakan \"ocr_text\" untuk teks, \"drawing_annotation\" untuk "
        "dimensi/grid/level, \"symbol_notation\" untuk simbol.\n\n"
        "PENTING: Kembalikan JSON DemModelOutput LENGKAP dan VALID. "
        "Jangan melewatkan field wajib. Jangan mengarang data yang tidak ada di INPUT JSON MENTAH."
    )


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

def _http_post(
    url: str,
    payload: dict,
    api_key: str,
    timeout: float,
    label: str,
) -> dict:
    """POST JSON payload to url, return parsed response body.
    Raises DemProviderError on HTTP/network/JSON errors."""
    req = urllib_request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            # Cloudflare WAF on opencode.ai rejects default Python-urllib UA
            # with HTTP 403 (browser_signature_banned). curl/8.5.0 passes.
            "User-Agent": "curl/8.5.0",
        },
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        raw_body = b""
        try:
            raw_body = exc.read()
        except Exception:
            pass
        detail = raw_body.decode("utf-8", errors="replace")[:400]
        raise DemProviderError(
            f"{label} HTTP {exc.code}: {exc.reason} — {detail}",
            kind=classify_http_error(exc.code),
        ) from exc
    except error.URLError as exc:
        raise DemProviderError(f"{label} network error: {exc.reason}", kind="transient") from exc
    except (http.client.HTTPException, ConnectionError, TimeoutError) as exc:
        raise DemProviderError(f"{label} connection error: {exc}", kind="transient") from exc
    return body


def _extract_finish_reason(body: dict) -> str | None:
    """Extract finish_reason from an OpenAI-compatible response body, or None."""
    try:
        return body["choices"][0].get("finish_reason")
    except (KeyError, IndexError, TypeError):
        return None


def _extract_content_str(body: dict, label: str) -> str:
    """Extract content string from OpenAI-compatible response body."""
    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise DemProviderError(
            f"{label} response missing message content: {exc}", kind="invalid_output"
        ) from exc
    if content is None:
        refusal = body.get("choices", [{}])[0].get("message", {}).get("refusal")
        raise DemProviderError(
            f"{label} returned no content (refusal={refusal!r})",
            kind="invalid_output",
        )
    return content


# ---------------------------------------------------------------------------
# Minimal partial DemModelOutput fallback builder
# ---------------------------------------------------------------------------

def _build_partial_fallback(raw_stage1: dict, reason: str) -> dict:
    """Build a minimal DemModelOutput-shaped dict when stage 2 fails.
    Uses stage-1 data as best-effort partial output.
    is_complete=False signals downstream that this output is unformatted."""
    sheet_number = raw_stage1.get("sheet_number") or "unknown"
    sheet_title = raw_stage1.get("sheet_title") or "unknown"
    discipline = raw_stage1.get("discipline") or "unknown"
    return {
        "sheet_identity": {
            "sheet_number": {
                "value": sheet_number,
                "raw": sheet_number,
                "confidence": 0.5,
                "evidence_refs": [],
            },
            "title": {
                "value": sheet_title,
                "raw": sheet_title,
                "confidence": 0.5,
                "evidence_refs": [],
            },
            "discipline": {
                "value": discipline,
                "confidence": 0.5,
                "status": "ai_interpreted",
            },
            "scale_candidates": [],
        },
        "views": [],
        "observations": {
            "texts": [],
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
        "evidence": [],
        "ambiguities": [f"stage2_failed: {reason}"],
        "conflicts": [],
        "unclassified": [],
        "completion": {
            "sections_expected": 13,
            "sections_completed": 0,
            "is_complete": False,
            "next_cursor": "stage2_formatting",
        },
    }


# ---------------------------------------------------------------------------
# QwenDemAdapter — public interface (contract identical to one-stage version)
# ---------------------------------------------------------------------------

@dataclass
class QwenDemAdapter:
    """Two-stage DEM extraction adapter.

    Stage 1: mimo-v2.5 (vision, simple schema) → raw JSON dict
    Stage 2: deepseek-v4-flash (text-only, strict schema) → DemModelOutput-shaped dict

    Public contract identical to one-stage QwenDemAdapter: extract_page()
    returns a dict that parse_and_validate() can DemModelOutput.model_validate().
    """

    api_key: str
    base_url: str
    model: str  # Stage-1 vision model (e.g. mimo-v2.5)
    deepseek_model: str = _DEFAULT_DEEPSEEK_MODEL  # Stage-2 formatting model
    timeout_seconds: float = _DEFAULT_TIMEOUT_SECONDS

    @classmethod
    def from_env(cls) -> "QwenDemAdapter | None":
        api_key = os.getenv("DRAWING_INTELLIGENCE_API_KEY", "").strip()
        if not api_key:
            return None
        base_url = (
            os.getenv("DRAWING_INTELLIGENCE_BASE_URL", "").strip() or _DEFAULT_BASE_URL
        )
        model = (
            os.getenv("DRAWING_INTELLIGENCE_QWEN_MODEL", "").strip() or _DEFAULT_MODEL
        )
        deepseek_model = (
            os.getenv("DRAWING_INTELLIGENCE_DEEPSEEK_MODEL", "").strip()
            or _DEFAULT_DEEPSEEK_MODEL
        )
        return cls(
            api_key=api_key,
            base_url=base_url,
            model=model,
            deepseek_model=deepseek_model,
        )

    # ------------------------------------------------------------------
    # Stage 1: vision extraction (mimo-v2.5)
    # ------------------------------------------------------------------

    def _stage1_vision(self, image_bytes: bytes, page_context: PageContext) -> dict:
        """Call mimo-v2.5 with image + simple schema. Returns raw extracted dict."""
        image_b64 = base64.b64encode(image_bytes).decode("ascii")
        url = f"{self.base_url.rstrip('/')}/chat/completions"
        payload = {
            "model": self.model,
            "max_tokens": 4096,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "dem_raw_extraction",
                    "strict": True,
                    "schema": _STAGE1_SIMPLE_SCHEMA,
                },
            },
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": _STAGE1_INSTRUCTIONS,
                        },
                        {
                            "type": "text",
                            "text": (
                                f"Halaman ke-{page_context.page_number} "
                                f"(index {page_context.page_index}), "
                                f"dokumen {page_context.document_id}."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                        },
                    ],
                }
            ],
        }
        body = _http_post(url, payload, self.api_key, _STAGE1_TIMEOUT_SECONDS, "Stage1[mimo]")
        content = _extract_content_str(body, "Stage1[mimo]")
        try:
            result = json.loads(content)
        except json.JSONDecodeError as exc:
            raise DemProviderError(
                f"Stage1[mimo] response not valid JSON: {exc}", kind="invalid_output"
            ) from exc
        if not isinstance(result, dict):
            raise DemProviderError(
                "Stage1[mimo] response JSON is not an object", kind="invalid_output"
            )
        logger.info(
            "Stage1[mimo] OK — sheet=%r texts=%d dims=%d materials=%d",
            result.get("sheet_number"),
            len(result.get("texts", [])),
            len(result.get("dimensions", [])),
            len(result.get("materials", [])),
        )
        return result

    # ------------------------------------------------------------------
    # Stage 2: formatting (deepseek-v4-flash, text-only)
    # ------------------------------------------------------------------

    def _stage2_format(self, raw_stage1: dict, page_context: PageContext) -> dict:
        """Call deepseek-v4-flash (NO image) to reformat stage-1 output into DemModelOutput.

        Retry policy (truncation guard):
          Attempt 1: max_tokens=16384, reasoning_effort="low".
          Attempt 2 (only on finish_reason=length OR invalid JSON): max_tokens=32768,
            reasoning_effort="low". Same prompt — deepseek keeps its own context.
          If attempt 2 still fails: raise DemProviderError so caller falls back to partial.

        finish_reason is always logged in WARNING to aid diagnosis:
          finish_reason=length  → token budget was exhausted (increase max_tokens).
          finish_reason=stop    → model finished normally; JSON invalid → schema/prompt issue.
        """
        url = f"{self.base_url.rstrip('/')}/chat/completions"
        user_prompt = _build_stage2_user_prompt(raw_stage1, page_context)
        base_messages = [
            {"role": "system", "content": _STAGE2_SYSTEM},
            {"role": "user", "content": user_prompt},
        ]

        _ATTEMPTS = [
            # (max_tokens, attempt_label)
            (16384, "Stage2[deepseek][attempt1]"),
            (32768, "Stage2[deepseek][attempt2-extended]"),
        ]

        last_exc: DemProviderError | None = None
        for max_tokens, attempt_label in _ATTEMPTS:
            payload = {
                "model": self.deepseek_model,
                "max_tokens": max_tokens,
                # reasoning_effort=low: deepseek-v4-flash is a reasoning model on
                # opencode-go. "low" keeps budget small for a pure formatting task
                # (no multi-step judgment needed). If the endpoint rejects this
                # field, it's ignored (not a blocking error).
                "reasoning_effort": "low",
                "response_format": {"type": "json_object"},
                "messages": base_messages,
            }
            body = _http_post(url, payload, self.api_key, _STAGE2_TIMEOUT_SECONDS, attempt_label)
            finish_reason = _extract_finish_reason(body)
            content = _extract_content_str(body, attempt_label)

            # Detect truncation: finish_reason=length means budget was exhausted.
            if finish_reason == "length":
                last_exc = DemProviderError(
                    f"{attempt_label} truncated (finish_reason=length, max_tokens={max_tokens}) "
                    "— output JSON incomplete",
                    kind="invalid_output",
                )
                logger.warning(
                    "%s truncated (finish_reason=length, max_tokens=%d) — will retry with larger budget if available",
                    attempt_label, max_tokens,
                )
                continue

            # Parse JSON; invalid JSON also triggers a retry.
            try:
                result = json.loads(content)
            except json.JSONDecodeError as exc:
                last_exc = DemProviderError(
                    f"{attempt_label} response not valid JSON (finish_reason={finish_reason!r}): {exc}",
                    kind="invalid_output",
                )
                logger.warning(
                    "%s response not valid JSON (finish_reason=%r, max_tokens=%d): %s — will retry with larger budget if available",
                    attempt_label, finish_reason, max_tokens, exc,
                )
                continue

            if not isinstance(result, dict):
                last_exc = DemProviderError(
                    f"{attempt_label} response JSON is not an object (finish_reason={finish_reason!r})",
                    kind="invalid_output",
                )
                logger.warning(
                    "%s response JSON is not an object (finish_reason=%r)",
                    attempt_label, finish_reason,
                )
                continue

            # Success.
            logger.info(
                "%s OK (finish_reason=%r, max_tokens=%d) — evidence=%d observations.texts=%d",
                attempt_label, finish_reason, max_tokens,
                len(result.get("evidence", [])),
                len((result.get("observations") or {}).get("texts", [])),
            )
            return result

        # All attempts exhausted — raise the last recorded error.
        assert last_exc is not None  # loop always sets last_exc before continue
        raise last_exc

    # ------------------------------------------------------------------
    # Public interface (identical contract to one-stage version)
    # ------------------------------------------------------------------

    def extract_page(
        self,
        image_bytes: bytes,
        page_context: PageContext,
        prompt_version: str,
    ) -> dict:
        """Run two-stage extraction and return a DemModelOutput-compatible dict.

        Stage 1 failure → propagate DemProviderError (let caller handle retry).
        Stage 2 failure (all retry attempts exhausted) → return partial fallback dict
        (is_complete=False) so the run is not blocked; the page can be retried later.
        """
        # Stage 1: vision extraction
        raw_stage1 = self._stage1_vision(image_bytes, page_context)

        # Stage 2: formatting (with internal retry on truncation)
        try:
            formatted = self._stage2_format(raw_stage1, page_context)
            return formatted
        except DemProviderError as exc:
            logger.warning(
                "Stage2[deepseek] failed after all attempts (%s: %s) — returning partial fallback",
                exc.kind, exc,
            )
            return _build_partial_fallback(raw_stage1, str(exc))
