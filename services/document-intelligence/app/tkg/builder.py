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


# Peta klasifikasi heuristik (DrawingClassifier, huruf besar) -> enum
# SheetJenisEnum di packages/schemas (TkgSheetSchema.jenis). MEP/UNCLASSIFIED
# tidak punya padanan langsung -> "campuran" (bucket sah menurut brain-00 §3:
# "Sheet campuran: jalankan per zona"), bukan tebakan asal.
_JENIS_MAP: dict[str, str] = {
    "DENAH": "denah",
    "POTONGAN": "potongan",
    "TAMPAK": "tampak",
    "SCHEDULE": "tabel",
    "DETAIL": "detail",
    "NOTES": "notes",
    "MEP": "campuran",
    "UNCLASSIFIED": "campuran",
}


def classification_to_jenis(classification: str) -> str:
    return _JENIS_MAP.get(classification.upper(), "campuran")


def _span(a: str, b: str, nilai: float, raw: str) -> dict[str, Any]:
    return {"dari": a, "ke": b, "nilai": nilai, "unit": "mm", "raw": raw}


def _render(doc: dict[str, Any]) -> str:
    sheet = doc["sheets"][0]
    grid = sheet["grid"] or {}
    lines: list[str] = []
    for i, sp in enumerate(grid.get("bentang_x", []), 1):
        lines.append(f"[{sheet['sheet_id']}-GRID-X{i:02d}] BENTANG | {sp['nilai']:g} | mm | as {sp['dari']}->{sp['ke']}")
    for i, sp in enumerate(grid.get("bentang_y", []), 1):
        lines.append(f"[{sheet['sheet_id']}-GRID-Y{i:02d}] BENTANG | {sp['nilai']:g} | mm | as {sp['dari']}->{sp['ke']}")
    for i, lv in enumerate(sheet["levels"], 1):
        lines.append(f"[{sheet['sheet_id']}-LVL-{i:02d}] LEVEL | {lv['label_raw']} | m | raw=\"{lv['label_raw']}\"")
    for table in sheet["tables"]:
        for rec in table["records"]:
            tul = rec["tulangan"][0]["raw"] if rec["tulangan"] else "-"
            lines.append(
                f"[{sheet['sheet_id']}-TBL-{rec['kode']}] RECORD | {rec['kode']} | "
                f"dim={rec['dimensi'].get('b')}x{rec['dimensi'].get('h')} mm; tul={tul}"
            )
    for i, el in enumerate(sheet["elements"], 1):
        lines.append(f"[{sheet['sheet_id']}-EL-{i:03d}] ELEMEN | {el['kode']} | {el['alamat']}")
    return "\n".join(lines)


def build_tkg_from_text(
    project_id: str,
    revision_id: str,
    sheet_id: str,
    title: str,
    raw_text: str,
    jenis: str = "campuran",
) -> TkgBuildResult:
    """
    Parser SK-07 (MVP): regex per baris notasi terstruktur sederhana
    ("GRID X: ...", "GRID Y: ...", "LEVEL: ...", "TABLE ...", "ELEMENT: ...").

    CATATAN JUJUR (bukan brain-00 §2 penuh): ini BUKAN grammar notasi gambar
    struktur Indonesia lengkap (leksikon prefiks, merge-run fragmen PDF,
    rekonstruksi grid/tabel dari geometri) — itu pekerjaan terpisah yang
    lebih besar. Baris yang tidak cocok pola di atas masuk apa adanya ke
    `unclassified` (INV-TKG-02 zero-loss), TIDAK ditebak/dibuang (AP-E-02/04).
    Output SUDAH selaras skema `TkgDocumentSchema` (Zod) — lihat
    `packages/schemas/src/index.ts` — supaya bisa langsung dipakai
    `validateTkg`/`renderTkg`/`takeoffTkg` di core-engine tanpa adaptasi lagi.
    """
    spans_x: list[dict[str, Any]] = []
    spans_y: list[dict[str, Any]] = []
    totals_x: list[dict[str, Any]] = []
    totals_y: list[dict[str, Any]] = []
    levels: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    elements: list[dict[str, Any]] = []
    unclassified: list[str] = []

    grid_line_re = re.compile(r"^GRID\s+([XY]):\s*(.+)$", re.IGNORECASE)
    span_re = re.compile(r"([A-Za-z0-9]+)-([A-Za-z0-9]+)\s*=\s*(\d+(?:\.\d+)?)")
    total_re = re.compile(r"TOTAL\s+([A-Za-z0-9]+)-([A-Za-z0-9]+)\s*=\s*(\d+(?:\.\d+)?)", re.IGNORECASE)
    level_re = re.compile(r"^LEVEL:\s*(.+?)\s+([+-]?\d+(?:\.\d+)?)\s*$", re.IGNORECASE)
    table_re = re.compile(
        r"^TABLE\s+(\w+):\s*(\w+);\s*dim=(\d+)x(\d+);\s*tul=([^;]+);\s*sengkang=(.+)$",
        re.IGNORECASE,
    )
    element_re = re.compile(r"^ELEMENT:\s*(\w+)\s+at\s+(.+)$", re.IGNORECASE)

    for line in [ln.strip() for ln in raw_text.splitlines() if ln.strip()]:
        grid_match = grid_line_re.match(line)
        if grid_match:
            axis = grid_match.group(1).upper()
            body = grid_match.group(2)
            span_part = re.split(r"TOTAL", body, maxsplit=1, flags=re.IGNORECASE)[0]
            found_spans = [
                _span(a, b, float(val), f"{a}-{b}={val}")
                for a, b, val in span_re.findall(span_part)
            ]
            total_match = total_re.search(body)
            if axis == "X":
                spans_x.extend(found_spans)
                if total_match:
                    a, b, val = total_match.groups()
                    totals_x.append(_span(a, b, float(val), f"TOTAL {a}-{b}={val}"))
            else:
                spans_y.extend(found_spans)
                if total_match:
                    a, b, val = total_match.groups()
                    totals_y.append(_span(a, b, float(val), f"TOTAL {a}-{b}={val}"))
            continue

        level_match = level_re.match(line)
        if level_match:
            levels.append({"label_raw": line, "nilai_m": float(level_match.group(2)), "lantai": None})
            continue

        table_match = table_re.match(line)
        if table_match:
            records.append({
                "kode": table_match.group(2),
                "kategori": "kolom",
                "dimensi": {"b": float(table_match.group(3)), "h": float(table_match.group(4))},
                "satuan_dimensi": "mm",
                "tulangan": [
                    {"raw": table_match.group(5), "posisi": "tul_utama", "jenis": "D"},
                    {"raw": table_match.group(6), "posisi": "sengkang", "jenis": "D"},
                ],
            })
            continue

        element_match = element_re.match(line)
        if element_match:
            elements.append({
                "kode": element_match.group(1),
                "alamat": element_match.group(2),
                "bentuk": "titik",
                "n": 1,
            })
            continue

        unclassified.append(line)

    def _axis_valid(spans: list[dict[str, Any]], totals: list[dict[str, Any]]) -> tuple[bool, str | None]:
        if not totals:
            return True, None  # tidak ada total ditulis -> tidak ada yang divalidasi (bukan error)
        total_nilai = totals[0]["nilai"]
        span_sum = sum(sp["nilai"] for sp in spans)
        if abs(span_sum - total_nilai) < 1e-6:
            return True, None
        return False, "Jumlah bentang grid tidak sama dengan total."

    valid_x, issue_x = _axis_valid(spans_x, totals_x)
    valid_y, issue_y = _axis_valid(spans_y, totals_y)
    valid = valid_x and valid_y
    issues = []
    if issue_x:
        issues.append({"code": "E-GRID", "message": f"{issue_x} (sumbu X)"})
    if issue_y:
        issues.append({"code": "E-GRID", "message": f"{issue_y} (sumbu Y)"})

    doc = {
        "prj_id": project_id,
        "rev_id": revision_id,
        "generated_by": "document_intelligence_pdf",
        "locale": "id-ID",
        "satuan_default": "mm",
        "sheets": [{
            "sheet_id": sheet_id,
            "jenis": jenis,
            "meta": {"judul": title},
            "grid": {
                "sumbu_x": [],
                "sumbu_y": [],
                "bentang_x": spans_x,
                "bentang_y": spans_y,
                "total_x": totals_x[0] if totals_x else None,
                "total_y": totals_y[0] if totals_y else None,
                "offset_tepi": [],
            },
            "levels": levels,
            "tables": [{"judul": "schedule", "records": records}] if records else [],
            "elements": elements,
            "dimensions": [],
            "notes": [],
            "unclassified": [{"raw": x, "alasan": "tidak cocok pola grammar SK-07 (MVP)"} for x in unclassified],
        }],
    }
    metrics = {
        "raw_lines": len([ln for ln in raw_text.splitlines() if ln.strip()]),
        "unclassified": len(unclassified),
    }
    return TkgBuildResult(tkg_json=doc, tkg_txt=_render(doc), validation_issues=issues, metrics=metrics)
