"""
Unit tests for coordinate space transform logic (§9.2).
"""
import fitz
import pytest
from app.perception.coordinate_transform import create_page_transform


def test_page_transform_roundtrip():
    # Create empty PDF in memory
    doc = fitz.open()
    page = doc.new_page(width=841.89, height=595.28) # A4 landscape
    
    transform = create_page_transform(page, dpi=200)
    
    # Original bbox in PDF point
    pdf_bbox = (100.0, 150.0, 200.0, 250.0)
    
    # Round-trip: PDF -> Pixel -> Normalized -> PDF
    pixel_bbox = transform.pdf_to_pixel_bbox(pdf_bbox)
    normalized_bbox = transform.pixel_to_normalized_bbox(pixel_bbox)
    pdf_bbox_back = transform.normalized_to_pdf_bbox(normalized_bbox)
    
    # Check if they are close (tolerance 1e-2 due to float conversions)
    for val_orig, val_back in zip(pdf_bbox, pdf_bbox_back):
        assert abs(val_orig - val_back) < 1e-2


def test_page_transform_with_rotation():
    doc = fitz.open()
    page = doc.new_page(width=841.89, height=595.28)
    page.set_rotation(90)
    
    transform = create_page_transform(page, dpi=200)
    
    pdf_bbox = (10.0, 20.0, 100.0, 80.0)
    
    pixel_bbox = transform.pdf_to_pixel_bbox(pdf_bbox)
    normalized_bbox = transform.pixel_to_normalized_bbox(pixel_bbox)
    pdf_bbox_back = transform.normalized_to_pdf_bbox(normalized_bbox)
    
    # Check roundtrip even with rotation
    for val_orig, val_back in zip(pdf_bbox, pdf_bbox_back):
        assert abs(val_orig - val_back) < 1e-2


def test_page_transform_resolution_independence():
    doc = fitz.open()
    page = doc.new_page(width=841.89, height=595.28)
    
    transform_low = create_page_transform(page, dpi=100)
    transform_high = create_page_transform(page, dpi=300)
    
    pdf_bbox = (50.0, 60.0, 150.0, 200.0)
    
    # Bbox in normalized space must be independent of resolution (DPI)
    pixel_low = transform_low.pdf_to_pixel_bbox(pdf_bbox)
    norm_low = transform_low.pixel_to_normalized_bbox(pixel_low)
    
    pixel_high = transform_high.pdf_to_pixel_bbox(pdf_bbox)
    norm_high = transform_high.pixel_to_normalized_bbox(pixel_high)
    for val_low, val_high in zip(norm_low, norm_high):
        assert abs(val_low - val_high) < 1e-3
