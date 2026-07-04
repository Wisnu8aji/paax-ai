"""
PAAX Document Intelligence — Ekstraksi span vektor dari PDF (Fase 2 P1).

RULE-EXT-02: label pada gambar struktur sering VERTIKAL (rotasi 90 derajat) —
wajib dinormalkan arah bacanya tanpa kehilangan posisi. RULE-EXT-05: bila
sheet punya text-layer vektor, DILARANG memakai OCR untuk membaca angka pada
sheet itu — semua span di sini `method="vector"`, `confidence=1.0` (bukan
tebakan model).
"""
from __future__ import annotations

import math

import fitz

from app.perception.models import TextSpan


def _rotasi_dari_dir(dir_xy: tuple[float, float]) -> int:
    """Petakan vektor arah baca (cos, sin) PyMuPDF ke 0/90/180/270 derajat."""
    cos_a, sin_a = dir_xy
    sudut = math.degrees(math.atan2(sin_a, cos_a)) % 360
    # bulatkan ke kelipatan 90 terdekat
    return int(round(sudut / 90.0) % 4) * 90


def extract_spans(pdf_bytes: bytes) -> list[TextSpan]:
    """Ekstrak seluruh text-span vektor dari PDF (semua halaman)."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        return _extract_from_doc(doc)
    finally:
        doc.close()


def extract_spans_from_path(path: str) -> list[TextSpan]:
    doc = fitz.open(path)
    try:
        return _extract_from_doc(doc)
    finally:
        doc.close()


def extract_spans_from_page(
    page: "fitz.Page",
    page_index: int,
    *,
    method: str = "vector",
    confidence: float = 1.0,
) -> list[TextSpan]:
    """Ekstrak span dari SATU halaman yang sudah dimuat (reuse: P3 assembler,
    P6 raster detector — hindari duplikasi loop get_text("dict"))."""
    spans: list[TextSpan] = []
    raw = page.get_text("dict")
    i = 0
    line_hint = 0
    for block in raw.get("blocks", []):
        for line in block.get("lines", []):
            line_dir = line.get("dir", (1.0, 0.0))
            rotasi = _rotasi_dari_dir(tuple(line_dir))
            for span in line.get("spans", []):
                text = span.get("text", "")
                if not text.strip():
                    continue
                bbox = tuple(float(v) for v in span["bbox"])
                origin = tuple(float(v) for v in span.get("origin", (bbox[0], bbox[3])))
                spans.append(
                    TextSpan(
                        span_id=f"p{page_index}-{i:04d}",
                        page=page_index,
                        text=text,
                        bbox=bbox,  # type: ignore[arg-type]
                        rotasi=rotasi,
                        font_size=float(span.get("size", 0.0)),
                        origin=origin,  # type: ignore[arg-type]
                        method=method,  # type: ignore[arg-type]
                        confidence=confidence,
                        line_hint=line_hint,
                    )
                )
                i += 1
            line_hint += 1
    return spans


def _extract_from_doc(doc: "fitz.Document") -> list[TextSpan]:
    spans: list[TextSpan] = []
    for page_index in range(len(doc)):
        page = doc.load_page(page_index)
        spans.extend(extract_spans_from_page(page, page_index))
    return spans


def page_has_vector_text(pdf_bytes: bytes, page_index: int) -> tuple[bool, int]:
    """RULE-EXT-30: deteksi vektor vs raster PER SHEET. Kembalikan (is_vector, n_spans)."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page = doc.load_page(page_index)
        raw = page.get_text("dict")
        n = sum(
            1
            for block in raw.get("blocks", [])
            for line in block.get("lines", [])
            for span in line.get("spans", [])
            if span.get("text", "").strip()
        )
        return n >= 3, n
    finally:
        doc.close()
