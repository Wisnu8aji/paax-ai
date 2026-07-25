from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any, Callable, Optional
from urllib import error, request

from pydantic import BaseModel, Field

from app.perception.consolidated_models import Assumption, ConsolidatedExtraction, SheetSummary
from app.perception.work_items import DrawingWorkItem, DrawingWorkItemsResult


DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_DEEPSEEK_MODEL = "deepseek-ai/deepseek-v4-pro"
NVIDIA_DRAWING_FAST_MODEL = "nvidia/nemotron-nano-12b-v2-vl"
NVIDIA_DRAWING_PARSE_MODEL = "nvidia/nemotron-parse"
NVIDIA_DRAWING_OCR_MODEL = "nvidia/nemotron-ocr-v2"
NVIDIA_DRAWING_REVIEW_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
DEEPSEEK_MODEL_FAST = "deepseek-v4-flash"
DEEPSEEK_MODEL_REASONING = "deepseek-v4-pro"
_DEFAULT_TIMEOUT_SECONDS = 25.0
_NVIDIA_TIMEOUT_SECONDS = 3600.0
_AI_PROMPT_MAX_SHEETS = 30
_AI_PROMPT_MAX_WORK_ITEMS = 80
_AI_PROMPT_MAX_NOTES = 24
_AI_TEXT_LIMIT = 320
_ADMIN_NOISE_PATTERNS = (
    "KEMENTERIAN",
    "DIREKTORAT",
    "TAHUN ANGGARAN",
    "GAMBAR KERJA",
    "SINGKATAN",
    "SIMBOL BAHAN",
    "KETERANGAN GAMBAR",
)


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


class DrawingAiModelStage(BaseModel):
    stage: str
    provider: str
    model: str
    purpose: str
    active: bool = False


def _drawing_model_stack() -> list[DrawingAiModelStage]:
    has_fast = bool(_nvidia_key_env("NVIDIA_DRAWING_FAST_API_KEY"))
    has_parse = bool(_nvidia_key_env("NVIDIA_DRAWING_PARSE_API_KEY"))
    has_ocr = bool(_nvidia_key_env("NVIDIA_DRAWING_OCR_API_KEY"))
    has_review = bool(_nvidia_key_env("NVIDIA_DRAWING_REVIEW_API_KEY"))
    has_solace = bool(_nvidia_key_env("NVIDIA_SOLACE_API_KEY"))
    return [
        DrawingAiModelStage(
            stage="fast_visual",
            provider="nvidia",
            model=_model_env("NVIDIA_DRAWING_FAST_MODEL", NVIDIA_DRAWING_FAST_MODEL),
            purpose="Klasifikasi visual cepat dan pengecekan jenis halaman gambar kerja.",
            active=has_fast,
        ),
        DrawingAiModelStage(
            stage="ocr_layout",
            provider="nvidia",
            model=_model_env("NVIDIA_DRAWING_PARSE_MODEL", NVIDIA_DRAWING_PARSE_MODEL),
            purpose="Parsing layout, tabel, legenda, dan teks teknis dari halaman scan atau layout sulit.",
            active=has_parse,
        ),
        DrawingAiModelStage(
            stage="ocr_backup",
            provider="nvidia",
            model=_model_env("NVIDIA_DRAWING_OCR_MODEL", NVIDIA_DRAWING_OCR_MODEL),
            purpose="OCR cadangan untuk halaman raster/scan ketika text-layer PDF tidak cukup.",
            active=has_ocr,
        ),
        DrawingAiModelStage(
            stage="deep_review",
            provider="nvidia",
            model=_model_env("NVIDIA_DRAWING_REVIEW_MODEL", NVIDIA_DRAWING_REVIEW_MODEL),
            purpose="Review mendalam atas hasil ekstraksi PAAX sebelum ditampilkan ke user.",
            active=has_review,
        ),
        DrawingAiModelStage(
            stage="civil_reasoning",
            provider="nvidia",
            model=_model_env("NVIDIA_SOLACE_MODEL", NVIDIA_DEEPSEEK_MODEL),
            purpose="Reasoning teknik sipil/RAB lanjutan yang juga dipakai Solace.",
            active=has_solace,
        ),
    ]


class DrawingProjectSummary(BaseModel):
    project_id: str
    file_name: str
    project_kind: str
    total_pages: int
    confidence: Optional[float] = None


class DrawingAiSheetReport(BaseModel):
    page: int
    sheet_id: str
    interpreted_title: str
    role: str
    zone: Optional[str] = None
    scale: Optional[str] = None
    summary: str


class DrawingAiWorkItemReport(BaseModel):
    category: str
    item_pekerjaan: str
    source_pages: list[int] = Field(default_factory=list)
    dasar_pembacaan: str
    unit: Optional[str] = None
    volume: Optional[float] = None
    formula: Optional[str] = None
    ahsp_candidate: Optional[str] = None
    confidence: float = 0.65
    status: str
    verification_note: Optional[str] = None


class DrawingAiVerificationNote(BaseModel):
    level: str
    note: str
    source_pages: list[int] = Field(default_factory=list)


class DrawingAiReport(BaseModel):
    project_summary: DrawingProjectSummary
    sheets: list[DrawingAiSheetReport] = Field(default_factory=list)
    technical_summary: str
    detected_work_items: list[DrawingAiWorkItemReport] = Field(default_factory=list)
    verification_notes: list[DrawingAiVerificationNote] = Field(default_factory=list)
    model_stack: list[DrawingAiModelStage] = Field(default_factory=list)
    next_action_label: str = "Proses RAB"
    provider: str = "local-structured"
    model: Optional[str] = None


class AiReportClient:
    def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        operation_name: str = "ai_report:summary",
    ) -> dict[str, Any] | None:
        raise NotImplementedError


def parse_deepseek_json_text(text: str) -> dict[str, Any]:
    stripped = text.strip()
    fenced = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", stripped, re.IGNORECASE)
    if fenced:
        stripped = fenced.group(1).strip()
    parsed = json.loads(stripped)
    if not isinstance(parsed, dict):
        raise ValueError("DeepSeek output is not a JSON object")
    return parsed


@dataclass
class DeepSeekAiReportClient(AiReportClient):
    api_key: str
    model: str = DEEPSEEK_MODEL_FAST
    api_url: str = DEEPSEEK_API_URL
    provider: str = "deepseek"
    timeout_seconds: float = _DEFAULT_TIMEOUT_SECONDS
    urlopen: Callable[..., Any] = request.urlopen

    @classmethod
    def from_env(cls) -> "DeepSeekAiReportClient | None":
        nvidia_key = _nvidia_key_env("NVIDIA_DRAWING_REVIEW_API_KEY", "NVIDIA_DEEP_REVIEW_API_KEY")
        if nvidia_key:
            base_url = os.getenv("NVIDIA_BASE_URL", NVIDIA_BASE_URL).strip() or NVIDIA_BASE_URL
            model = _model_env(
                "NVIDIA_DRAWING_REVIEW_MODEL",
                _model_env("NVIDIA_DRAWING_MODEL", NVIDIA_DRAWING_REVIEW_MODEL),
            )
            return cls(
                api_key=nvidia_key,
                model=model,
                api_url=f"{base_url.rstrip('/')}/chat/completions",
                provider="nvidia",
                timeout_seconds=_NVIDIA_TIMEOUT_SECONDS,
            )
        api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
        if not api_key:
            return None
        model = os.getenv("DEEPSEEK_MODEL_FAST", DEEPSEEK_MODEL_FAST).strip() or DEEPSEEK_MODEL_FAST
        return cls(api_key=api_key, model=model)

    def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        operation_name: str = "ai_report:summary",
    ) -> dict[str, Any] | None:
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "thinking": {"type": "disabled"},
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "user_id": "paax-drawing-intelligence",
        }
        if self.provider == "nvidia":
            body.pop("response_format", None)
            body.pop("user_id", None)
            body["max_tokens"] = 4096
            body["chat_template_kwargs"] = {"thinking": False}
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
            with self.urlopen(req, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
            content = payload["choices"][0]["message"]["content"]
            return parse_deepseek_json_text(content)
        except (error.URLError, TimeoutError, OSError, ValueError, KeyError, IndexError, TypeError, json.JSONDecodeError):
            return None


def _zone_label(zone: str | None) -> str:
    if not zone:
        return "Belum diketahui"
    labels = {
        "substruktur": "Substruktur / Pondasi",
        "struktur_lantai_1": "Struktur Lantai 1",
        "struktur_lantai_2": "Struktur Lantai 2",
        "struktur_lantai_3": "Struktur Lantai 3",
        "struktur_atap": "Struktur Atap",
        "detail_tabel": "Detail & Tabel",
    }
    return labels.get(zone, zone.replace("_", " ").title())


def _project_kind(classification: str, consolidated: ConsolidatedExtraction) -> str:
    text = " ".join([classification, *[s.judul for s in consolidated.sheets], *[(s.zone or "") for s in consolidated.sheets]]).upper()
    if any(key in text for key in ("STRUKTUR", "STRUCT", "KOLOM", "BALOK", "PONDASI", "SLOOF", "ATAP")):
        return "Gambar kerja struktur"
    if any(key in text for key in ("SANITASI", "PLUMBING", "MEP", "LISTRIK")):
        return "Gambar kerja MEP"
    if any(key in text for key in ("DENAH", "TAMPAK", "POTONGAN", "ARSITEKTUR")):
        return "Gambar kerja arsitektur"
    return "Gambar kerja proyek"


def _interpreted_title(sheet: SheetSummary) -> str:
    title = sheet.judul.strip()
    if title.upper() == "GAMBAR KERJA" and sheet.page <= 2:
        return "Cover / informasi umum gambar kerja"
    if title.lower().startswith("sheet "):
        return f"Halaman {sheet.page} - {_zone_label(sheet.zone)}"
    return title or f"Halaman {sheet.page} - {_zone_label(sheet.zone)}"


def _sheet_role(sheet: SheetSummary) -> str:
    zone = _zone_label(sheet.zone)
    if zone != "Belum diketahui":
        return zone
    title = sheet.judul.upper()
    if "DAFTAR" in title:
        return "Daftar gambar"
    if "POTONGAN" in title:
        return "Potongan"
    if "DETAIL" in title:
        return "Detail teknis"
    if "COVER" in title or title == "GAMBAR KERJA":
        return "Informasi umum"
    return "Halaman gambar kerja"


def _assumption_is_noise(assumption: Assumption) -> bool:
    text = f"{assumption.pernyataan} {assumption.alasan}".upper()
    return assumption.dampak == "rendah" and any(pattern in text for pattern in _ADMIN_NOISE_PATTERNS)


def _work_item_status(item: DrawingWorkItem) -> str:
    if item.formula_status == "dihitung" and not item.needs_review and item.volume is not None:
        return "Siap diproses"
    if item.formula_status == "belum_didukung":
        return "Menunggu rumus engine"
    return "Perlu verifikasi"


def _work_item_confidence(item: DrawingWorkItem) -> float:
    if _work_item_status(item) == "Siap diproses":
        return 0.86
    if item.formula_status == "belum_didukung":
        return 0.48
    return 0.62


def _item_basis(item: DrawingWorkItem) -> str:
    refs = ", ".join(item.element_refs[:4]) if item.element_refs else "alamat elemen belum tersedia"
    pages = ", ".join(str(p) for p in item.source_pages) if item.source_pages else "halaman belum pasti"
    return f"{item.uraian} terbaca dari halaman {pages}; referensi elemen: {refs}."


def _build_local_report(
    *,
    project_id: str,
    file_name: str,
    classification: str,
    classification_confidence: Optional[float],
    consolidated: ConsolidatedExtraction,
    work_items: DrawingWorkItemsResult,
) -> DrawingAiReport:
    sheets = [
        DrawingAiSheetReport(
            page=sheet.page,
            sheet_id=sheet.sheet_id,
            interpreted_title=_interpreted_title(sheet),
            role=_sheet_role(sheet),
            zone=_zone_label(sheet.zone),
            scale=sheet.skala,
            summary=f"{_sheet_role(sheet)}. Data halaman ini dipakai sebagai konteks analisis lintas halaman.",
        )
        for sheet in consolidated.sheets
    ]
    detected_items = [
        DrawingAiWorkItemReport(
            category=item.kategori,
            item_pekerjaan=item.uraian,
            source_pages=item.source_pages,
            dasar_pembacaan=_item_basis(item),
            unit=item.unit,
            volume=item.volume,
            formula=item.formula,
            ahsp_candidate=None,
            confidence=_work_item_confidence(item),
            status=_work_item_status(item),
            verification_note=item.review_reason if _work_item_status(item) != "Siap diproses" else None,
        )
        for item in work_items.work_items
    ]
    notes = [
        DrawingAiVerificationNote(
            level=assumption.dampak,
            note=assumption.pernyataan,
            source_pages=[assumption.sheet_page] if assumption.sheet_page is not None else [],
        )
        for assumption in consolidated.assumptions
        if not _assumption_is_noise(assumption)
    ]
    total_pages = len(consolidated.sheets)
    ready = sum(1 for item in detected_items if item.status == "Siap diproses")
    review = len(detected_items) - ready
    technical_summary = (
        f"AI menyusun ulang hasil ekstraksi menjadi ringkasan gambar kerja {total_pages} halaman. "
        f"Terdeteksi {len(detected_items)} item pekerjaan; {ready} siap diproses ke RAB"
        f"{f' dan {review} perlu verifikasi' if review else ''}."
    )
    return DrawingAiReport(
        project_summary=DrawingProjectSummary(
            project_id=project_id,
            file_name=file_name,
            project_kind=_project_kind(classification, consolidated),
            total_pages=total_pages,
            confidence=classification_confidence,
        ),
        sheets=sheets,
        technical_summary=technical_summary,
        detected_work_items=detected_items,
        verification_notes=notes,
        model_stack=_drawing_model_stack(),
    )


def _clip_text(value: Any, limit: int = _AI_TEXT_LIMIT) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) <= limit:
        return text
    return f"{text[: limit - 3].rstrip()}..."


def _note_rank(note: DrawingAiVerificationNote) -> int:
    ranks = {"tinggi": 0, "sedang": 1, "medium": 1, "rendah": 2, "low": 2}
    return ranks.get(note.level.lower(), 3)


def _compact_ai_report_payload(report: DrawingAiReport) -> dict[str, Any]:
    sheets_sample = [
        {
            "page": sheet.page,
            "sheet_id": sheet.sheet_id,
            "title": _clip_text(sheet.interpreted_title, 180),
            "role": sheet.role,
            "zone": sheet.zone,
            "scale": sheet.scale,
        }
        for sheet in report.sheets[:_AI_PROMPT_MAX_SHEETS]
    ]
    work_item_sample = [
        {
            "category": item.category,
            "item_pekerjaan": _clip_text(item.item_pekerjaan, 220),
            "source_pages": item.source_pages[:8],
            "dasar_pembacaan": _clip_text(item.dasar_pembacaan),
            "unit": item.unit,
            "volume": item.volume,
            "formula": _clip_text(item.formula, 220),
            "status": item.status,
            "verification_note": _clip_text(item.verification_note, 220),
        }
        for item in report.detected_work_items[:_AI_PROMPT_MAX_WORK_ITEMS]
    ]
    notes_by_priority = sorted(
        report.verification_notes,
        key=lambda note: (_note_rank(note), note.source_pages[0] if note.source_pages else 9999, note.note),
    )
    notes_sample = [
        {
            "level": note.level,
            "note": _clip_text(note.note),
            "source_pages": note.source_pages[:8],
        }
        for note in notes_by_priority[:_AI_PROMPT_MAX_NOTES]
    ]
    return {
        "project_summary": report.project_summary.model_dump(),
        "current_technical_summary": report.technical_summary,
        "sheets_total": len(report.sheets),
        "sheets_sample": sheets_sample,
        "detected_work_items_total": len(report.detected_work_items),
        "detected_work_items_sample": work_item_sample,
        "verification_notes_total": len(report.verification_notes),
        "verification_notes_sample": notes_sample,
        "requested_output": {
            "technical_summary": (
                "Ringkasan user-ready dalam bahasa Indonesia. Jelaskan jumlah halaman, "
                "jenis gambar, item utama, dan apa yang masih perlu diverifikasi."
            ),
            "project_kind": "Jenis gambar/proyek bila bisa disimpulkan dari data.",
        },
    }


def _ai_prompt(report: DrawingAiReport) -> tuple[str, str]:
    system_prompt = (
        "Anda adalah AI estimator PAAX. Rapikan laporan gambar kerja untuk user. "
        "Jangan menghitung volume, harga, HSP, RAB, pajak, atau total baru. "
        "Hanya boleh menyusun ringkasan dari JSON yang diberikan. "
        "Balas hanya JSON object dengan field technical_summary dan project_kind."
    )
    return system_prompt, json.dumps(_compact_ai_report_payload(report), ensure_ascii=False, separators=(",", ":"))


def build_ai_report(
    *,
    project_id: str,
    file_name: str,
    classification: str,
    classification_confidence: Optional[float],
    consolidated: ConsolidatedExtraction,
    work_items: DrawingWorkItemsResult,
    ai_client: AiReportClient | None = None,
) -> DrawingAiReport:
    local_report = _build_local_report(
        project_id=project_id,
        file_name=file_name,
        classification=classification,
        classification_confidence=classification_confidence,
        consolidated=consolidated,
        work_items=work_items,
    )
    client = ai_client if ai_client is not None else DeepSeekAiReportClient.from_env()
    if client is None:
        return local_report

    system_prompt, user_prompt = _ai_prompt(local_report)
    ai_json = client.generate_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        operation_name="ai_report:drawing_summary",
    )
    if not ai_json:
        return local_report

    updated = local_report.model_copy(deep=True)
    if isinstance(ai_json.get("technical_summary"), str) and ai_json["technical_summary"].strip():
        updated.technical_summary = ai_json["technical_summary"].strip()
    if isinstance(ai_json.get("project_kind"), str) and ai_json["project_kind"].strip():
        updated.project_summary.project_kind = ai_json["project_kind"].strip()
    updated.provider = getattr(client, "provider", "deepseek")
    updated.model = getattr(client, "model", None)
    return updated
