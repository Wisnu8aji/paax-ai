from pathlib import Path

import fitz

from app.drawing_intelligence.advanced_zones import analyze_hierarchical_zones
from app.drawing_intelligence.native_evidence import build_native_evidence_index
from app.drawing_intelligence.models import BBox

ROOT = Path(__file__).resolve().parents[3]
PDF = ROOT / "GAMBAR KERJA PLHUT SURAKARTA (1).pdf"


def test_page54_has_multiple_view_scales_and_native_evidence():
    doc = fitz.open(PDF)
    try:
        page = doc[53]
        analysis = analyze_hierarchical_zones(page, 53)
        denominators = {item.denominator for item in analysis.scales}
        assert {10, 25, 100}.issubset(denominators)
        assert analysis.multi_scale is True
        assert any(z.type in {"section", "detail", "drawing"} for z in analysis.zones)
        index = build_native_evidence_index(page, 53)
        assert index.records
        whole = index.query(BBox(x0=0, y0=0, x1=1, y1=1, space="normalized"))
        assert len(whole) == len(index.records)
        assert any(r.kind == "text" and "SKALA" in (r.text or "").upper() for r in whole)
    finally:
        doc.close()
