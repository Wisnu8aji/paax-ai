from __future__ import annotations

from pathlib import Path
import tempfile

import fitz

from app.perception.ocr.paddle_ocr_extractor import extract_spans_via_ocr

from .models import BBox, PlanZone, TextToken
from .text_index import normalize_text


def extract_raster_tokens(
    page: fitz.Page,
    page_index: int,
    zones: list[PlanZone],
    *,
    dpi: int = 240,
) -> tuple[list[TextToken], list[str]]:
    """Run optional local OCR only when native PDF text is unavailable."""
    warnings: list[str] = []
    pixmap = page.get_pixmap(dpi=dpi, alpha=False)
    with tempfile.TemporaryDirectory(prefix="paax-ocr-") as directory:
        image_path = Path(directory) / f"page-{page_index:04d}.png"
        pixmap.save(image_path)
        result = extract_spans_via_ocr(str(image_path), page_index)
    if not result.available:
        return [], [result.message or "local OCR is unavailable"]

    tokens: list[TextToken] = []
    for index, span in enumerate(result.spans):
        x0, y0, x1, y1 = span.bbox
        box = BBox(
            x0=max(0.0, min(1.0, x0 / max(pixmap.width, 1))),
            y0=max(0.0, min(1.0, y0 / max(pixmap.height, 1))),
            x1=max(0.0, min(1.0, x1 / max(pixmap.width, 1))),
            y1=max(0.0, min(1.0, y1 / max(pixmap.height, 1))),
            space="normalized",
        )
        zone_id = next((zone.zone_id for zone in zones if zone.bbox.contains(*box.center)), None)
        tokens.append(
            TextToken(
                token_id=f"p{page_index}-ocr-{index:05d}",
                page_index=page_index,
                text=span.text,
                normalized=normalize_text(span.text),
                bbox=box,
                zone_id=zone_id,
                source="ocr",
                confidence=max(0.0, min(0.99, float(span.confidence))),
            )
        )
    if not tokens:
        warnings.append("local OCR completed but returned no text spans")
    return tokens, warnings
