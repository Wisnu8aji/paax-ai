"""
PAAX Document Intelligence — Page Coordinate Space & Transform model.
Fase 3: Canonical Coordinate System (§9.2).
"""
from __future__ import annotations

from typing import List, Tuple
from pydantic import BaseModel, Field
import fitz  # PyMuPDF


def transform_bbox(bbox: Tuple[float, float, float, float], matrix: List[float]) -> Tuple[float, float, float, float]:
    """Transform a bounding box (x0, y0, x1, y1) using a 3x3 homogen matrix flattened to 9 elements."""
    x0, y0, x1, y1 = bbox
    # 4 corners of the bounding box
    corners = [
        (x0, y0),
        (x1, y0),
        (x0, y1),
        (x1, y1)
    ]
    transformed = []
    for x, y in corners:
        tx = matrix[0] * x + matrix[1] * y + matrix[2]
        ty = matrix[3] * x + matrix[4] * y + matrix[5]
        transformed.append((tx, ty))
    
    xs = [pt[0] for pt in transformed]
    ys = [pt[1] for pt in transformed]
    return (min(xs), min(ys), max(xs), max(ys))


class PageTransform(BaseModel):
    page_width_pdf: float
    page_height_pdf: float
    render_width_px: int
    render_height_px: int
    rotation_degrees: int
    crop_box_pdf: List[float] = Field(default_factory=list)
    pdf_to_pixel: List[float] = Field(default_factory=list)
    pixel_to_normalized: List[float] = Field(default_factory=list)
    normalized_to_pdf: List[float] = Field(default_factory=list)

    def pdf_to_pixel_bbox(self, bbox: Tuple[float, float, float, float]) -> Tuple[float, float, float, float]:
        return transform_bbox(bbox, self.pdf_to_pixel)

    def pixel_to_normalized_bbox(self, bbox: Tuple[float, float, float, float]) -> Tuple[float, float, float, float]:
        return transform_bbox(bbox, self.pixel_to_normalized)

    def normalized_to_pdf_bbox(self, bbox: Tuple[float, float, float, float]) -> Tuple[float, float, float, float]:
        return transform_bbox(bbox, self.normalized_to_pdf)

    def pdf_to_normalized_bbox(self, bbox: Tuple[float, float, float, float]) -> Tuple[float, float, float, float]:
        pixel_bbox = self.pdf_to_pixel_bbox(bbox)
        return self.pixel_to_normalized_bbox(pixel_bbox)

    def normalized_to_pixel_bbox(self, bbox: Tuple[float, float, float, float]) -> Tuple[float, float, float, float]:
        x0, y0, x1, y1 = bbox
        return (
            x0 * self.render_width_px,
            y0 * self.render_height_px,
            x1 * self.render_width_px,
            y1 * self.render_height_px
        )


def create_page_transform(page: fitz.Page, dpi: int = 200) -> PageTransform:
    """Create a PageTransform model from a PyMuPDF page."""
    rect = page.rect
    # page.rect represents the dimension after rotation, but for the untransformed PDF point space
    # we need the original dimension (before set_rotation) or use rotation_matrix to figure out size.
    # Actually, page.rect is already the rotated rectangle. 
    # Let's get the original unrotated size:
    # If rotation is 90 or 270, the original width and height are swapped.
    rotation_degrees = page.rotation
    if rotation_degrees in (90, 270):
        page_width_pdf = rect.height
        page_height_pdf = rect.width
    else:
        page_width_pdf = rect.width
        page_height_pdf = rect.height
    
    # get_pixmap dimensions
    pix = page.get_pixmap(dpi=dpi)
    render_width_px = pix.width
    render_height_px = pix.height
    
    # Matrix pdf (unrotated) -> pixel (rotated)
    zoom = dpi / 72.0
    m_pdf_to_pixel = page.rotation_matrix * fitz.Matrix(zoom, zoom)
    pdf_to_pixel = [
        m_pdf_to_pixel.a, m_pdf_to_pixel.c, m_pdf_to_pixel.e,
        m_pdf_to_pixel.b, m_pdf_to_pixel.d, m_pdf_to_pixel.f,
        0.0, 0.0, 1.0
    ]
    
    # Matrix pixel -> normalized
    pixel_to_normalized = [
        1.0 / render_width_px, 0.0, 0.0,
        0.0, 1.0 / render_height_px, 0.0,
        0.0, 0.0, 1.0
    ]
    
    # normalized -> pixel matrix
    normalized_to_pixel = fitz.Matrix(render_width_px, 0, 0, render_height_px, 0, 0)
    
    # normalized -> pdf matrix: (normalized -> pixel) * (pixel -> pdf)
    try:
        m_pixel_to_pdf = ~m_pdf_to_pixel
    except Exception:
        m_pixel_to_pdf = fitz.Matrix()
        
    m_normalized_to_pdf = normalized_to_pixel * m_pixel_to_pdf
    normalized_to_pdf = [
        m_normalized_to_pdf.a, m_normalized_to_pdf.c, m_normalized_to_pdf.e,
        m_normalized_to_pdf.b, m_normalized_to_pdf.d, m_normalized_to_pdf.f,
        0.0, 0.0, 1.0
    ]
    
    # Crop box
    crop_box = [page.cropbox.x0, page.cropbox.y0, page.cropbox.x1, page.cropbox.y1]
    
    return PageTransform(
        page_width_pdf=page_width_pdf,
        page_height_pdf=page_height_pdf,
        render_width_px=render_width_px,
        render_height_px=render_height_px,
        rotation_degrees=rotation_degrees,
        crop_box_pdf=crop_box,
        pdf_to_pixel=pdf_to_pixel,
        pixel_to_normalized=pixel_to_normalized,
        normalized_to_pdf=normalized_to_pdf
    )
