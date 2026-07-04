"""
Fase 2 P1 — ekstraksi span mentah dari PDF PLHUT nyata (kunci uji, §0.1).

PLHUT = kunci uji, BUKAN template — hasil (`plhut_spans.json`) dipakai HANYA
di tests/fixtures/, tidak pernah jadi logika sistem. Jalankan manual untuk
regenerasi (env WAJIB diisi, gagal keras bila tidak):
    $env:PAAX_PLHUT_PDF="C:\\Users\\Nothing\\Downloads\\GAMBAR KERJA PLHUT SURAKARTA.pdf"
    python tests/fixtures/perception/_generate_plhut_spans.py
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_THIS_DIR.parents[2]))  # services/document-intelligence

from app.perception.ingest.span_extractor import extract_spans_from_path  # noqa: E402


def main() -> None:
    pdf_path = os.environ.get("PAAX_PLHUT_PDF")
    if not pdf_path or not Path(pdf_path).exists():
        raise SystemExit(
            "PAAX_PLHUT_PDF tidak diset atau file tidak ditemukan. "
            "Set env ke path 'GAMBAR KERJA PLHUT SURAKARTA.pdf' sebelum menjalankan "
            "generator ini — TIDAK ADA fabrikasi data pengganti."
        )

    spans = extract_spans_from_path(pdf_path)
    file_hash = hashlib.sha256(Path(pdf_path).read_bytes()).hexdigest()

    out = {
        "generated_from": "_generate_plhut_spans.py (PLHUT = kunci uji, bukan template, §0.1)",
        "file_hash": file_hash,
        "n_spans": len(spans),
        "spans": [s.model_dump() for s in spans],
    }
    out_path = _THIS_DIR / "plhut_spans.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Ditulis {len(spans)} span ke {out_path}")


if __name__ == "__main__":
    main()
