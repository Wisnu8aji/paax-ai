"""
Deteksi sheet raster vs vektor PER SHEET (brain-00 RULE-EXT-30, Fase 2 P6).

Reuse `extract_spans_from_page` (P1) — sheet dianggap raster bila jumlah span
teks bermakna di bawah ambang kecil (tidak ada text-layer vektor berarti).
"""
from __future__ import annotations

import fitz

from app.perception.ingest.span_extractor import extract_spans_from_page

_MIN_VECTOR_SPANS = 3


def is_raster_sheet(page: "fitz.Page") -> tuple[bool, int]:
    """Kembalikan (is_raster, n_span_vektor). >=_MIN_VECTOR_SPANS -> vektor."""
    spans = extract_spans_from_page(page, page_index=0)
    n = len(spans)
    return n < _MIN_VECTOR_SPANS, n
