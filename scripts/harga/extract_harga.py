# -*- coding: utf-8 -*-
"""
PAAX - Extractor daftar harga bahan dan upah ke price book engine.

Kode masuk repo; hasil JSON price book dan audit ditulis ke PAAX_DATA_DIR
di luar repo (default: G:\\paax-data).
"""
from __future__ import annotations

import argparse
import ast
import json
import operator
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet


SOURCE_DEFAULT = r"G:\AHSP\Daftar harga bahan dan upah.xlsx"
DATA_DEFAULT = r"G:\paax-data"
CATALOG_REL = r"harga-satuan\_resources_catalog.json"


@dataclass(frozen=True)
class HargaRow:
    source_name: str
    unit: str
    price: float
    category: str
    row_number: int


_UNIT_MAP = {
    "bh": "buah",
    "buah": "buah",
    "btg": "batang",
    "batang": "batang",
    "lbr": "lembar",
    "lembar": "lembar",
    "ltr": "liter",
    "liter": "liter",
    "kg": "kg",
    "m": "m",
    "m'": "m",
    "m\u0142": "m3",
    "m\u2019": "m",
    "m2": "m2",
    "m\u00b2": "m2",
    "m3": "m3",
    "m\u00b3": "m3",
    "oh": "OH",
    "oj": "OJ",
}

_WORD_ALIASES = {
    "portland cement": "semen portland",
    "cement": "semen",
    "begisting": "bekisting",
    "sealent": "sealant",
    "stainles": "stainless",
    "plafond": "plafon",
}

_STOP_NAME_TOKENS = {"pc", "sp", "uk"}
_SAFE_EXTRA_TOKENS = {
    "biasa",
    "kerikil",
    "lokasi",
    "pekerjaan",
    "pelitur",
    "polos",
    "quarry",
    "ulir",
}

_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _as_number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        text = text.replace("Rp", "").replace("rp", "").replace(" ", "")
        if "," in text and "." in text:
            text = text.replace(".", "").replace(",", ".")
        elif "," in text:
            text = text.replace(",", ".")
        try:
            return float(text)
        except ValueError:
            return None
    return None


def _clean_number(value: float) -> float | int:
    return int(value) if abs(value - int(value)) < 1e-9 else round(value, 6)


def _eval_ast(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval_ast(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return float(_OPS[type(node.op)](_eval_ast(node.operand)))
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return float(_OPS[type(node.op)](_eval_ast(node.left), _eval_ast(node.right)))
    raise ValueError("Formula harga hanya boleh berisi angka, referensi sel, dan operator + - * /.")


def resolve_formula_value(ws: Worksheet, cell_ref: str, _seen: set[str] | None = None) -> float | int:
    """Resolve nilai angka atau formula sederhana seperti =F12+10000."""
    coord = cell_ref.upper()
    seen = _seen or set()
    if coord in seen:
        raise ValueError(f"Referensi formula melingkar di {coord}")
    seen.add(coord)

    value = ws[coord].value
    number = _as_number(value)
    if number is not None:
        return _clean_number(number)

    if not isinstance(value, str) or not value.strip().startswith("="):
        raise ValueError(f"Sel {coord} tidak berisi angka/formula harga: {value!r}")

    expr = value.strip()[1:]

    def replace_cell(match: re.Match[str]) -> str:
        nested = resolve_formula_value(ws, match.group(0), seen)
        return str(nested)

    expanded = re.sub(r"\b[A-Z]{1,3}\d+\b", replace_cell, expr.upper())
    if re.search(r"[^0-9+\-*/(). ]", expanded):
        raise ValueError(f"Formula tidak didukung di {coord}: {value!r}")
    result = _eval_ast(ast.parse(expanded, mode="eval"))
    return _clean_number(result)


def normalize_unit(unit: str | None) -> str:
    if not unit:
        return ""
    raw = str(unit).strip().replace(" ", "")
    raw = raw.replace("\u2032", "'").replace("\u2018", "'").replace("\u2019", "'")
    lowered = raw.lower()
    return _UNIT_MAP.get(lowered, raw)


def normalize_name(text: str | None) -> str:
    if not text:
        return ""
    value = unicodedata.normalize("NFKD", str(text).lower())
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.replace("\u00f8", " diameter ").replace("\u03c6", " diameter ")
    value = value.replace("(", " ").replace(")", " ")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    value = re.sub(r"\b\d+(?:\s*x\s*\d+)+(?:\s*x\s*\d+)?\b", " ", value)
    value = re.sub(r"\b\d+\b", " ", value)
    value = re.sub(r"\b(cm|mm|m|kg|bh|buah|btg|batang|liter|lembar|oh|oj)\b", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    for src, dst in _WORD_ALIASES.items():
        value = re.sub(rf"\b{re.escape(src)}\b", dst, value)
    for token in _STOP_NAME_TOKENS:
        value = re.sub(rf"\b{re.escape(token)}\b", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _number_signature(text: str | None) -> set[str]:
    if not text:
        return set()
    value = unicodedata.normalize("NFKD", str(text).lower()).replace(",", ".")
    k_marks = {f"k{match}" for match in re.findall(r"\bk\s*[-=]?\s*(\d{2,4})\b", value)}
    numbers = set(re.findall(r"\d+(?:\.\d+)?", value))
    return k_marks | numbers


def _numbers_compatible(source_name: str, resource_name: str) -> bool:
    source_numbers = _number_signature(source_name)
    resource_numbers = _number_signature(resource_name)
    return not source_numbers or not resource_numbers or source_numbers == resource_numbers


def parse_harga_sheet(ws: Worksheet) -> List[HargaRow]:
    rows: List[HargaRow] = []
    category: str | None = None
    for row in range(1, ws.max_row + 1):
        name_cell = ws.cell(row=row, column=2).value
        name = str(name_cell).strip() if name_cell is not None else ""
        marker = normalize_name(name)
        if marker == "upah":
            category = "upah"
            continue
        if marker == "bahan":
            category = "bahan"
            continue
        if category is None or not name:
            continue
        if marker in {"no", "uraian pekerja", "satuan", "harga"}:
            continue
        unit = normalize_unit(ws.cell(row=row, column=5).value)
        try:
            price = resolve_formula_value(ws, f"F{row}")
        except ValueError:
            continue
        price_num = _as_number(price)
        if price_num is None or price_num <= 0:
            continue
        rows.append(HargaRow(
            source_name=name,
            unit=unit,
            price=_clean_number(price_num),
            category=category,
            row_number=row,
        ))
    return rows


def load_price_rows(source_xlsx: Path) -> List[HargaRow]:
    wb = load_workbook(source_xlsx, data_only=False)
    try:
        ws = wb["Lembar1"] if "Lembar1" in wb.sheetnames else wb.active
        return parse_harga_sheet(ws)
    finally:
        wb.close()


def load_catalog(catalog_path: Path) -> List[Dict[str, Any]]:
    raw = json.loads(catalog_path.read_text(encoding="utf-8"))
    return list(raw.get("resources", []))


def _candidate_score(source: HargaRow, resource: Dict[str, Any]) -> tuple[int, float]:
    if source.category != resource.get("category"):
        return 0, 0.0
    source_unit = normalize_unit(source.unit)
    resource_unit = normalize_unit(resource.get("unit", ""))
    if source_unit and resource_unit and source_unit != resource_unit:
        return 0, 0.0
    if not _numbers_compatible(source.source_name, str(resource.get("name", ""))):
        return 0, 0.0

    s_name = normalize_name(source.source_name)
    r_name = normalize_name(resource.get("name", ""))
    if not s_name or not r_name:
        return 0, 0.0
    if s_name == r_name:
        return 3, 1.0

    s_tokens = set(s_name.split())
    r_tokens = set(r_name.split())
    if s_tokens and s_tokens <= r_tokens and r_tokens - s_tokens <= _SAFE_EXTRA_TOKENS:
        return 2, len(s_tokens) / len(r_tokens)
    if r_tokens and r_tokens <= s_tokens and s_tokens - r_tokens <= _SAFE_EXTRA_TOKENS:
        return 2, len(r_tokens) / len(s_tokens)

    overlap = len(s_tokens & r_tokens)
    union = len(s_tokens | r_tokens) or 1
    score = overlap / union
    return (1, score) if score >= 0.92 and overlap >= 3 else (0, score)


def _match_one(source: HargaRow, catalog: List[Dict[str, Any]]) -> tuple[str, List[Dict[str, Any]], float]:
    scored = []
    for resource in catalog:
        tier, score = _candidate_score(source, resource)
        if tier:
            scored.append((tier, score, resource))
    if not scored:
        return "unmatched", [], 0.0
    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    best_tier, best_score, best_resource = scored[0]
    tied = [
        r for tier, score, r in scored
        if tier == best_tier and abs(score - best_score) < 1e-9
    ]
    unique_codes = {r.get("code") for r in tied}
    if len(unique_codes) > 1:
        return "ambiguous", tied, best_score
    return "matched", [best_resource], best_score


def match_price_rows(
    rows: Iterable[HargaRow],
    catalog: List[Dict[str, Any]],
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    matched: List[Dict[str, Any]] = []
    unmatched: List[Dict[str, Any]] = []
    ambiguous: List[Dict[str, Any]] = []
    for source in rows:
        status, candidates, score = _match_one(source, catalog)
        base = {
            "source_name": source.source_name,
            "source_unit": source.unit,
            "source_category": source.category,
            "source_price": source.price,
            "source_row": source.row_number,
            "normalized_name": normalize_name(source.source_name),
            "match_score": round(score, 4),
        }
        if status == "matched":
            resource = candidates[0]
            matched.append({
                **base,
                "code": resource["code"],
                "name": resource["name"],
                "category": resource["category"],
                "unit": resource["unit"],
                "price": source.price,
            })
        elif status == "ambiguous":
            ambiguous.append({
                **base,
                "candidates": [
                    {
                        "code": r.get("code"),
                        "name": r.get("name"),
                        "category": r.get("category"),
                        "unit": r.get("unit"),
                    }
                    for r in candidates
                ],
            })
        else:
            unmatched.append(base)
    return matched, unmatched, ambiguous


def build_price_book(
    matched: Iterable[Dict[str, Any]],
    region: str,
    region_code: str,
    source_file: str,
    effective_date: str = "2026-06-28",
) -> Dict[str, Any]:
    by_code: Dict[str, Dict[str, Any]] = {}
    for row in matched:
        by_code.setdefault(row["code"], {
            "code": row["code"],
            "name": row["name"],
            "category": row["category"],
            "unit": row["unit"],
            "price": row["price"],
        })
    return {
        "region": region,
        "region_code": region_code,
        "currency": "IDR",
        "source": f"Daftar harga bahan dan upah: {source_file}",
        "effective_date": effective_date,
        "resources": list(by_code.values()),
    }


def build_audit(
    rows: List[HargaRow],
    matched: List[Dict[str, Any]],
    unmatched: List[Dict[str, Any]],
    ambiguous: List[Dict[str, Any]],
    catalog: List[Dict[str, Any]],
    region_code: str,
    source_file: str,
) -> Dict[str, Any]:
    matched_codes = {row["code"] for row in matched}
    return {
        "region_code": region_code,
        "source_file": source_file,
        "policy": (
            "Match otomatis memakai category+unit, nama ternormalisasi exact/alias, "
            "lalu token-subset/Jaccard ketat. Kandidat kode ganda masuk review manual."
        ),
        "stats": {
            "source_rows": len(rows),
            "matched_rows": len(matched),
            "unique_matched_resources": len(matched_codes),
            "unmatched_rows": len(unmatched),
            "ambiguous_rows": len(ambiguous),
            "catalog_resources": len(catalog),
            "catalog_coverage_pct": round(len(matched_codes) / len(catalog) * 100, 4) if catalog else 0,
        },
        "matched": matched,
        "unmatched": unmatched,
        "ambiguous": ambiguous,
    }


def write_outputs(
    price_book: Dict[str, Any],
    audit: Dict[str, Any],
    out_dir: Path,
    region_code: str,
) -> tuple[Path, Path]:
    harga_dir = out_dir / "harga-satuan"
    audit_dir = out_dir / "_audit"
    harga_dir.mkdir(parents=True, exist_ok=True)
    audit_dir.mkdir(parents=True, exist_ok=True)

    price_path = harga_dir / f"{region_code}.json"
    audit_path = audit_dir / f"harga_{region_code}.json"
    price_path.write_text(json.dumps(price_book, ensure_ascii=False, indent=2), encoding="utf-8")
    audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    return price_path, audit_path


def run_extract(
    source_xlsx: Path,
    catalog_path: Path,
    out_dir: Path,
    region: str,
    region_code: str,
    effective_date: str,
) -> tuple[Path, Path, Dict[str, Any]]:
    rows = load_price_rows(source_xlsx)
    catalog = load_catalog(catalog_path)
    matched, unmatched, ambiguous = match_price_rows(rows, catalog)
    price_book = build_price_book(matched, region, region_code, str(source_xlsx), effective_date)
    audit = build_audit(rows, matched, unmatched, ambiguous, catalog, region_code, str(source_xlsx))
    price_path, audit_path = write_outputs(price_book, audit, out_dir, region_code)
    return price_path, audit_path, audit


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=SOURCE_DEFAULT)
    ap.add_argument("--catalog", default=str(Path(DATA_DEFAULT) / CATALOG_REL))
    ap.add_argument("--out", default=DATA_DEFAULT)
    ap.add_argument("--region", default="Semarang")
    ap.add_argument("--region-code", default="semarang")
    ap.add_argument("--effective-date", default="2026-06-28")
    args = ap.parse_args()

    price_path, audit_path, audit = run_extract(
        source_xlsx=Path(args.src),
        catalog_path=Path(args.catalog),
        out_dir=Path(args.out),
        region=args.region,
        region_code=args.region_code,
        effective_date=args.effective_date,
    )
    stats = audit["stats"]
    print("=== RINGKASAN HARGA ===")
    print(f"Source rows       : {stats['source_rows']}")
    print(f"Matched rows      : {stats['matched_rows']}")
    print(f"Unique resources  : {stats['unique_matched_resources']}")
    print(f"Unmatched rows    : {stats['unmatched_rows']}")
    print(f"Ambiguous rows    : {stats['ambiguous_rows']}")
    print(f"Price book        : {price_path}")
    print(f"Audit             : {audit_path}")


if __name__ == "__main__":
    main()
