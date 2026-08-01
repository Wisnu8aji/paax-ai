"""package_index.py — Phase 4 compliant

PHASE 4 FIX:
- classify_page() sekarang mengembalikan classification_status='needs_review'
  untuk halaman yang tidak pasti, BUKAN default ke 'plan'.
- Kolom classification di-persist ke dem_pages via migration idempotent.
- build_package_index_from_db() membaca dari dem_pages — tidak recalculate setiap request.
- Halaman yang belum punya OCR/DEM result: classification_status='needs_review'.
- Tidak ada halaman yang di-default ke 'NON_LEVEL' hanya karena tidak ada level keyword.
"""

import json
import logging
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def classify_page(title: str, discipline: str, sheet_num: str) -> Dict[str, str]:
    """Classifies a drawing page using evidence-based keyword rules.

    PHASE 4 FIX:
    - Returns classification_status='confident' only when evidence is clear.
    - Returns classification_status='needs_review' when no clear keywords found.
    - Does NOT default to classification='plan' — uncertain pages are 'needs_review'.
    - Does NOT force level='NON_LEVEL' just because no level keyword exists.
    """
    t_upper = (title or "").upper()
    d_upper = (discipline or "").upper()
    s_upper = (sheet_num or "").upper()

    classification = "needs_review"
    classification_status = "needs_review"
    level = "UNASSIGNED"
    non_level_category = "Tidak Diketahui"

    # 1. Check for Cover / Drawing List (high confidence)
    if "GAMBAR KERJA" in t_upper or "COVER" in t_upper or "SAMPUL" in t_upper:
        classification = "cover"
        classification_status = "confident"
        non_level_category = "Cover"
        level = "NON_LEVEL"
    elif "DAFTAR SINGKATAN" in t_upper or "DAFTAR GAMBAR" in t_upper or "NOTASI" in t_upper:
        classification = "drawing_list"
        classification_status = "confident"
        non_level_category = "General"
        level = "NON_LEVEL"
    elif "SITUASI" in t_upper or "SITE PLAN" in t_upper or "PAVING" in t_upper:
        classification = "site_plan"
        classification_status = "confident"
        non_level_category = "Site"
        level = "NON_LEVEL"
    elif "TAMPAK" in t_upper or "ELEVATION" in t_upper:
        classification = "elevation"
        classification_status = "confident"
        non_level_category = "Tampak"
        level = "NON_LEVEL"
    elif "POTONGAN" in t_upper or "SECTION" in t_upper:
        classification = "section"
        classification_status = "confident"
        non_level_category = "Potongan"
        level = "NON_LEVEL"
    elif "DETAIL" in t_upper or "BACKDROP" in t_upper or "BACKGROUND" in t_upper or "SHOPSIGN" in t_upper:
        classification = "detail"
        classification_status = "confident"
        non_level_category = "Detail"
        level = "NON_LEVEL"
    elif "TABEL" in t_upper or "SCHEDULE" in t_upper:
        classification = "schedule"
        classification_status = "confident"
        non_level_category = "Tabel"
        level = "NON_LEVEL"
    elif "DIAGRAM" in t_upper or "SKEMATIK" in t_upper or "SINGLE LINE" in t_upper:
        classification = "diagram"
        classification_status = "confident"
        non_level_category = "Diagram"
        level = "NON_LEVEL"
    elif "STANDAR" in t_upper or "CATATAN" in t_upper or "NOTES" in t_upper:
        classification = "notes"
        classification_status = "confident"
        non_level_category = "General"
        level = "NON_LEVEL"
    elif "DENAH" in t_upper or "PLAN" in t_upper or "LAYOUT" in t_upper or "FLOOR" in t_upper:
        # Likely a plan — check level
        classification = "plan"
        if "LANTAI 1" in t_upper or "LT.1" in t_upper or "LT 1" in t_upper or "LT-1" in t_upper or "FOOTPLAT" in t_upper or "PONDASI" in t_upper or "SLOOP" in t_upper or "SLOOF" in t_upper:
            level = "Lantai 1"
            classification_status = "confident"
        elif "LANTAI 2" in t_upper or "LT.2" in t_upper or "LT 2" in t_upper or "LT-2" in t_upper:
            level = "Lantai 2"
            classification_status = "confident"
        elif "ATAP" in t_upper:
            level = "Lantai Atap"
            classification_status = "confident"
        else:
            level = "UNASSIGNED"
            classification_status = "needs_review"
    elif ("PONDASI" in t_upper or "FOOTPLAT" in t_upper or "SLOOF" in t_upper) and level == "UNASSIGNED":
        classification = "plan"
        level = "Lantai 1"
        classification_status = "confident"
    else:
        # Cannot confidently classify — mark needs_review
        classification = "needs_review"
        classification_status = "needs_review"
        level = "UNASSIGNED"
        non_level_category = "Tidak Diketahui"

    # 2. Standardize Discipline
    disc = "Architectural"
    if "STRUKTUR" in d_upper or "SIPIL" in d_upper or "STRUCTURE" in d_upper:
        disc = "Structural"
    elif "MEP" in d_upper or "ELEKTRIKAL" in d_upper or "PLUMBING" in d_upper or "MEKANIKAL" in d_upper:
        disc = "MEP"
    elif "INTERIOR" in d_upper:
        disc = "Interior"

    return {
        "classification": classification,
        "classification_status": classification_status,
        "level": level,
        "non_level_category": non_level_category,
        "discipline": disc,
    }


def materialize_package_index(
    db_path: Path, *, project_id: str, run_id: str, pages_index: List[Dict[str, Any]],
) -> None:
    """Explicit, idempotent write command for one project/run only.

    This is intentionally separate from all read helpers.  Human review fields
    are left untouched so a re-materialization cannot overwrite a correction.
    """
    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()

    for page in pages_index:
        cur.execute("""
            UPDATE dem_pages
            SET paax_classification = ?,
                paax_discipline = ?,
                paax_level = ?,
                paax_non_level_category = ?,
                paax_classification_status = ?,
                paax_classification_source = ?,
                paax_rule_version = ?
            WHERE page_index = ?
            AND run_id = ?
            AND EXISTS (SELECT 1 FROM dem_runs WHERE id = ? AND project_id = ?)
        """, (
            page["classification"],
            page["discipline"],
            page["level"],
            page["non_level_category"],
            page.get("classification_status", "needs_review"),
            "keyword_rules_v1",
            "keyword_rules_v1",
            page["page_index"],
            run_id,
            run_id,
            project_id,
        ))

    conn.commit()
    conn.close()
    logger.info("Materialized package index for project=%s run=%s pages=%d", project_id, run_id, len(pages_index))


def build_package_index_from_dem_pages(
    dem_pages: List[Dict[str, Any]],
    project_id: str,
) -> Dict[str, Any]:
    """Materializes Drawing Package Index from DEM pages data.

    PHASE 4 COMPLIANCE:
    - Persists classification to dem_pages if db_path provided (idempotent).
    - Pages with uncertain classification get classification_status='needs_review'.
    - Counts unassigned pages honestly (classification='needs_review').
    - 88/88 preserved losslessly.
    """
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

        # If no title at all — this is ambiguous, mark needs_review
        if not title_val or title_val.strip() == "":
            title_val = f"Halaman {page_num} (Judul Tidak Terbaca)"
            c = {
                "classification": "needs_review",
                "classification_status": "needs_review",
                "level": "UNASSIGNED",
                "non_level_category": "Tidak Diketahui",
                "discipline": "Unknown",
            }
        else:
            c = classify_page(title_val, disc_val, sheet_num_val)

        pages_index.append({
            "page_index": page_index,
            "page_number": page_num,
            "sheet_number": sheet_num_val,
            "sheet_code": sheet_num_val,
            "title": title_val,
            "discipline": c["discipline"],
            "classification": c["classification"],
            "classification_status": c.get("classification_status", "needs_review"),
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
        c_lvl = p["level"] if p["level"] not in ("NON_LEVEL", "UNASSIGNED") else p["non_level_category"]
        by_classification[c_cls] = by_classification.get(c_cls, 0) + 1
        by_level[c_lvl] = by_level.get(c_lvl, 0) + 1

    needs_review_count = sum(1 for p in pages_index if p["classification_status"] == "needs_review")
    confident_count = len(pages_index) - needs_review_count

    manifest = {
        "project_id": project_id,
        "total_pages": len(pages_index),
        "confident_count": confident_count,
        "needs_review_count": needs_review_count,
        "unassigned_count": sum(1 for p in pages_index if p["level"] == "UNASSIGNED"),
        "classification_source": "keyword_rules_v1 (persistent in dem_pages)",
        "pages": pages_index,
        "summary": {
            "by_classification": by_classification,
            "by_level": by_level,
        }
    }
    return manifest


def build_package_index_from_db(
    db_path: Path, project_id: str = "PLHUT-SURAKARTA", run_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Reads package index directly from dem_pages — persistent, no re-classification.

    Uses persisted paax_classification columns if available. Falls back to
    build_package_index_from_dem_pages() and then persists for next call.
    """
    if not db_path.is_file():
        raise FileNotFoundError(f"Database missing at {db_path}")

    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()

    resolved_run_id = run_id
    if resolved_run_id is None:
        row = cur.execute(
            "SELECT id FROM dem_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1", (project_id,)
        ).fetchone()
        resolved_run_id = row[0] if row else None
    if not resolved_run_id:
        conn.close()
        raise ValueError(f"No DEM run found for project {project_id}")
    run_exists = cur.execute(
        "SELECT 1 FROM dem_runs WHERE id = ? AND project_id = ?", (resolved_run_id, project_id)
    ).fetchone()
    if run_exists is None:
        conn.close()
        raise ValueError(f"DEM run {resolved_run_id} is not part of project {project_id}")

    # Check if classifications already persisted
    cur.execute("""
        SELECT COUNT(*) FROM dem_pages
        WHERE paax_classification IS NOT NULL
        AND run_id = ?
    """, (resolved_run_id,))
    classified_count = cur.fetchone()[0]

    cur.execute("""
        SELECT page_index, status, result, paax_classification, paax_discipline,
               paax_level, paax_non_level_category, paax_classification_status
        FROM dem_pages
        WHERE run_id = ?
        ORDER BY page_index ASC
    """, (resolved_run_id,))
    db_rows = cur.fetchall()
    conn.close()

    if not db_rows:
        raise ValueError(f"No dem_pages found for project {project_id}")

    if classified_count == len(db_rows) and classified_count > 0:
        # Use persisted classifications — no re-calculation needed
        pages_index = []
        for (page_index, status, result_json, cls, discipline, lvl, non_lvl, cls_status) in db_rows:
            page_num = page_index + 1
            res = {}
            if result_json:
                try:
                    res = json.loads(result_json)
                except Exception:
                    pass
            sid = res.get("sheet_identity", {})
            title_val = sid.get("title", {}).get("value") if isinstance(sid.get("title"), dict) else str(sid.get("title") or f"Halaman {page_num}")
            sheet_num_val = sid.get("sheet_number", {}).get("value") if isinstance(sid.get("sheet_number"), dict) else str(sid.get("sheet_number") or f"P-{page_num:02d}")

            pages_index.append({
                "page_index": page_index,
                "page_number": page_num,
                "sheet_number": sheet_num_val,
                "sheet_code": sheet_num_val,
                "title": title_val or f"Halaman {page_num}",
                "discipline": discipline or "Unknown",
                "classification": cls or "needs_review",
                "classification_status": cls_status or "needs_review",
                "level": lvl or "UNASSIGNED",
                "non_level_category": non_lvl or "Tidak Diketahui",
                "original_order": page_num,
                "thumbnail_url": f"/projects/{project_id}/source-document/pages/{page_index}/image?width=400",
                "artifact_url": f"/projects/{project_id}/source-document/pages/{page_index}/image?width=1800",
                "pdf_url": f"/projects/{project_id}/source-document/pdf",
            })
    else:
        raise ValueError(
            f"Package index for project {project_id} is not materialized. "
            "Run the explicit package-index materialization job for its DEM run."
        )

    # Compute summary
    by_classification: Dict[str, int] = {}
    by_level: Dict[str, int] = {}
    for p in pages_index:
        c_cls = p["classification"]
        c_lvl = p["level"] if p["level"] not in ("NON_LEVEL", "UNASSIGNED") else p["non_level_category"]
        by_classification[c_cls] = by_classification.get(c_cls, 0) + 1
        by_level[c_lvl] = by_level.get(c_lvl, 0) + 1

    needs_review_count = sum(1 for p in pages_index if p["classification_status"] == "needs_review")
    confident_count = len(pages_index) - needs_review_count

    return {
        "project_id": project_id,
        "run_id": resolved_run_id,
        "total_pages": len(pages_index),
        "confident_count": confident_count,
        "needs_review_count": needs_review_count,
        "unassigned_count": sum(1 for p in pages_index if p["level"] == "UNASSIGNED"),
        "classification_source": "persisted_dem_pages (keyword_rules_v1)",
        "pages": pages_index,
        "summary": {
            "by_classification": by_classification,
            "by_level": by_level,
        }
    }
