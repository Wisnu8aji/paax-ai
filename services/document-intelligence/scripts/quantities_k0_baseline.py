"""K0 — Baseline quantities measurement on the 88-page DEM JSON-1 extraction.

Measures, on `dem_extraction_88pages/pages/page-*.json` ONLY (no PDF, no AI):
  1. % label berkode        — element_labels rows that carry a parseable item code
  2. % dimensi joinable     — element labels that can be joined to dimensions
                              (inline dimension in the label text OR a nearby
                              `dimensions` observation row, bbox proximity ≤ 0.12
                              in normalized space, mirroring vocabulary.py)
  3. % level dari title     — pages whose sheet_identity.title resolves a level
                              via sheet_identity.infer_level
  4. % unit terisi          — dimensions observation rows with a non-null unit
  5. % item needs_review    — element labels that current deterministic engine
                              cannot classify (no code OR category == unknown),
                              i.e. the fraction that would fall into the
                              "perlu konfirmasi" / review bucket under the
                              current engine (E11 baseline).

Pure deterministic engine measurement (0% AI). Outputs a JSON artifact and a
human-readable summary. This is the BEFORE state for the 8-metric loop.

Usage:
  python scripts/quantities_k0_baseline.py [--pages DIR] [--out PATH]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "services" / "document-intelligence"))

from app.drawing_intelligence.sheet_identity import infer_level  # noqa: E402
from app.drawing_intelligence.vocabulary import (  # noqa: E402
    _bbox_distance,
    canonical_key,
    infer_category,
)

# Master Plan §4.2 item code grammar.
ITEM_CODE_RE = re.compile(r"\b([A-Z]{1,5}-?\d{1,3}[A-Z]?)\b", re.I)

DIMENSION_JOIN_DISTANCE = 0.12  # normalized bbox distance, mirrors vocabulary.py


def _row_text(row: dict) -> str:
    return str(row.get("raw") or row.get("normalized") or "")


def _has_inline_dimension(text: str) -> bool:
    """True when the label text embeds a dimension such as '15X10' / '400 x 400'."""
    return bool(re.search(r"\d{1,4}\s*[xX×]\s*\d{1,4}", text))


def measure_page(page_index: int, data: dict) -> dict:
    source = data.get("source", {})
    identity = data.get("sheet_identity", {}) or {}
    title_obj = identity.get("title") or {}
    title = title_obj.get("value") if isinstance(title_obj, dict) else title_obj
    title = str(title or "")
    observations = data.get("observations", {}) or {}

    labels = observations.get("element_labels", []) or []
    dimensions = observations.get("dimensions", []) or []

    # Normalized bboxes for proximity joining.
    def _norm(row: dict) -> tuple[float, float] | None:
        bbox = row.get("bbox")
        if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
            return None
        w = float(source.get("width_px") or 0)
        h = float(source.get("height_px") or 0)
        if w <= 0 or h <= 0:
            return None
        try:
            x0, y0, x1, y1 = (float(v) for v in bbox)
        except (TypeError, ValueError):
            return None
        return ((x0 + x1) / 2.0 / w, (y0 + y1) / 2.0 / h)

    label_centers = [_norm(row) for row in labels]
    dimension_centers = [_norm(row) for row in dimensions]

    coded = 0
    classified = 0
    joinable = 0
    codes: Counter = Counter()
    for index, row in enumerate(labels):
        text = _row_text(row)
        key = canonical_key(text)
        category = "unknown"
        if key:
            coded += 1
            codes[key] += 1
            category = infer_category(key, title=title, raw=text)
        if category != "unknown":
            classified += 1
        center = label_centers[index] if index < len(label_centers) else None
        inline = _has_inline_dimension(text)
        nearby = False
        if center is not None:
            nearby = any(
                dim_center is not None
                and _bbox_distance_flat(center, dim_center) <= DIMENSION_JOIN_DISTANCE
                for dim_center in dimension_centers
            )
        if inline or nearby:
            joinable += 1

    units_filled = sum(1 for row in dimensions if (row.get("unit") or "").strip())
    level_from_title = infer_level(title) is not None

    return {
        "page_index": page_index,
        "title": title,
        "label_count": len(labels),
        "label_coded": coded,
        "label_classified": classified,
        "label_joinable": joinable,
        "dimension_count": len(dimensions),
        "dimension_unit_filled": units_filled,
        "level_from_title": level_from_title,
        "codes": dict(codes),
    }


def _bbox_distance_flat(a: tuple[float, float], b: tuple[float, float]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def measure_all(pages_dir: Path) -> tuple[list[dict], dict]:
    pages: list[dict] = []
    for path in sorted(pages_dir.glob("page-*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        index = int(data.get("source", {}).get("page_index", len(pages)))
        pages.append(measure_page(index, data))
    pages.sort(key=lambda row: row["page_index"])

    total_labels = sum(row["label_count"] for row in pages)
    total_coded = sum(row["label_coded"] for row in pages)
    total_classified = sum(row["label_classified"] for row in pages)
    total_joinable = sum(row["label_joinable"] for row in pages)
    total_dimensions = sum(row["dimension_count"] for row in pages)
    total_units = sum(row["dimension_unit_filled"] for row in pages)
    total_level_from_title = sum(1 for row in pages if row["level_from_title"])
    total_pages = len(pages)

    all_codes: Counter = Counter()
    for row in pages:
        all_codes.update(row["codes"])

    summary = {
        "total_pages": total_pages,
        "total_element_labels": total_labels,
        "pct_label_coded": round(100.0 * total_coded / max(total_labels, 1), 2),
        "pct_label_classified": round(100.0 * total_classified / max(total_labels, 1), 2),
        "pct_dimension_joinable": round(100.0 * total_joinable / max(total_labels, 1), 2),
        "pct_level_from_title": round(100.0 * total_level_from_title / max(total_pages, 1), 2),
        "total_dimension_rows": total_dimensions,
        "pct_unit_filled": round(100.0 * total_units / max(total_dimensions, 1), 2),
        # Items the current engine would route to review: labels that are not
        # classified (no code OR code with category == unknown).
        "pct_item_needs_review_estimate": round(
            100.0 * (total_labels - total_classified) / max(total_labels, 1), 2
        ),
        "unique_codes": len(all_codes),
        "top_codes": all_codes.most_common(30),
        "metric_definitions": {
            "pct_label_coded": "element_labels rows with parseable item code (Master Plan §4.2 grammar)",
            "pct_label_classified": "element_labels rows whose code/context resolves to a non-unknown category",
            "pct_dimension_joinable": "element_labels rows joinable to dimensions (inline text or bbox proximity <= 0.12)",
            "pct_level_from_title": "pages whose sheet title resolves a spatial level",
            "pct_unit_filled": "dimensions rows with a non-null unit",
            "pct_item_needs_review_estimate": "fraction of element labels not classifiable by the deterministic engine (E11 baseline proxy)",
        },
    }
    return pages, summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pages", type=Path, default=REPO_ROOT / "dem_extraction_88pages" / "pages")
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    pages, summary = measure_all(args.pages)
    out_path = args.out or (Path(r"G:\PAAX-Orchestration\00_projects\2026-08-04-perbaikan-blur-quantities\04_execution\01_orion-f2\artifacts\k0_baseline.json"))

    payload = {
        "schema": "paax.quantities.k0-baseline.v1",
        "measured_at": None,  # filled by caller if needed; keep deterministic
        "measurement_source": "dem_extraction_88pages/pages/page-*.json",
        "summary": summary,
        "pages": pages,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    print("=" * 70)
    print("K0 BASELINE — 88-page DEM JSON-1 (engine-only, 0% AI)")
    print("=" * 70)
    print(f"pages                    : {summary['total_pages']}")
    print(f"total element labels     : {summary['total_element_labels']}")
    print(f"% label berkode          : {summary['pct_label_coded']}%")
    print(f"% label terklasifikasi   : {summary['pct_label_classified']}%")
    print(f"% dimensi joinable       : {summary['pct_dimension_joinable']}%")
    print(f"% level dari title       : {summary['pct_level_from_title']}%")
    print(f"total dimension rows     : {summary['total_dimension_rows']}")
    print(f"% unit terisi            : {summary['pct_unit_filled']}%")
    print(f"% item needs_review (est): {summary['pct_item_needs_review_estimate']}%")
    print(f"unique codes             : {summary['unique_codes']}")
    print(f"artifact                 : {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
