"""Fase 2 P6 — regresi RULE-EXT-05 (vektor-dulu): sheet vektor tak pernah OCR."""
from __future__ import annotations

import app.perception.assemble as assemble_module
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
