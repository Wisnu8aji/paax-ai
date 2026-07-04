"""
PAAX Document Intelligence — Adapter PaddleOCR untuk sheet RASTER (Fase 2 P6).

HANYA dipanggil untuk sheet yang terbukti raster (RULE-EXT-30). DILARANG KERAS
dipanggil pada sheet ber-text-layer vektor (INV-TKG-06/RULE-EXT-05
"vektor-dulu") — pemanggil (drawing_routes.py) yang menjaga batas ini.

Dependency `paddleocr` OPSIONAL & LAZY: import terjadi di dalam fungsi, bukan
di level modul, supaya service tetap boot normal walau paket ini tidak
terpasang (CLAUDE.md §2: fitur AI baru wajib fallback). Confidence span OCR
SELALU diambil dari skor model (`rec_scores`), TIDAK PERNAH 1.0 (RULE-EXT-31:
confidence OCR < confidence vektor).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.perception.models import TextSpan


@dataclass
class OcrExtractionResult:
    available: bool
    spans: list[TextSpan] = field(default_factory=list)
    message: str = ""


def _load_paddle_ocr() -> Any | None:
    """Lazy loader — None bila paket tidak terpasang ATAU gagal inisialisasi."""
    try:
        from paddleocr import PaddleOCR
    except ImportError:
        return None
    try:
        return PaddleOCR(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=True,  # RULE-EXT-02: label sering rotasi 90 di raster
        )
    except Exception:
        return None


def extract_spans_via_ocr(page_image_path: str, page: int) -> OcrExtractionResult:
    ocr = _load_paddle_ocr()
    if ocr is None:
        return OcrExtractionResult(
            available=False,
            spans=[],
            message=(
                "OCR raster tidak tersedia — install dependency opsional `paddleocr` "
                "untuk membaca sheet scan/foto. Gunakan jalur teks deskripsi manual sementara."
            ),
        )

    try:
        raw_results = list(ocr.predict(page_image_path))
    except Exception as e:
        # Inferensi native (paddlepaddle/oneDNN) bisa gagal di kombinasi
        # OS/CPU tertentu walau model sudah termuat sukses (temuan nyata sesi
        # ini) — degradasi anggun, JANGAN sampai meruntuhkan seluruh endpoint
        # analyze (fallback manual tetap harus bisa dipakai, CLAUDE.md §2).
        return OcrExtractionResult(
            available=False,
            spans=[],
            message=(
                f"OCR raster gagal saat inferensi ({type(e).__name__}: {e}). "
                "Gunakan jalur teks deskripsi manual sementara."
            ),
        )

    spans: list[TextSpan] = []
    span_index = 0
    for res in raw_results:
        data = res.json if hasattr(res, "json") else res
        rec_texts = data.get("rec_texts", []) or []
        rec_scores = data.get("rec_scores", []) or []
        rec_boxes = data.get("rec_boxes", []) or []
        for j, text in enumerate(rec_texts):
            if not text or not text.strip():
                continue
            box = rec_boxes[j]
            x0, y0, x1, y1 = float(box[0]), float(box[1]), float(box[2]), float(box[3])
            confidence = float(rec_scores[j]) if j < len(rec_scores) else 0.5
            spans.append(TextSpan(
                span_id=f"p{page}-ocr-{span_index:04d}",
                page=page,
                text=text,
                bbox=(x0, y0, x1, y1),
                rotasi=0,
                font_size=max(1.0, y1 - y0),
                origin=(x0, y1),
                method="ocr",
                confidence=confidence,
                line_hint=span_index,  # tiap deteksi OCR dianggap baris tersendiri (konservatif)
            ))
            span_index += 1
    return OcrExtractionResult(available=True, spans=spans, message="")
