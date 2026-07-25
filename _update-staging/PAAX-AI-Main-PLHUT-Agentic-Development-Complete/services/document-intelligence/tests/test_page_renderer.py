from __future__ import annotations

import fitz

from app.transcription.page_renderer import render_page_to_png


def _make_single_page_pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=200, height=100)
    page.insert_text((10, 50), "test page")
    return doc.tobytes()


def test_render_page_to_png_returns_png_bytes():
    pdf_bytes = _make_single_page_pdf_bytes()

    png_bytes = render_page_to_png(pdf_bytes, page_index=0)

    assert png_bytes.startswith(b"\x89PNG")
