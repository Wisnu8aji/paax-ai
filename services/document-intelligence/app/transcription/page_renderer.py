"""Render a single DEM PDF page to PNG bytes."""
from __future__ import annotations

from dataclasses import dataclass

import fitz


from app.perception.coordinate_transform import PageTransform, create_page_transform


@dataclass(frozen=True)
class RenderedPage:
    png_bytes: bytes
    width_px: int
    height_px: int
    page_transform: PageTransform


def render_page_to_png(pdf_bytes: bytes, page_index: int, dpi: int = 300) -> bytes:
    return render_page(pdf_bytes, page_index, dpi=dpi).png_bytes


def render_page(pdf_bytes: bytes, page_index: int, dpi: int = 300) -> RenderedPage:
    """Same rendering as render_page_to_png but also returns the pixel
    dimensions PyMuPDF already computed -- page_loop.py needs width_px/
    height_px for DemSource and re-deriving them from the PNG bytes
    separately would mean decoding the image a second time for no reason."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page = doc[page_index]
        pixmap = page.get_pixmap(dpi=dpi)
        transform = create_page_transform(page, dpi=dpi)
        return RenderedPage(
            png_bytes=pixmap.tobytes("png"),
            width_px=pixmap.width,
            height_px=pixmap.height,
            page_transform=transform,
        )
    finally:
        doc.close()
