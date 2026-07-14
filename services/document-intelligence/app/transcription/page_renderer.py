"""Render a single DEM PDF page to PNG bytes."""
from __future__ import annotations

import fitz


def render_page_to_png(pdf_bytes: bytes, page_index: int, dpi: int = 200) -> bytes:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page = doc[page_index]
        pixmap = page.get_pixmap(dpi=dpi)
        return pixmap.tobytes("png")
    finally:
        doc.close()
