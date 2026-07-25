"""Fase 2 P6 — regresi RULE-EXT-05 (vektor-dulu): sheet vektor tak pernah OCR."""
from __future__ import annotations

import fitz
import app.perception.assemble as assemble_module
from app.perception.models import TextSpan
from app.perception.ocr.paddle_ocr_extractor import OcrExtractionResult
from tests.fixtures.perception._generate_synthetic_table_pdf import build_synthetic_table_pdf_bytes


def test_vector_sheet_never_calls_ocr(monkeypatch):
    called = {"count": 0}

    def _fail_if_called(*args, **kwargs):
        called["count"] += 1
        raise AssertionError("extract_spans_via_ocr TIDAK BOLEH dipanggil untuk sheet vektor (RULE-EXT-05)")

    monkeypatch.setattr(assemble_module, "extract_spans_via_ocr", _fail_if_called)

    pdf_bytes = build_synthetic_table_pdf_bytes()
    doc, _metrics = assemble_module.assemble_document_from_pdf_bytes(pdf_bytes, prj_id="TEST-P6-GUARD")

    assert called["count"] == 0
    assert len(doc.sheets) > 0


def test_raster_sheet_uses_nvidia_ocr_before_paddle(monkeypatch):
    called = {"nvidia": 0, "paddle": 0}

    def _fake_nvidia_ocr(_path: str, page: int):
        called["nvidia"] += 1
        return OcrExtractionResult(
            available=True,
            spans=[
                TextSpan(
                    span_id="p0-nvidia-test-0000",
                    page=page,
                    text="K1",
                    bbox=(10.0, 10.0, 40.0, 30.0),
                    rotasi=0,
                    font_size=20.0,
                    origin=(10.0, 30.0),
                    method="ocr",
                    confidence=0.8,
                    line_hint=0,
                )
            ],
            message="nvidia ok",
        )

    def _fail_paddle(*_args, **_kwargs):
        called["paddle"] += 1
        raise AssertionError("PaddleOCR should not run when NVIDIA OCR produced spans")

    monkeypatch.setattr(assemble_module, "is_raster_sheet", lambda _page: (True, 0))
    monkeypatch.setattr(assemble_module, "extract_spans_via_nvidia", _fake_nvidia_ocr)
    monkeypatch.setattr(assemble_module, "extract_spans_via_ocr", _fail_paddle)

    doc = fitz.open()
    try:
        page = doc.new_page(width=200, height=200)
        sheet, metrics = assemble_module.assemble_sheet_from_page(page, 0, "S01", "Sheet 1")
    finally:
        doc.close()

    assert called == {"nvidia": 1, "paddle": 0}
    assert metrics["ocr_provider"] == "nvidia"
    assert [element.kode for element in sheet.elements] == ["K1"]
