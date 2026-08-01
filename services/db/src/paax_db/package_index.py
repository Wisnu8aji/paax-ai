import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
import os

logger = logging.getLogger(__name__)

def classify_page(title: str, discipline: str, sheet_num: str) -> Dict[str, str]:
    """Classifies a drawing page into level, non_level_category, and classification."""
    t_upper = (title or "").upper()
    d_upper = (discipline or "").upper()
    s_upper = (sheet_num or "").upper()

    classification = "plan"
    level = "UNASSIGNED"
    non_level_category = "General"

    # 1. Check for Cover / Drawing List
    if "GAMBAR KERJA" in t_upper or "COVER" in t_upper or "SAMPUL" in t_upper:
        classification = "cover"
        non_level_category = "Cover"
        level = "NON_LEVEL"
    elif "DAFTAR SINGKATAN" in t_upper or "DAFTAR GAMBAR" in t_upper or "NOTASI" in t_upper:
        classification = "drawing_list"
        non_level_category = "General"
        level = "NON_LEVEL"
    elif "SITUASI" in t_upper or "SITE PLAN" in t_upper or "PAVING" in t_upper:
        classification = "site_plan"
        non_level_category = "Site"
        level = "NON_LEVEL"
    elif "TAMPAK" in t_upper or "ELEVATION" in t_upper:
        classification = "elevation"
        non_level_category = "Tampak"
        level = "NON_LEVEL"
    elif "POTONGAN" in t_upper or "SECTION" in t_upper:
        classification = "section"
        non_level_category = "Potongan"
        level = "NON_LEVEL"
    elif "DETAIL" in t_upper or "BACKDROP" in t_upper or "BACKGROUND" in t_upper or "SHOPSIGN" in t_upper:
        classification = "detail"
        non_level_category = "Detail"
        level = "NON_LEVEL"
    elif "TABEL" in t_upper or "SCHEDULE" in t_upper:
        classification = "schedule"
        non_level_category = "Tabel"
        level = "NON_LEVEL"
    elif "DIAGRAM" in t_upper or "SKEMATIK" in t_upper or "SINGLE LINE" in t_upper:
        classification = "diagram"
        non_level_category = "Diagram"
        level = "NON_LEVEL"
    elif "STANDAR" in t_upper or "CATATAN" in t_upper or "NOTES" in t_upper:
        classification = "notes"
        non_level_category = "General"
        level = "NON_LEVEL"

    # 2. Extract Level for Plans if not already NON_LEVEL
    if level != "NON_LEVEL":
        if "LANTAI 1" in t_upper or "LT.1" in t_upper or "LT 1" in t_upper or "LT-1" in t_upper or "FOOTPLAT" in t_upper or "PONDASI" in t_upper or "SLOOP" in t_upper or "SLOOF" in t_upper:
            level = "Lantai 1"
        elif "LANTAI 2" in t_upper or "LT.2" in t_upper or "LT 2" in t_upper or "LT-2" in t_upper:
            level = "Lantai 2"
        elif "ATAP" in t_upper:
            level = "Lantai Atap"
        else:
            level = "NON_LEVEL"

    # 3. Standardize Discipline
    disc = "Architectural"
    if "STRUKTUR" in d_upper or "SIPIL" in d_upper or "STRUCTURE" in d_upper:
        disc = "Structural"
    elif "MEP" in d_upper or "ELEKTRIKAL" in d_upper or "PLUMBING" in d_upper or "MEKANIKAL" in d_upper:
        disc = "MEP"
    elif "INTERIOR" in d_upper:
        disc = "Interior"

    return {
        "classification": classification,
        "level": level,
        "non_level_category": non_level_category,
        "discipline": disc
    }


def build_package_index_from_dem_pages(dem_pages: List[Dict[str, Any]], project_id: str) -> Dict[str, Any]:
    """Materializes Drawing Package Index for all pages losslessly."""
    pages_index: List[Dict[str, Any]] = []

    for idx, page in enumerate(dem_pages):
        page_index = page.get("page_index", idx)
        page_num = page_index + 1
        res = page.get("result") or {}
        if isinstance(res, str):
            try:
                res = json.loads(res)
            except Exception:
                res = {}

        sid = res.get("sheet_identity", {})
        title_val = sid.get("title", {}).get("value") if isinstance(sid.get("title"), dict) else str(sid.get("title") or "")
        disc_val = sid.get("discipline", {}).get("value") if isinstance(sid.get("discipline"), dict) else str(sid.get("discipline") or "")
        sheet_num_val = sid.get("sheet_number", {}).get("value") if isinstance(sid.get("sheet_number"), dict) else str(sid.get("sheet_number") or f"P-{page_num:02d}")

        if not title_val or title_val.strip() == "":
            title_val = f"Page {page_num}"

        c = classify_page(title_val, disc_val, sheet_num_val)

        pages_index.append({
            "page_index": page_index,
            "page_number": page_num,
            "sheet_number": sheet_num_val,
            "sheet_code": sheet_num_val,
            "title": title_val,
            "discipline": c["discipline"],
            "classification": c["classification"],
            "level": c["level"],
            "non_level_category": c["non_level_category"],
            "original_order": page_num,
            "thumbnail_url": f"/projects/{project_id}/source-document/pages/{page_index}/image?width=400",
            "artifact_url": f"/projects/{project_id}/source-document/pages/{page_index}/image?width=1800",
            "pdf_url": f"/projects/{project_id}/source-document/pdf",
        })

    # Grouping counts
    by_classification: Dict[str, int] = {}
    by_level: Dict[str, int] = {}

    for p in pages_index:
        c_cls = p["classification"]
        c_lvl = p["level"] if p["level"] != "NON_LEVEL" else p["non_level_category"]
        by_classification[c_cls] = by_classification.get(c_cls, 0) + 1
        by_level[c_lvl] = by_level.get(c_lvl, 0) + 1

    manifest = {
        "project_id": project_id,
        "total_pages": len(pages_index),
        "unassigned_count": sum(1 for p in pages_index if p["level"] == "UNASSIGNED" and p["classification"] == "plan"),
        "pages": pages_index,
        "summary": {
            "by_classification": by_classification,
            "by_level": by_level,
        }
    }
    return manifest
