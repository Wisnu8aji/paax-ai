"""Fase 2 P6 — anchor test adapter PaddleOCR (lazy/opsional, brain-00 §8)."""
from __future__ import annotations

import importlib.util

import pytest

import app.perception.ocr.paddle_ocr_extractor as paddle_ocr_extractor
from app.perception.ocr.paddle_ocr_extractor import extract_spans_via_ocr

_PADDLEOCR_AVAILABLE = (
    importlib.util.find_spec("paddleocr") is not None
    and importlib.util.find_spec("paddle") is not None
)


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


@pytest.mark.skipif(
    not _PADDLEOCR_AVAILABLE,
    reason="paddleocr/paddlepaddle tidak terpasang di environment ini (opsional, berat, lihat pyproject.toml)",
)
def test_real_paddleocr_loads_when_installed():
    """
    Fase G (rencana besar 2026-07-05): `paddleocr`+`paddlepaddle` SUDAH
    terpasang NYATA di environment sesi ini (bukan lagi cuma mock) —
    `_load_paddle_ocr()` harus mengembalikan objek OCR sungguhan, bukan None.
    Inferensi PENUH (unduh model + proses gambar nyata) SENGAJA tidak
    dijadikan test rutin di sini (berat, butuh jaringan saat model pertama
    diunduh, bikin `pytest -q` lambat tiap dijalankan) — diverifikasi manual
    sekali terhadap halaman PLHUT ter-rasterisasi, hasilnya dicatat di
    `docs/ai-map/STATE.md` (bukan diklaim tanpa bukti).
    """
    ocr = paddle_ocr_extractor._load_paddle_ocr()
    assert ocr is not None


def test_paddleocr_gracefully_absent_is_still_supported(monkeypatch):
    """Jalur lazy-optional TETAP harus jalan kalau paket ini suatu saat
    di-uninstall lagi di mesin lain (mis. deploy tanpa extra [ocr]) — dites
    via monkeypatch supaya tidak bergantung pada environment sungguhan."""
    monkeypatch.setattr(paddle_ocr_extractor, "_load_paddle_ocr", lambda: None)
    result = extract_spans_via_ocr("dummy.png", page=0)
    assert result.available is False
    assert result.spans == []


class _FakeOcrThatCrashesAtInference:
    def predict(self, path: str):
        raise NotImplementedError("simulasi kegagalan native paddlepaddle/oneDNN")


def test_inference_failure_degrades_gracefully_not_crash(monkeypatch):
    """Temuan NYATA sesi ini (Fase G): inferensi paddlepaddle 3.3.1 gagal
    dgn NotImplementedError native (oneDNN) pada kombinasi OS/CPU mesin ini
    walau model termuat sukses. Adapter HARUS degradasi anggun (bukan
    meruntuhkan seluruh /drawings/analyze) — fallback manual tetap jalan."""
    monkeypatch.setattr(paddle_ocr_extractor, "_load_paddle_ocr", lambda: _FakeOcrThatCrashesAtInference())
    result = extract_spans_via_ocr("dummy.png", page=0)
    assert result.available is False
    assert result.spans == []
    assert "gagal saat inferensi" in result.message.lower()
