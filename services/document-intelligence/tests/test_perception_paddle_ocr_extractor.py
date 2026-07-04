"""Fase 2 P6 — anchor test adapter PaddleOCR (lazy/opsional, brain-00 §8)."""
from __future__ import annotations

import app.perception.ocr.paddle_ocr_extractor as paddle_ocr_extractor
from app.perception.ocr.paddle_ocr_extractor import extract_spans_via_ocr


class _FakeResult:
    def __init__(self, json_data: dict):
        self.json = json_data


class _FakeOcr:
    def predict(self, path: str):
        return [_FakeResult({
            "rec_texts": ["K1"],
            "rec_scores": [0.87],
            "rec_boxes": [[10, 10, 50, 30]],
        })]


def test_ocr_not_installed_returns_available_false_not_crash(monkeypatch):
    monkeypatch.setattr(paddle_ocr_extractor, "_load_paddle_ocr", lambda: None)
    result = extract_spans_via_ocr("dummy.png", page=0)
    assert result.available is False
    assert result.spans == []
    assert "tidak tersedia" in result.message.lower() or "install" in result.message.lower()


def test_ocr_installed_produces_textspan_from_mocked_result(monkeypatch):
    monkeypatch.setattr(paddle_ocr_extractor, "_load_paddle_ocr", lambda: _FakeOcr())
    result = extract_spans_via_ocr("dummy.png", page=0)
    assert result.available is True
    assert len(result.spans) == 1
    span = result.spans[0]
    assert span.text == "K1"
    assert span.confidence == 0.87
    assert span.method == "ocr"
    assert span.bbox == (10.0, 10.0, 50.0, 30.0)


def test_real_paddleocr_not_installed_in_this_environment():
    """
    Dokumentasi eksplisit (bukan asumsi diam-diam): `paddleocr` BELUM
    terpasang di environment ini — jalur nyata (bukan mock) belum diverifikasi
    end-to-end. Ini disengaja (dependency berat/opsional, §Paket F2-P6 P6.1) —
    _load_paddle_ocr() HARUS mengembalikan None, bukan error, saat paket ini
    tak ada.
    """
    assert paddle_ocr_extractor._load_paddle_ocr() is None
