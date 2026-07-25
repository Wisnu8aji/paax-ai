"""Fase 2 P6 — anchor test deteksi sheet raster vs vektor (RULE-EXT-30)."""
from __future__ import annotations

import fitz

from app.perception.ingest.raster_detector import is_raster_sheet
from tests.fixtures.perception._generate_synthetic_pdf import build_synthetic_pdf_bytes


def test_vector_pdf_not_detected_as_raster():
    pdf_bytes = build_synthetic_pdf_bytes()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc.load_page(0)
    is_raster, n_spans = is_raster_sheet(page)
    assert is_raster is False
    assert n_spans >= 3


def test_blank_page_detected_as_raster():
    doc = fitz.open()
    doc.new_page(width=200, height=200)  # tanpa teks sama sekali
    page = doc.load_page(0)
    is_raster, n_spans = is_raster_sheet(page)
    assert is_raster is True
    assert n_spans < 3
