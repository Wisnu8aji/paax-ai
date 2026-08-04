from __future__ import annotations

import fitz

from app.transcription.page_renderer import render_page, render_page_to_png


def _make_single_page_pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=200, height=100)
    page.insert_text((10, 50), "test page")
    return doc.tobytes()


def test_render_page_to_png_returns_png_bytes():
    pdf_bytes = _make_single_page_pdf_bytes()

    png_bytes = render_page_to_png(pdf_bytes, page_index=0)

    assert png_bytes.startswith(b"\x89PNG")


def test_render_page_default_dpi_is_300():
    pdf_bytes = _make_single_page_pdf_bytes()

    default = render_page(pdf_bytes, page_index=0)
    explicit_300 = render_page(pdf_bytes, page_index=0, dpi=300)
    explicit_200 = render_page(pdf_bytes, page_index=0, dpi=200)

    # Default must match the explicit 300 DPI contract (P2) and be sharper
    # than the old 200 DPI default.
    assert (default.width_px, default.height_px) == (
        explicit_300.width_px,
        explicit_300.height_px,
    )
    assert default.width_px > explicit_200.width_px
