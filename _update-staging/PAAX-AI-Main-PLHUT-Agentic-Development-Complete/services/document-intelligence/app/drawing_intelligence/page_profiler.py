from __future__ import annotations

import fitz

from .models import PageProfile


def profile_page(page: fitz.Page, page_index: int, *, vector_path_count: int | None = None) -> PageProfile:
    text_dict = page.get_text("dict")
    span_count = sum(
        1
        for block in text_dict.get("blocks", [])
        for line in block.get("lines", [])
        for span in line.get("spans", [])
        if str(span.get("text", "")).strip()
    )
    if vector_path_count is not None:
        path_count = vector_path_count
    else:
        try:
            getter = getattr(page, "get_cdrawings", None)
            path_count = len(getter() if getter is not None else page.get_drawings())
        except Exception:
            path_count = 0
    try:
        image_count = len(page.get_images(full=True))
    except Exception:
        image_count = 0

    warnings: list[str] = []
    if span_count >= 3 and path_count >= 5:
        modality = "vector"
        confidence = min(0.99, 0.82 + min(span_count, 100) / 1000 + min(path_count, 1000) / 10000)
    elif span_count >= 3 or path_count >= 5:
        modality = "hybrid"
        confidence = 0.72
        warnings.append("page has only one strong native vector signal")
    else:
        modality = "raster"
        confidence = 0.9 if image_count else 0.55
        warnings.append("native text/vector primitives are sparse; OCR/CV fallback required")

    if page.rotation not in {0, 90, 180, 270}:
        warnings.append(f"unusual page rotation {page.rotation}")

    page_area = max(float(page.rect.width * page.rect.height), 1.0)
    path_density = path_count / page_area * 1_000_000
    text_density = span_count / page_area * 1_000_000
    if modality == "vector":
        routing_reason = "native text and vector primitives are both strong; use vector-first pipeline"
    elif modality == "hybrid":
        routing_reason = "only one native signal is strong; combine native extraction with OCR/CV fallback"
    else:
        routing_reason = "native primitives are sparse; route page to raster/OCR review"
    return PageProfile(
        page_index=page_index,
        width_pt=float(page.rect.width),
        height_pt=float(page.rect.height),
        rotation=int(page.rotation),
        modality=modality,
        vector_text_spans=span_count,
        vector_paths=path_count,
        raster_images=image_count,
        confidence=confidence,
        routing_reason=routing_reason,
        quality_metrics={
            "path_density_per_million_pt2": round(path_density, 4),
            "text_density_per_million_pt2": round(text_density, 4),
            "mixed_vector_raster": bool(image_count and (path_count or span_count)),
            "rotation_supported": page.rotation in {0, 90, 180, 270},
        },
        warnings=warnings,
    )
