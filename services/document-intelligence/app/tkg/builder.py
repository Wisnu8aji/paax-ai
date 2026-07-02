from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel


class TkgBuildResult(BaseModel):
    tkg_json: dict[str, Any]
    tkg_txt: str
    validation_issues: list[dict[str, Any]] = []
    metrics: dict[str, Any] = {}


def _span(label: str, a: str, b: str, nilai: float) -> dict[str, Any]:
    return {"sumbu": label, "dari": a, "ke": b, "nilai": nilai, "unit": "mm"}


def _render(doc: dict[str, Any]) -> str:
    sheet = doc["sheets"][0]
    lines: list[str] = []
    for i, sp in enumerate(sheet["grid"]["bentang"], 1):
        lines.append(f"[{sheet['sheet_id']}-GRID-X{i:02d}] BENTANG | {sp['nilai']:g} | mm | as {sp['dari']}->{sp['ke']}")
    for i, lv in enumerate(sheet["levels"], 1):
        lines.append(f"[{sheet['sheet_id']}-LVL-{i:02d}] LEVEL | {lv['label']} | m | raw=\"{lv['raw']}\"")
    for table in sheet["tables"]:
        for rec in table["records"]:
            lines.append(
                f"[{sheet['sheet_id']}-TBL-{rec['kode']}] RECORD | {rec['kode']} | "
                f"dim={rec['dimensi'].get('b')}x{rec['dimensi'].get('h')} mm; tul={rec['tulangan'][0]['raw']}"
            )
    for i, el in enumerate(sheet["elements"], 1):
        lines.append(f"[{sheet['sheet_id']}-EL-{i:03d}] ELEMEN | {el['kode']} | {el['grid_pos']}")
    return "\n".join(lines)


def build_tkg_from_text(project_id: str, revision_id: str, sheet_id: str, title: str, raw_text: str) -> TkgBuildResult:
    spans: list[dict[str, Any]] = []
    totals: list[dict[str, Any]] = []
    levels: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    elements: list[dict[str, Any]] = []
    unclassified: list[str] = []

    for line in [ln.strip() for ln in raw_text.splitlines() if ln.strip()]:
        if line.startswith("GRID X:"):
            span_part = line.split("TOTAL", 1)[0]
            for a, b, val in re.findall(r"([A-Z]+)-([A-Z]+)=(\d+(?:\.\d+)?)", span_part):
                spans.append(_span("x", a, b, float(val)))
            total = re.search(r"TOTAL\s+([A-Z]+)-([A-Z]+)=(\d+(?:\.\d+)?)", line)
            if total:
                totals.append({"sumbu": "x", "dari": total.group(1), "ke": total.group(2), "nilai": float(total.group(3)), "unit": "mm"})
            continue
        level = re.match(r"LEVEL:\s*(.+?)\s+([+-]?\d+(?:\.\d+)?)", line)
        if level:
            levels.append({"label": level.group(1), "nilai_m": float(level.group(2)), "raw": line})
            continue
        table = re.match(r"TABLE\s+(\w+):\s*(\w+);\s*dim=(\d+)x(\d+);\s*tul=([^;]+);\s*sengkang=(.+)", line)
        if table:
            records.append({
                "kode": table.group(2),
                "kategori": "kolom",
                "dimensi": {"b": float(table.group(3)), "h": float(table.group(4))},
                "tulangan": [{"raw": table.group(5), "posisi": "utama"}, {"raw": table.group(6), "posisi": "sengkang"}],
            })
            continue
        element = re.match(r"ELEMENT:\s*(\w+)\s+at\s+(.+)", line)
        if element:
            elements.append({"kode": element.group(1), "grid_pos": element.group(2), "count": 1})
            continue
        unclassified.append(line)

    valid = bool(totals) and abs(sum(sp["nilai"] for sp in spans) - totals[0]["nilai"]) < 1e-6
    issues = [] if valid else [{"code": "E-GRID", "message": "Jumlah bentang grid tidak sama dengan total."}]
    doc = {
        "prj_id": project_id,
        "rev_id": revision_id,
        "sheets": [{
            "sheet_id": sheet_id,
            "judul": title,
            "grid": {"bentang": spans, "total": totals, "valid": valid},
            "levels": levels,
            "tables": [{"judul": "schedule", "records": records}] if records else [],
            "elements": elements,
            "unclassified": [{"raw": x} for x in unclassified],
        }],
    }
    metrics = {"raw_lines": len([ln for ln in raw_text.splitlines() if ln.strip()]), "unclassified": len(unclassified)}
    return TkgBuildResult(tkg_json=doc, tkg_txt=_render(doc), validation_issues=issues, metrics=metrics)
