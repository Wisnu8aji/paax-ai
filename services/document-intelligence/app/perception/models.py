"""
PAAX Document Intelligence — Perception fondasi (Fase 2 P1).

TextSpan/Run adalah unit dasar sebelum grammar (brain-00 §1). Field
`method`/`confidence` ada sejak awal supaya span dari OCR raster (P6) bisa
mengalir ke pipeline yang SAMA (merge-run/grammar/grid/tabel) tanpa cabang
kode terpisah (RULE-EXT-31: confidence OCR < confidence vektor).

INV-TKG-03: raw span SELALU disimpan di dalam Run (zero-loss).
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class TextSpan(BaseModel):
    span_id: str
    page: int
    text: str
    bbox: tuple[float, float, float, float]
    rotasi: int
    font_size: float
    origin: tuple[float, float]
    method: Literal["vector", "ocr"] = "vector"
    confidence: float = 1.0
    line_hint: int = 0
    # Indeks baris visual asal (dari PyMuPDF `get_text("dict")` block/line, atau
    # 0 default utk span buatan manual/uji). Batas KERAS merge-run: dua span
    # dgn line_hint berbeda TIDAK PERNAH digabung, walau jarak geometris dekat
    # — PyMuPDF sudah mensegmentasi baris visual secara otentik; jangan
    # rederivasi via jarak-baseline saja (rawan salah gabung baris tabel
    # berdekatan, lihat catatan di merge_run.py).


class Run(BaseModel):
    run_id: str
    text: str
    spans: list[TextSpan]
    bbox: tuple[float, float, float, float]
    rotasi: int
    method: Literal["vector", "ocr"] = "vector"
    confidence: float = 1.0
    ragu: bool = False
