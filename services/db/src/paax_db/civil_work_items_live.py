import sqlite3
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def _node_evidence_pages(cur: sqlite3.Cursor, node_id: str) -> List[int]:
    """Fetch page indices from project_graph_evidence linked to a node via node_evidence junction."""
    # Primary path: node -> node_evidence -> evidence -> page_index
    cur.execute("""
        SELECT DISTINCT e.page_index
        FROM project_graph_node_evidence ne
        JOIN project_graph_evidence e ON e.evidence_id = ne.evidence_id
        WHERE ne.node_id = ?
        AND e.page_index IS NOT NULL
        ORDER BY e.page_index
    """, (node_id,))
    rows = cur.fetchall()
    pages = [r[0] for r in rows if isinstance(r[0], int)]

    if not pages:
        # Fallback: look for evidence linked via edges to this node
        cur.execute("""
            SELECT DISTINCT e.page_index
            FROM project_graph_edges edge
            JOIN project_graph_node_evidence ne ON (
                ne.node_id = edge.source_node_id OR ne.node_id = edge.target_node_id
            )
            JOIN project_graph_evidence e ON e.evidence_id = ne.evidence_id
            WHERE (edge.source_node_id = ? OR edge.target_node_id = ?)
            AND e.page_index IS NOT NULL
            ORDER BY e.page_index
            LIMIT 10
        """, (node_id, node_id))
        rows = cur.fetchall()
        pages = [r[0] for r in rows if isinstance(r[0], int)]

    return pages


def _node_evidence_refs(cur: sqlite3.Cursor, node_id: str) -> List[Dict[str, Any]]:
    """Return resolvable canonical evidence records, never fabricated IDs."""
    cur.execute("""
        SELECT DISTINCT e.evidence_id, e.document_id, e.page_index, ne.role
        FROM project_graph_node_evidence ne
        JOIN project_graph_evidence e ON e.evidence_id = ne.evidence_id
        WHERE ne.node_id = ?
        ORDER BY e.page_index, e.evidence_id
    """, (node_id,))
    return [
        {"evidence_id": evidence_id, "document_id": document_id, "page_index": page_index, "role": role}
        for evidence_id, document_id, page_index, role in cur.fetchall()
    ]


def _classify_node(name_upper: str, disc: str) -> tuple:
    """Returns (category, domain, unit, wbs_group) based on element name and discipline.
    Returns explicit UNKNOWN values when classification is uncertain.
    """
    disc_upper = (disc or "").upper()

    if "KOLOM" in name_upper or re.search(r'\bK[0-9]+\b', name_upper):
        return ("column", "Struktur Kolom", "m³", "Struktur Kolom")
    elif "BALOK" in name_upper or "LINTEL" in name_upper or re.search(r'\bB[0-9]+\b', name_upper):
        return ("beam", "Struktur Balok & Sloof", "m³", "Struktur Balok")
    elif "SLOOF" in name_upper or re.search(r'\bS[0-9]+\b', name_upper):
        return ("sloof", "Struktur Balok & Sloof", "m³", "Struktur Sloof")
    elif "PONDASI" in name_upper or "BATU KALI" in name_upper or "FOOTPLAT" in name_upper or re.search(r'\bF[0-9]+\b', name_upper):
        return ("foundation", "Pondasi & Substructure", "m³", "Pondasi")
    elif "TANGGA" in name_upper:
        return ("stair", "Struktur Pelat & Tangga", "unit", "Struktur Tangga")
    elif "PELAT" in name_upper:
        return ("slab", "Struktur Pelat & Tangga", "m³", "Struktur Pelat")
    elif "ATAP" in name_upper or "KUDA-KUDA" in name_upper or "GORDING" in name_upper:
        return ("roof", "Atap & Baja", "m²", "Pekerjaan Atap")
    elif "MEP" in disc_upper or "POMPA" in name_upper or "SEPTIC" in name_upper or "PLUMBING" in name_upper:
        return ("mep", "MEP & Sanitasi", "unit", "Mekanikal Elektrikal Plumbing")
    elif "DINDING" in name_upper or "KUSEN" in name_upper or "PINTU" in name_upper or "JENDELA" in name_upper:
        return ("wall", "Dinding & Kusen", "m²", "Dinding & Kusen")
    else:
        # Truly unknown — do not assign misleading category
        return ("unknown", "Lainnya / Tidak Terklasifikasi", "unit", "Belum Terklasifikasi")


import re


def build_live_civil_work_items(db_path: Path, project_id: str = "PLHUT-SURAKARTA") -> Dict[str, Any]:
    """Materializes live candidate work-items from project graph in portable.sqlite.

    PHASE 4 COMPLIANCE:
    - No hardcoded verified_blueprints, result values, dimensions, counts, or engine receipts.
    - Verified items come ONLY from measurement_facts with verification_status='human_verified'
      and their associated rab_materialization_mappings.
    - Candidate items are derived from project_graph_nodes with evidence provenance from
      project_graph_evidence and project_graph_edges — no global page fallback.
    - Items without confirmed dimensions: status='needs_review', no count, no result, no fake hash.
    - Unknown classification: status='needs_review', category='unknown'.
    """
    if not db_path.is_file():
        raise FileNotFoundError(f"Database missing at {db_path}")

    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()

    items: List[Dict[str, Any]] = []
    engine_verified = 0
    measurement_verified = 0
    needs_review = 0
    blocked = 0
    not_applicable = 0

    domain_counts: Dict[str, int] = {}

    # ------------------------------------------------------------------ #
    # SECTION 1: Engine-verified items from measurement_facts persistence  #
    # ------------------------------------------------------------------ #
    cur.execute("""
        SELECT
            mf.measurement_id, mf.project_id, mf.measurement_type,
            mf.value, mf.unit, mf.source_method, mf.element_ids,
            mf.evidence_refs, mf.formula_inputs, mf.verification_status,
            mf.created_at,
            rm.id as mapping_id, rm.work_item_node_id,
            rm.calculation_type, rm.approval_status, rm.created_at as mapping_created
        FROM measurement_facts mf
        LEFT JOIN rab_materialization_mappings rm ON (
            rm.project_id = mf.project_id
            AND json_extract(rm.measurement_fact_ids, '$[0]') = mf.measurement_id
        )
        WHERE mf.project_id = ?
        AND mf.verification_status = 'human_verified'
        AND mf.superseded_at IS NULL
    """, (project_id,))
    verified_rows = cur.fetchall()

    verified_element_ids = set()
    for row in verified_rows:
        (meas_id, proj_id, meas_type, value, unit, src_method, el_ids_json,
         ev_refs_json, formula_json, v_status, created_at,
         mapping_id, work_item_node_id, calc_type, approval_status, map_created) = row

        el_ids = []
        try:
            el_ids = json.loads(el_ids_json) if el_ids_json else []
        except Exception:
            el_ids = []

        ev_refs = []
        try:
            ev_refs = json.loads(ev_refs_json) if ev_refs_json else []
        except Exception:
            ev_refs = []

        # Get node details for element
        node_info = {}
        if el_ids:
            cur.execute("""
                SELECT node_id, canonical_name, node_type, discipline, level_id
                FROM project_graph_nodes WHERE node_id = ?
            """, (el_ids[0],))
            node_row = cur.fetchone()
            if node_row:
                node_info = dict(zip(["node_id", "canonical_name", "node_type", "discipline", "level_id"], node_row))

        verified_element_ids.update(el_ids)

        # Derive display name from node or measurement type
        display_name = node_info.get("canonical_name") or f"Elemen {meas_type} (ID: {meas_id})"
        level = node_info.get("level_id") or "Tidak Diketahui"
        discipline = node_info.get("discipline") or "STR"

        domain = "Lainnya / Tidak Terklasifikasi"
        if "column" in (calc_type or "").lower() or "kolom" in display_name.lower():
            domain = "Struktur Kolom"
        elif "beam" in (calc_type or "").lower() or "balok" in display_name.lower():
            domain = "Struktur Balok & Sloof"
        elif "foundation" in (calc_type or "").lower() or "pondasi" in display_name.lower():
            domain = "Pondasi & Substructure"
        elif "slab" in (calc_type or "").lower() or "pelat" in display_name.lower():
            domain = "Struktur Pelat & Tangga"

        domain_counts[domain] = domain_counts.get(domain, 0) + 1

        item = {
            "id": meas_id,
            "display_name": display_name,
            "technical_code": el_ids[0][:16] if el_ids else meas_id,
            "discipline": discipline.upper() if discipline else "STR",
            "lbs_path": ["Bangunan Utama", level, display_name],
            "wbs_section": "03 00 00 – Pekerjaan Struktur",
            "wbs_group": domain,
            "category": calc_type or meas_type,
            "location": level,
            "unit": unit,
            "dimensions": None,  # Raw measurement fact — dimensions stored separately if applicable
            "dimensions_display": f"{value} {unit}",
            "count": None,  # Not applicable without BoQ aggregation
            "formula": None,
            "result": None,
            "result_display": "MeasurementFact terverifikasi; belum ada calculation receipt engine",
            "status": "measurement_verified",
            "source_authority": "measurement_fact_db",
            "source_pages": _node_evidence_pages(cur, el_ids[0]) if el_ids else [],
            "source_refs": [
                {"role": "evidence_ref", "ref": ref} for ref in ev_refs
            ],
            "evidence_refs": ev_refs,
            "measurement_fact_id": meas_id,
            "mapping_id": mapping_id,
            "verification_status": v_status,
            "approval_lineage": {"measurement_status": v_status, "mapping_status": approval_status},
        }

        measurement_verified += 1

        items.append(item)

    # ------------------------------------------------------------------ #
    # SECTION 2: Candidate inventory from project_graph_nodes              #
    # ------------------------------------------------------------------ #
    cur.execute("""
        SELECT node_id, node_type, canonical_name, normalized_name, discipline, level_id,
               verification_status, confidence, properties
        FROM project_graph_nodes
        WHERE project_id = ?
        AND node_type IN ('element_type', 'element_occurrence', 'drawing_reference')
        AND node_id NOT IN ({})
        ORDER BY canonical_name ASC
    """.format(",".join("?" * len(verified_element_ids)) if verified_element_ids else "SELECT NULL"),
        [project_id] + (list(verified_element_ids) if verified_element_ids else [])
    )
    candidate_rows = cur.fetchall()

    source_node_count = len(candidate_rows)
    merged_candidates = 0
    rejected_not_work_item = 0
    duplicates: List[Dict[str, str]] = []

    for node_id, node_type, canonical_name, norm_name, disc, level_id, v_status, conf, props_json in candidate_rows:
        name = canonical_name or norm_name or "UNNAMED_ELEMENT"

        props = {}
        if props_json:
            try:
                props = json.loads(props_json)
            except Exception:
                props = {}

        name_upper = name.upper()
        category, domain, unit, wbs_group = _classify_node(name_upper, disc or "")

        # Get real evidence pages for this node — no global page fallback
        canonical_evidence = _node_evidence_refs(cur, node_id)
        evidence_pages = sorted({e["page_index"] for e in canonical_evidence if e["page_index"] is not None})

        if node_type == "drawing_reference":
            rejected_not_work_item += 1
            not_applicable += 1
            continue

        domain_counts[domain] = domain_counts.get(domain, 0) + 1

        # Status: use DB verification_status as guide
        if v_status in ("human_verified", "ai_verified"):
            status = "needs_review"  # Has no rab_mapping yet
        elif v_status in ("conflicting", "ambiguous"):
            status = "needs_review"
        else:
            status = "blocked_missing_evidence"

        if status == "needs_review":
            needs_review += 1
        else:
            blocked += 1

        review_reasons = []
        if v_status == "ai_verified":
            review_reasons.append("AI suggestion requires explicit human approval")
        if not evidence_pages:
            review_reasons.append("Tidak ada evidence page teridentifikasi di project graph untuk node ini")
        if category == "unknown":
            review_reasons.append("Klasifikasi elemen tidak dapat ditentukan — butuh review manual")
        if not review_reasons:
            if status == "needs_review":
                review_reasons = ["Dimensi penampang perlu dikonfirmasi dari tabel spesifikasi"]
            else:
                review_reasons = ["Bukti tertulis dimensi belum ditemukan dalam project graph evidence"]

        items.append({
            "id": f"cand-{node_id[:20]}",
            "display_name": name,
            "technical_code": name.split("@")[0].strip()[:32],
            "discipline": (disc or "UNKNOWN").upper()[:10],
            "lbs_path": ["Bangunan Utama", level_id or "UNKNOWN_LEVEL", name],
            "wbs_section": f"00 00 00 – {wbs_group}",
            "wbs_group": wbs_group,
            "category": category,
            "location": level_id or "UNKNOWN",  # No default "Lantai 1"
            "unit": unit,
            "dimensions": None,
            "dimensions_display": "Dimensi tidak terkonfirmasi",
            "count": None,   # No default count=1
            "formula": None,
            "result": None,
            "result_display": "Membutuhkan review dan konfirmasi evidence",
            "status": status,
            "source_authority": "project_graph_node",
            "source_pages": evidence_pages,  # Real pages from graph, not hardcoded
            "source_refs": [{"role": "graph_node", "node_id": node_id, "label": name}] + canonical_evidence,
            "evidence_refs": canonical_evidence,
            "candidate_kind": "element_occurrence" if node_type == "element_occurrence" else "element_definition",
            "review_reasons": review_reasons,
        })
        merged_candidates += 1

    # ------------------------------------------------------------------ #
    # SECTION 3: Reconciliation summary                                    #
    # ------------------------------------------------------------------ #
    payload = {
        "schema_version": "3.0-live-phase4",
        "project_id": project_id,
        "generated_from": "measurement_facts_and_project_graph_nodes",
        "data_provenance": {
            "engine_verified_source": "persisted calculation receipts only; never inferred from MeasurementFacts",
            "candidate_source": "project_graph_nodes plus canonical project_graph_evidence",
            "no_hardcoded_blueprints": True,
            "no_fake_receipts": True,
        },
        "summary": {
            "total_candidates": len(items),
            "engine_verified_count": engine_verified,
            "measurement_verified_count": measurement_verified,
            "needs_review_count": needs_review,
            "blocked_missing_evidence_count": blocked,
            "not_applicable_count": not_applicable,
            "by_domain": domain_counts,
        },
        "reconciliation": {
            "source_nodes": source_node_count,
            "source_measurement_facts": len(verified_rows),
            "merged_candidates": merged_candidates,
            "duplicates": duplicates,
            "rejected_not_work_item": rejected_not_work_item,
            "needs_review": needs_review,
            "blocked_missing_evidence": blocked,
            "measurement_verified": measurement_verified,
            "engine_verified": engine_verified,
            "reconciled": source_node_count == merged_candidates + rejected_not_work_item + len(duplicates),
        },
        "items": items,
    }

    conn.close()
    return payload
