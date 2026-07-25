from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from scripts.harga.extract_harga import (
    _number_signature,
    _numbers_compatible,
    _SAFE_EXTRA_TOKENS,
    load_catalog,
    normalize_name,
    normalize_unit,
    parse_harga_sheet,
)


SOURCE_DEFAULT = Path(r"G:\AHSP\KEJAKSAAN.xlsx")
CATALOG_DEFAULT = Path(r"G:\paax-data\harga-satuan\_resources_catalog.json")
SEMARANG_PRICE_DEFAULT = REPO_ROOT / "data" / "harga-satuan" / "semarang.json"
REPORT_DEFAULT = REPO_ROOT / "report" / "HARGA_KEJAKSAAN_SEMARANG_2026-07-11.md"


@dataclass(frozen=True)
class HargaSourceRow:
    source_name: str
    unit: str
    price: float | int
    category: str
    row_number: int


def _md(value: object, limit: int | None = None) -> str:
    text = re.sub(r"\s+", " ", str(value).replace("\r", " ").replace("\n", " ")).strip()
    if limit is not None and len(text) > limit:
        text = text[: limit - 3].rstrip() + "..."
    return text.replace("|", "\\|")


def _report_name(value: object) -> str:
    text = normalize_name(str(value))
    text = re.sub(r"\bbesi\b", "baja", text)
    text = text.replace("seal tape", "sealtape")
    return re.sub(r"\s+", " ", text).strip()


def _same_category_unit(source: HargaSourceRow, resource: dict[str, Any]) -> bool:
    if source.category != resource.get("category"):
        return False
    source_unit = normalize_unit(source.unit)
    resource_unit = normalize_unit(str(resource.get("unit", "")))
    return bool(source_unit and resource_unit and source_unit == resource_unit)


def _token_score(source_name: str, resource_name: str) -> tuple[int, float]:
    source_tokens = set(_report_name(source_name).split())
    resource_tokens = set(_report_name(resource_name).split())
    overlap = len(source_tokens & resource_tokens)
    union = len(source_tokens | resource_tokens) or 1
    return overlap, overlap / union


def _safe_candidate(source: HargaSourceRow, resource: dict[str, Any]) -> tuple[int, float, str] | None:
    if not _same_category_unit(source, resource):
        return None
    if not _numbers_compatible(source.source_name, str(resource.get("name", ""))):
        return None

    source_name = _report_name(source.source_name)
    resource_name = _report_name(resource.get("name", ""))
    if not source_name or not resource_name:
        return None
    if source_name == resource_name:
        return 3, 1.0, "nama/kategori/unit cocok setelah normalisasi"

    source_tokens = set(source_name.split())
    resource_tokens = set(resource_name.split())
    if source_tokens and source_tokens <= resource_tokens and resource_tokens - source_tokens <= _SAFE_EXTRA_TOKENS:
        return 2, len(source_tokens) / len(resource_tokens), "source adalah subset aman dari nama katalog"
    if resource_tokens and resource_tokens <= source_tokens and source_tokens - resource_tokens <= _SAFE_EXTRA_TOKENS:
        return 2, len(resource_tokens) / len(source_tokens), "nama katalog adalah subset aman dari source"

    overlap, score = _token_score(source.source_name, str(resource.get("name", "")))
    if score >= 0.92 and overlap >= 3:
        return 1, score, "kemiripan token sangat tinggi"
    return None


def _resource_summary(resource: dict[str, Any]) -> dict[str, Any]:
    return {
        "code": str(resource.get("code", "")),
        "name": str(resource.get("name", "")),
        "category": str(resource.get("category", "")),
        "unit": str(resource.get("unit", "")),
    }


def _reject_reason(source: HargaSourceRow, resource: dict[str, Any]) -> str:
    reasons: list[str] = []
    if source.category != resource.get("category"):
        reasons.append("kategori beda")
    source_unit = normalize_unit(source.unit)
    resource_unit = normalize_unit(str(resource.get("unit", "")))
    if source_unit and resource_unit and source_unit != resource_unit:
        reasons.append("unit beda")
    if not _numbers_compatible(source.source_name, str(resource.get("name", ""))):
        reasons.append("angka tidak cocok")

    overlap, similarity = _token_score(source.source_name, str(resource.get("name", "")))
    if overlap == 0 or similarity < 0.12:
        reasons.append("nama terlalu jauh")
    if not reasons:
        source_numbers = _number_signature(source.source_name)
        resource_numbers = _number_signature(str(resource.get("name", "")))
        if source_numbers and not resource_numbers:
            reasons.append("nama katalog terlalu umum")
        else:
            reasons.append("tidak cukup kuat untuk dipilih otomatis")
    return ", ".join(reasons)


def nearest_rejected_candidates(
    source: HargaSourceRow,
    catalog: list[dict[str, Any]],
    limit: int = 5,
) -> list[dict[str, Any]]:
    scored: list[tuple[tuple[int, int, int, float, int], dict[str, Any]]] = []
    source_has_numbers = bool(_number_signature(source.source_name))
    for resource in catalog:
        overlap, similarity = _token_score(source.source_name, str(resource.get("name", "")))
        category_score = 1 if source.category == resource.get("category") else 0
        unit_score = 1 if normalize_unit(source.unit) == normalize_unit(str(resource.get("unit", ""))) else 0
        resource_has_numbers = bool(_number_signature(str(resource.get("name", ""))))
        numeric_related = 1 if source_has_numbers and resource_has_numbers else 0
        if overlap == 0 and not (category_score and unit_score):
            continue
        scored.append(((category_score, unit_score, overlap, similarity, numeric_related), resource))

    scored.sort(key=lambda item: item[0], reverse=True)
    top = scored[:limit]

    # Kandidat dengan kemiripan NAMA tertinggi harus selalu ikut tampil, walau unit/
    # kategori tidak cocok -- unit di master catalog kadang berlabel generik/keliru
    # (mis. "unit" padahal seharusnya "buah"), sehingga kandidat paling relevan bisa
    # tersingkir dari top-N gabungan hanya gara-gara field unit yang salah, bukan
    # karena namanya memang jauh (kasus nyata: "Kloset jongkok porselen" vs
    # M.GEN.0450 "Kloset Jongkok").
    best_by_name = max(scored, key=lambda item: (item[0][2], item[0][3]), default=None)
    if best_by_name is not None:
        top_codes = {resource.get("code") for _, resource in top}
        if best_by_name[1].get("code") not in top_codes:
            # Ganti kandidat PALING LEMAH (bukan menambah panjang daftar) supaya
            # potongan tampilan laporan (batas karakter) tidak memangkas kandidat
            # yang justru paling relevan namanya.
            top = [*top[:-1], best_by_name] if top else [best_by_name]

    candidates: list[dict[str, Any]] = []
    for _, resource in top:
        candidates.append({
            **_resource_summary(resource),
            "reject_reason": _reject_reason(source, resource),
        })
    return candidates


def classify_kejaksaan_row(
    source: HargaSourceRow,
    catalog: list[dict[str, Any]],
    near_limit: int = 5,
) -> dict[str, Any]:
    base = {
        "source_row": source.row_number,
        "source_name": source.source_name,
        "source_unit": source.unit,
        "source_category": source.category,
        "source_price": source.price,
        "normalized_name": _report_name(source.source_name),
    }

    scored: list[tuple[int, float, dict[str, Any], str]] = []
    for resource in catalog:
        candidate = _safe_candidate(source, resource)
        if candidate is None:
            continue
        tier, score, reason = candidate
        scored.append((tier, score, resource, reason))

    if scored:
        scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
        best_tier, best_score, _, _ = scored[0]
        tied = [
            (resource, reason)
            for tier, score, resource, reason in scored
            if tier == best_tier and abs(score - best_score) < 1e-9
        ]
        if len(tied) == 1:
            resource, reason = tied[0]
            return {
                **base,
                "status": "matched",
                "score": round(best_score, 4),
                "reason": reason,
                "code": resource.get("code", ""),
                "catalog_name": resource.get("name", ""),
                "catalog_category": resource.get("category", ""),
                "catalog_unit": resource.get("unit", ""),
            }
        return {
            **base,
            "status": "ambigu",
            "score": round(best_score, 4),
            "reason": "lebih dari satu kandidat aman dengan skor sama",
            "candidates": [_resource_summary(resource) for resource, _ in tied],
        }

    return {
        **base,
        "status": "tidak_ketemu",
        "score": 0.0,
        "reason": "tidak ada kandidat aman setelah cek kategori, unit, angka, dan nama",
        "near_candidates": nearest_rejected_candidates(source, catalog, limit=near_limit),
    }


def load_kejaksaan_rows(source_xlsx: Path) -> list[HargaSourceRow]:
    wb = load_workbook(source_xlsx, data_only=False)
    try:
        rows = parse_harga_sheet(wb["HARGA BAHAN"])
        return [
            HargaSourceRow(
                source_name=row.source_name,
                unit=row.unit,
                price=row.price,
                category=row.category,
                row_number=row.row_number,
            )
            for row in rows
        ]
    finally:
        wb.close()


def load_semarang_price_book(path: Path) -> dict[str, dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {str(row["code"]): row for row in raw.get("resources", [])}


def compare_price_overlap(
    kejaksaan_rows: list[dict[str, Any]],
    semarang_by_code: dict[str, dict[str, Any]],
    threshold: float = 0.15,
) -> list[dict[str, Any]]:
    comparisons: list[dict[str, Any]] = []
    for row in kejaksaan_rows:
        if row.get("status") != "matched":
            continue
        code = str(row.get("code", ""))
        semarang = semarang_by_code.get(code)
        if not semarang:
            continue
        semarang_price = float(semarang.get("price", 0) or 0)
        if semarang_price <= 0:
            continue
        kejaksaan_price = float(row.get("source_price", 0) or 0)
        diff_ratio = abs(kejaksaan_price - semarang_price) / semarang_price
        comparisons.append({
            "code": code,
            "name": str(row.get("catalog_name") or semarang.get("name", "")),
            "kejaksaan_price": int(kejaksaan_price) if kejaksaan_price.is_integer() else kejaksaan_price,
            "semarang_price": int(semarang_price) if semarang_price.is_integer() else semarang_price,
            "diff_pct": round(diff_ratio * 100, 2),
            "status": "perlu ditinjau" if diff_ratio > threshold else "selaras",
        })
    return comparisons


def classify_rows(rows: list[HargaSourceRow], catalog: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [classify_kejaksaan_row(row, catalog) for row in rows]


def _format_price(value: object) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if number.is_integer():
        return str(int(number))
    return str(round(number, 6))


def build_report(
    source_xlsx: Path = SOURCE_DEFAULT,
    catalog_path: Path = CATALOG_DEFAULT,
    semarang_price_path: Path = SEMARANG_PRICE_DEFAULT,
) -> str:
    rows = load_kejaksaan_rows(source_xlsx)
    catalog = load_catalog(catalog_path)
    classified = classify_rows(rows, catalog)
    semarang_by_code = load_semarang_price_book(semarang_price_path)
    comparisons = compare_price_overlap(classified, semarang_by_code)

    matched = [row for row in classified if row["status"] == "matched"]
    ambiguous = [row for row in classified if row["status"] == "ambigu"]
    unmatched = [row for row in classified if row["status"] == "tidak_ketemu"]
    review_needed = [row for row in comparisons if row["status"] == "perlu ditinjau"]

    lines = [
        "# Harga KEJAKSAAN Semarang - 2026-07-11",
        "",
        "Laporan ini membaca sheet `HARGA BAHAN` dari workbook KEJAKSAAN, mencocokkan setiap baris ke master resource, dan membandingkan overlap dengan price book Semarang yang sudah diterapkan pada fase Q.",
        "",
        "Tidak ada harga KEJAKSAAN yang diterapkan ke `data/harga-satuan/semarang.json`.",
        "",
        "## Sumber",
        "",
        f"- Workbook: `{source_xlsx}`",
        f"- Sheet: `HARGA BAHAN`",
        "- Kolom dibaca: B = nama, E = satuan, F = harga/formula",
        f"- Master resource: `{catalog_path}`",
        f"- Price book pembanding: `{semarang_price_path}`",
        "",
        "## Ringkasan",
        "",
        f"- Baris sumber terbaca: **{len(rows)}**",
        f"- Matched aman: **{len(matched)}**",
        f"- Ambigu/perlu keputusan domain: **{len(ambiguous)}**",
        f"- Tidak ketemu aman: **{len(unmatched)}**",
        f"- Overlap dengan price book Semarang: **{len(comparisons)}**",
        f"- Overlap beda harga >15%: **{len(review_needed)}**",
        "",
        "## Matched Aman",
        "",
        "| Row | Source name | Kategori | Unit | Harga KEJAKSAAN | Kode katalog | Catalog name | Alasan |",
        "|---:|---|---|---|---:|---|---|---|",
    ]
    for row in matched:
        lines.append(f"<!-- kejaksaan-source-row:{row['source_row']} -->")
        lines.append(
            "| "
            f"{row['source_row']} | {_md(row['source_name'])} | `{_md(row['source_category'])}` | "
            f"`{_md(row['source_unit'])}` | {_format_price(row['source_price'])} | "
            f"`{_md(row['code'])}` | {_md(row['catalog_name'])} | {_md(row['reason'])} |"
        )

    lines.extend([
        "",
        "## Ambigu / Perlu Keputusan Domain",
        "",
        "| Row | Source name | Kategori | Unit | Harga KEJAKSAAN | Kandidat aman | Alasan |",
        "|---:|---|---|---|---:|---|---|",
    ])
    for row in ambiguous:
        lines.append(f"<!-- kejaksaan-source-row:{row['source_row']} -->")
        candidates = "; ".join(
            f"{candidate['code']} - {candidate['name']} ({candidate['category']}/{candidate['unit']})"
            for candidate in row.get("candidates", [])[:8]
        )
        lines.append(
            "| "
            f"{row['source_row']} | {_md(row['source_name'])} | `{_md(row['source_category'])}` | "
            f"`{_md(row['source_unit'])}` | {_format_price(row['source_price'])} | "
            f"{_md(candidates, 260)} | {_md(row['reason'])} |"
        )

    lines.extend([
        "",
        "## Tidak Ketemu Aman",
        "",
        "| Row | Source name | Kategori | Unit | Harga KEJAKSAAN | Kandidat dekat yang ditolak | Alasan utama |",
        "|---:|---|---|---|---:|---|---|",
    ])
    for row in unmatched:
        lines.append(f"<!-- kejaksaan-source-row:{row['source_row']} -->")
        candidates = "; ".join(
            f"{candidate['code']} - {candidate['name']} ({candidate['category']}/{candidate['unit']}): {candidate['reject_reason']}"
            for candidate in row.get("near_candidates", [])[:5]
        )
        lines.append(
            "| "
            f"{row['source_row']} | {_md(row['source_name'])} | `{_md(row['source_category'])}` | "
            f"`{_md(row['source_unit'])}` | {_format_price(row['source_price'])} | "
            f"{_md(candidates, 420)} | {_md(row['reason'])} |"
        )

    lines.extend([
        "",
        "## Perbandingan dengan sumber Semarang lain",
        "",
        "Perbandingan ini hanya memberi tanda bila kode yang sama muncul di KEJAKSAAN dan price book Semarang. Tidak ada rata-rata harga dan tidak ada nilai KEJAKSAAN yang diterapkan otomatis.",
        "",
        "| Kode | Nama | Harga KEJAKSAAN | Harga Semarang | Selisih | Status |",
        "|---|---|---:|---:|---:|---|",
    ])
    for row in comparisons:
        lines.append(
            "| "
            f"`{_md(row['code'])}` | {_md(row['name'])} | {row['kejaksaan_price']} | "
            f"{row['semarang_price']} | {row['diff_pct']}% | {_md(row['status'])} |"
        )
    if not comparisons:
        lines.append("| - | - | - | - | - | tidak ada overlap |")

    lines.extend([
        "",
        "## Catatan Audit",
        "",
        "- Matching aman mensyaratkan kategori, unit, angka/ukuran, dan nama lolos bersama.",
        "- Kandidat dekat yang ditampilkan pada baris tidak ketemu adalah bukti penolakan, bukan rekomendasi penerapan harga.",
        "- Baris yang beda kategori seperti alat yang muncul di section bahan tidak dipaksa masuk; alasan `kategori beda` ditampilkan agar bisa ditinjau manual.",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", default=str(SOURCE_DEFAULT))
    parser.add_argument("--catalog", default=str(CATALOG_DEFAULT))
    parser.add_argument("--semarang-price", default=str(SEMARANG_PRICE_DEFAULT))
    parser.add_argument("--out", default=str(REPORT_DEFAULT))
    args = parser.parse_args()

    report = build_report(
        source_xlsx=Path(args.src),
        catalog_path=Path(args.catalog),
        semarang_price_path=Path(args.semarang_price),
    )
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
