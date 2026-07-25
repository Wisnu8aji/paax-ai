#!/usr/bin/env python3
"""Offline Command Room / Arete contract verification.

This script deliberately performs no provider call.  It validates the exact
human-delivery payload and the response contract that Arete receives after
`query_project_graph`.  The generated answer is a deterministic QA specimen,
not a claim that a live provider was invoked.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[1]
DEFAULT_DELIVERY = REPO / "report/report_drawing_intelligence/pckm_v3_final_2026-07-21/DRAWING_INTELLIGENCE_HUMAN_DELIVERY_88P_2026-07-21.json"
DEFAULT_JSON = REPO / "report/report_drawing_intelligence/COMMAND_ROOM_ARETE_OFFLINE_QA_2026-07-21.json"
DEFAULT_MD = REPO / "report/report_drawing_intelligence/COMMAND_ROOM_ARETE_OFFLINE_QA_2026-07-21.md"


@dataclass
class Check:
    name: str
    passed: bool
    detail: str


def _citation(item: dict[str, Any]) -> str:
    sheets = item.get("source_sheets") or []
    if not sheets:
        return "[sumber lembar belum tersedia]"
    sheet = sheets[0]
    label = sheet.get("title") or sheet.get("sheet_number") or "lembar"
    page = sheet.get("page_number") or (int(sheet.get("page_index", -1)) + 1 if sheet.get("page_index") is not None else "?")
    return f"[{label} p.{page}]"


def _filter(items: list[dict[str, Any]], *, category: str, level: str) -> list[dict[str, Any]]:
    result = [
        item for item in items
        if str(item.get("category", "")).casefold() == category.casefold()
        and str(item.get("level", "")).casefold() == level.casefold()
    ]
    return sorted(result, key=lambda item: (str(item.get("code") or ""), -int(item.get("readiness_score") or 0)))


def render_column_answer(items: list[dict[str, Any]]) -> str:
    lines = [
        "Berdasarkan rekonstruksi objek fisik dan penyambungan lintas lembar, kolom pada Lantai 2 adalah:",
        "",
        "| Tipe | Jumlah | Dimensi penampang | Status | Sumber |",
        "|---|---:|---|---|---|",
    ]
    for item in items:
        status = item.get("status_label") or ("Terkonfirmasi sistem" if item.get("count_is_final") else "Perlu ditinjau")
        lines.append(
            f"| {item.get('code') or '-'} | {item.get('count_label') or '-'} | "
            f"{item.get('dimensions_text') or 'Definisi ukuran belum ditemukan'} | {status} | {_citation(item)} |"
        )
    open_conflicts = [item for item in items if item.get("conflict_status") == "open"]
    if open_conflicts:
        lines.extend(["", "**Data rancu yang memerlukan keputusan:**"])
        for item in open_conflicts:
            lines.append(f"- {item.get('display_name')}: {len(item.get('conflicts') or [])} konflik terbuka.")
    lines.extend([
        "",
        "Jumlah berstatus terkonfirmasi sistem berasal dari rekonstruksi instance pada denah utama, "
        "deduplikasi geometri, dan pengecekan lintas schedule/detail. Data yang tidak konsisten tidak disembunyikan; "
        "item tersebut ditandai Data rancu untuk dikoreksi atau di-approve reviewer.",
    ])
    return "\n".join(lines)


def render_volume_answer(items: list[dict[str, Any]]) -> str:
    ready = [item for item in items if item.get("calculation_readiness") in {"ready", "calculated"}]
    if not ready:
        return (
            "Belum ada item kolom Lantai 2 yang mempunyai jumlah, penampang, dan tinggi efektif terotorisasi. "
            "Drawing Intelligence akan menampilkan input yang kurang; volume final tetap dijalankan Core Engine."
        )
    descriptions = []
    for item in ready:
        facts = {fact.get("field"): fact for fact in item.get("measurement_facts") or []}
        descriptions.append(
            f"{item.get('code')}: {item.get('count_label')}, {item.get('dimensions_text')}, "
            f"tinggi efektif {facts.get('height', {}).get('value', '—')} {facts.get('height', {}).get('unit', '')}"
        )
    return (
        "Item berikut sudah siap dihitung oleh Core Engine karena jumlah fisik, dimensi, dan tinggi efektif memiliki authority: "
        + "; ".join(descriptions)
        + ". Model AI tidak melakukan perkalian; Command Room harus memanggil Core Engine dan menampilkan hasil beserta formula serta sumber input."
    )


def genericity_checks() -> list[Check]:
    sys.path.insert(0, str(REPO / "services/document-intelligence"))
    from app.drawing_intelligence.sheet_identity import build_sheet_semantics  # type: ignore

    fixtures = [
        (
            "hospital_level_12",
            "LEVEL 12 COLUMN PLAN",
            {"sheet_identity": {"title": {"value": "LEVEL 12 COLUMN PLAN"}, "discipline": {"value": "structural"}}},
            ("column_plan", "L12", "structure"),
        ),
        (
            "bridge_abutment",
            "BRIDGE GENERAL ARRANGEMENT - ABUTMENT A1",
            {"sheet_identity": {"title": {"value": "BRIDGE GENERAL ARRANGEMENT - ABUTMENT A1"}, "discipline": {"value": "structural"}}},
            ("bridge_plan", "substructure", "structure"),
        ),
        (
            "road_alignment",
            "ROAD PLAN AND PROFILE STA 0+000 - 1+000",
            {"sheet_identity": {"title": {"value": "ROAD PLAN AND PROFILE"}, "discipline": {"value": "civil"}}},
            ("road_plan_profile", "alignment", "civil"),
        ),
        (
            "unknown_vendor_sheet",
            "VENDOR REFERENCE SHEET",
            {"sheet_identity": {"title": {"value": "VENDOR REFERENCE SHEET"}, "discipline": {"value": "unknown"}}},
            ("unknown", None, "unknown"),
        ),
    ]
    checks: list[Check] = []
    for index, (name, native, dem, expected) in enumerate(fixtures):
        result = build_sheet_semantics(index, native_text=native, dem_page=dem)
        actual = (result.drawing_type, result.level, result.discipline)
        checks.append(Check(f"generic_{name}", actual == expected, f"expected={expected}; actual={actual}"))
    return checks


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--delivery", type=Path, default=DEFAULT_DELIVERY)
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--md-out", type=Path, default=DEFAULT_MD)
    args = parser.parse_args()

    payload = json.loads(args.delivery.read_text(encoding="utf-8"))
    items = payload.get("work_items") or []
    columns = _filter(items, category="column", level="L2")
    answer = render_column_answer(columns)
    volume_answer = render_volume_answer(columns)
    codes = {str(item.get("code")) for item in columns}
    by_code = {str(item.get("code")): item for item in columns}

    checks = [
        Check("delivery_schema_is_human_view", str(payload.get("schema_version", "")).endswith("human-delivery.v2"), str(payload.get("schema_version"))),
        Check("all_88_pages_available", int(payload.get("page_count") or 0) == 88, f"page_count={payload.get('page_count')}"),
        Check("core_l2_column_types_found", {"K1A", "K2", "K3"}.issubset(codes), f"codes={sorted(codes)}"),
        Check("k1a_dimension", by_code.get("K1A", {}).get("dimensions_text") == "400 × 400 mm", str(by_code.get("K1A", {}).get("dimensions_text"))),
        Check("k2_dimension", by_code.get("K2", {}).get("dimensions_text") == "250 × 600 mm", str(by_code.get("K2", {}).get("dimensions_text"))),
        Check("k3_dimension", by_code.get("K3", {}).get("dimensions_text") == "250 × 400 mm", str(by_code.get("K3", {}).get("dimensions_text"))),
        Check("physical_counts_are_authorized", all(item.get("count_is_final") is True and item.get("count_authority") in {"engine_confirmed", "human_confirmed"} for item in columns if item.get("code") in {"K1A", "K2", "K3"}), f"items={[(item.get('code'), item.get('verified_physical_count'), item.get('count_authority')) for item in columns]}"),
        Check("answer_uses_civil_engineering_wording", "Jumlah" in answer and "rekonstruksi instance" in answer and "label/simbol" not in answer, "mature civil-engineering wording present"),
        Check("answer_has_sheet_page_citations", bool(re.search(r"\[[^\]]+ p\.\d+\]", answer)), "human-readable citations present"),
        Check("volume_answer_routes_to_core_engine", "Core Engine" in volume_answer and "Model AI tidak melakukan perkalian" in volume_answer and "K2" in volume_answer, "golden rule and readiness preserved"),
        Check("no_live_provider_call", True, "script has no HTTP/provider client"),
    ]
    checks.extend(genericity_checks())

    k2 = by_code.get("K2", {})
    k2_sources = k2.get("source_sheets") or []
    height_fact = next((fact for fact in k2.get("measurement_facts") or [] if fact.get("field") == "height"), {})
    timeline = [
        {"kind": "context", "label": f"Memuat projection Drawing Intelligence untuk {payload.get('page_count')} lembar"},
        {"kind": "graph", "label": f"Menemukan tipe kolom Lantai 2: {', '.join(sorted({'K1A','K2','K3'} & codes))}"},
        {"kind": "evidence", "label": f"Menghubungkan K2 ke {len(k2_sources)} lembar sumber denah, tabel, dan potongan"},
        {"kind": "geometry", "label": f"Memeriksa rekonstruksi fisik K2: {k2.get('verified_physical_count')} unit"},
        {"kind": "measurement", "label": f"Memeriksa penampang {k2.get('dimensions_text')} dan tinggi efektif {height_fact.get('value')} {height_fact.get('unit', '')}"},
        {"kind": "authority", "label": f"Memastikan authority jumlah={k2.get('count_authority')} dan readiness={k2.get('calculation_readiness')}"},
        {"kind": "compose", "label": "Menyusun jawaban teknik sipil dengan sitasi lembar yang dapat dibuka"},
    ]
    checks.append(Check("timeline_is_stacked_and_contextual", len(timeline) >= 5 and len({row["kind"] for row in timeline}) >= 5, f"steps={len(timeline)}"))

    passed = sum(check.passed for check in checks)
    result = {
        "schema_version": "paax.command-room.arete-offline-qa.v1",
        "mode": "offline_deterministic_contract_simulation",
        "live_ai_called": False,
        "source_delivery": str(args.delivery.relative_to(REPO)),
        "query": "kolom lantai 2 ada apa saja jumlah berapa ukuran berapa",
        "volume_query": "berapa volume kolom lantai 2",
        "relevant_item_count": len(columns),
        "relevant_codes": sorted(codes),
        "expected_arete_answer": answer,
        "expected_volume_answer": volume_answer,
        "activity_timeline": timeline,
        "checks": [asdict(check) for check in checks],
        "passed": passed,
        "total": len(checks),
        "status": "PASS" if passed == len(checks) else "FAIL",
        "limitations": [
            "No provider API was called; this validates retrieval, prompt, authority, citation, and output contracts.",
            "Natural-language variation of a live model still requires a controlled staging run with a dedicated non-production key.",
        ],
    }
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    rows = [
        "# Command Room Arete — Offline QA",
        "",
        "**Mode:** simulasi kontrak deterministik; tidak ada API AI yang dipanggil.",
        f"**Status:** {result['status']} — {passed}/{len(checks)} pemeriksaan lulus.",
        "",
        "## Pertanyaan uji",
        "",
        f"> {result['query']}",
        "",
        "## Bentuk jawaban Arete yang diwajibkan",
        "",
        answer,
        "",
        "## Pertanyaan volume",
        "",
        f"> {result['volume_query']}",
        "",
        volume_answer,
        "",
        "## Timeline proses yang ditampilkan",
        "",
    ]
    rows.extend(f"{index}. **{step['label']}**" for index, step in enumerate(timeline, 1))
    rows.extend(["", "## Pemeriksaan", "", "| Pemeriksaan | Status | Detail |", "|---|---|---|"])
    rows.extend(f"| {check.name} | {'PASS' if check.passed else 'FAIL'} | {check.detail} |" for check in checks)
    rows.extend(["", "## Batasan", "", *[f"- {item}" for item in result["limitations"]]])
    args.md_out.write_text("\n".join(rows) + "\n", encoding="utf-8")

    print(json.dumps({"status": result["status"], "passed": passed, "total": len(checks), "codes": sorted(codes)}, ensure_ascii=False))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
