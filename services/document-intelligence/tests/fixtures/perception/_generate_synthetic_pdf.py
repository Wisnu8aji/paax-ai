"""
Fase 2 P1 — generator PDF sintetis NON-PLHUT (§0.1 fixture-bukan-template).

Gaya & angka SENGAJA beda dari PLHUT (grid 6000+6000, balok B1 bukan
kolom K-series) supaya bukti generalisasi grammar/persepsi, bukan overfit.
Jalankan manual untuk regenerasi:
    python tests/fixtures/perception/_generate_synthetic_pdf.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import fitz

_THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_THIS_DIR.parents[2]))  # services/document-intelligence

from app.perception.ingest.span_extractor import extract_spans  # noqa: E402


def build_synthetic_pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=400, height=400)
    page.insert_text((50, 100), "GRID A-B 6000", fontsize=10)
    page.insert_text((50, 130), "GRID B-C 6000", fontsize=10)
    page.insert_text((50, 160), "B1 300X500 4D19", fontsize=10)
    page.insert_text((50, 190), "SFL +0.000", fontsize=10)
    page.insert_text((300, 50), "AS 2", fontsize=10, rotate=90)
    return doc.tobytes()


if __name__ == "__main__":
    pdf_bytes = build_synthetic_pdf_bytes()
    spans = extract_spans(pdf_bytes)
    out = {
        "generated_from": "_generate_synthetic_pdf.py (non-PLHUT, §0.1)",
        "spans": [s.model_dump() for s in spans],
    }
    out_path = _THIS_DIR / "synthetic_denah_spans.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Ditulis {len(spans)} span ke {out_path}")
