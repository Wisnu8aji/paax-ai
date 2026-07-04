from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from scripts.harga.extract_harga import (  # noqa: E402
    _numbers_compatible,
    normalize_name,
    normalize_unit,
)
AUDIT_DEFAULT = Path(r"G:\paax-data\_audit\harga_semarang.json")
REVIEW_DEFAULT = Path(r"G:\paax-data\_audit\harga_semarang_review.csv")
CATALOG_DEFAULT = Path(r"G:\paax-data\harga-satuan\_resources_catalog.json")
EXISTING_PRICE_DEFAULT = Path(r"G:\paax-data\harga-satuan\semarang.json")
REPORT_DEFAULT = REPO_ROOT / "report" / "HARGA_SEMARANG_BATCH2_FINDINGS_2026-07-10.md"


def _md(text: object, limit: int | None = None) -> str:
    value = str(text).replace("\r", " ").replace("\n", " ")
    value = re.sub(r"\s+", " ", value).strip()
    if limit is not None and len(value) > limit:
        value = value[: limit - 3].rstrip() + "..."
    return value.replace("|", "\\|")


def _batch2_name(text: str) -> str:
    value = normalize_name(text)
    value = re.sub(r"\bbesi\b", "baja", value)
    value = value.replace("seal tape", "sealtape")
    return re.sub(r"\s+", " ", value).strip()


def _same_category_unit(row: dict[str, Any], resource: dict[str, Any]) -> bool:
    if row.get("source_category") != resource.get("category"):
        return False
    source_unit = normalize_unit(str(row.get("source_unit", "")))
    resource_unit = normalize_unit(str(resource.get("unit", "")))
    return bool(source_unit and resource_unit and source_unit == resource_unit)


def _resource_summary(resource: dict[str, Any]) -> dict[str, Any]:
    return {
        "code": resource.get("code", ""),
        "name": resource.get("name", ""),
        "category": resource.get("category", ""),
        "unit": resource.get("unit", ""),
    }


def classify_batch2_row(row: dict[str, Any], catalog: list[dict[str, Any]]) -> dict[str, Any]:
    """Second-pass matcher konservatif untuk 68 row Semarang yang belum cocok."""
    source_norm = _batch2_name(str(row.get("source_name", "")))

    exact = []
    partial = []
    source_tokens = set(source_norm.split())
    for resource in catalog:
        if not _same_category_unit(row, resource):
            continue
        if not _numbers_compatible(str(row.get("source_name", "")), str(resource.get("name", ""))):
            continue
        resource_norm = _batch2_name(str(resource.get("name", "")))
        resource_tokens = set(resource_norm.split())
        if source_norm and source_norm == resource_norm:
            exact.append(resource)
        elif source_tokens and source_tokens <= resource_tokens:
            partial.append(resource)

    if len(exact) == 1:
        resource = exact[0]
        return {
            **row,
            "status": "matched_diusulkan",
            "score": 1.0,
            "code": resource.get("code", ""),
            "catalog_name": resource.get("name", ""),
            "catalog_unit": resource.get("unit", ""),
            "reason": "nama/kategori/unit cocok setelah normalisasi ketat",
        }
    if len(exact) > 1:
        return {
            **row,
            "status": "ambigu",
            "score": 1.0,
            "reason": "lebih dari satu kandidat exact setelah normalisasi",
            "candidates": [_resource_summary(resource) for resource in exact],
        }

    if len(partial) > 1:
        return {
            **row,
            "status": "ambigu",
            "score": 0.75,
            "reason": "lebih dari satu kandidat parsial; butuh keputusan domain",
            "candidates": [_resource_summary(resource) for resource in partial],
        }

    return {
        **row,
        "status": "tidak_ketemu",
        "score": 0.0,
        "reason": "tidak ada kandidat aman untuk batch2",
        "candidates": [_resource_summary(resource) for resource in partial],
    }


def load_catalog(path: Path) -> list[dict[str, Any]]:
    return list(json.loads(path.read_text(encoding="utf-8")).get("resources", []))


def load_unmatched_rows(audit_path: Path) -> list[dict[str, Any]]:
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    return list(audit.get("unmatched", []))


def load_review_names(path: Path) -> set[str]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return {row.get("source_name", "") for row in csv.DictReader(handle)}


def build_report(
    audit_path: Path,
    review_path: Path,
    catalog_path: Path,
    existing_price_path: Path,
) -> str:
    rows = load_unmatched_rows(audit_path)
    catalog = load_catalog(catalog_path)
    review_names = load_review_names(review_path)

    missing_from_review = [row["source_name"] for row in rows if row["source_name"] not in review_names]
    if missing_from_review:
        raise ValueError(f"Review CSV tidak memuat source_name berikut: {missing_from_review}")

    classified = [classify_batch2_row(row, catalog) for row in rows]
    matched = [row for row in classified if row["status"] == "matched_diusulkan"]
    ambiguous = [row for row in classified if row["status"] == "ambigu"]
    unresolved = [row for row in classified if row["status"] == "tidak_ketemu"]

    lines = [
        "# Harga Semarang Batch 2 Findings - 2026-07-10",
        "",
        "Laporan ini adalah USULAN lanjutan untuk 68 baris harga Semarang yang belum cocok pada audit Fase A-2.",
        "Tidak ada harga yang diterapkan ke `data/harga-satuan/semarang.json` atau `G:\\paax-data\\harga-satuan\\semarang.json` dalam fase ini.",
        "",
        f"Acuan harga existing: `{existing_price_path}`",
        f"Audit manifest: `{audit_path}`",
        f"Review CSV: `{review_path}`",
        f"Master resource: `{catalog_path}`",
        "",
        "## Ringkasan",
        "",
        f"- Baris sumber batch2 dari manifest unmatched: **{len(rows)}**",
        f"- Matched diusulkan: **{len(matched)}**",
        f"- Ambigu: **{len(ambiguous)}**",
        f"- Tidak ketemu aman: **{len(unresolved)}**",
        "- Metode: reuse normalisasi `scripts/harga/extract_harga.py`, lalu second-pass konservatif untuk exact alias `besi->baja` dan `seal tape->sealtape`.",
        "- Prinsip tahan: mutu beton, watt lampu, ukuran/varian keramik/granit/hollow, dan kandidat ganda tidak dipilih sepihak.",
        "",
        "## Matched Diusulkan",
        "",
        "| Row | Source name | Unit | Harga Excel | Kode katalog | Catalog name | Skor | Alasan |",
        "|---:|---|---|---:|---|---|---:|---|",
    ]
    for row in matched:
        lines.append(f"<!-- semarang-batch2-source-row:{row['source_row']} -->")
        lines.append(
            "| "
            f"{row['source_row']} | {_md(row['source_name'])} | `{_md(row['source_unit'])}` | "
            f"{row['source_price']} | `{_md(row['code'])}` | {_md(row['catalog_name'])} | "
            f"{row['score']:.2f} | {_md(row['reason'])} |"
        )

    lines.extend([
        "",
        "## Ambigu / Perlu Keputusan Domain",
        "",
        "| Row | Source name | Unit | Harga Excel | Kandidat | Alasan |",
        "|---:|---|---|---:|---|---|",
    ])
    for row in ambiguous:
        lines.append(f"<!-- semarang-batch2-source-row:{row['source_row']} -->")
        candidates = "; ".join(
            f"{candidate['code']} - {candidate['name']} ({candidate['unit']})"
            for candidate in row.get("candidates", [])[:8]
        )
        lines.append(
            "| "
            f"{row['source_row']} | {_md(row['source_name'])} | `{_md(row['source_unit'])}` | "
            f"{row['source_price']} | {_md(candidates, 240)} | {_md(row['reason'])} |"
        )

    lines.extend([
        "",
        "## Tidak Ketemu Aman",
        "",
        "| Row | Source name | Unit | Harga Excel | Alasan |",
        "|---:|---|---|---:|---|",
    ])
    for row in unresolved:
        lines.append(f"<!-- semarang-batch2-source-row:{row['source_row']} -->")
        lines.append(
            "| "
            f"{row['source_row']} | {_md(row['source_name'])} | `{_md(row['source_unit'])}` | "
            f"{row['source_price']} | {_md(row['reason'])} |"
        )

    lines.extend([
        "",
        "## Catatan",
        "",
        "- Dua baris ambiguous lama (`Paku`, `Paku sekrup`) tetap berasal dari review Fase A-2 dan tidak dihitung sebagai 68 baris batch2.",
        "- Semua angka harga di tabel adalah nilai dari Excel sumber; laporan ini hanya mengusulkan mapping kode katalog.",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit", default=str(AUDIT_DEFAULT))
    parser.add_argument("--review", default=str(REVIEW_DEFAULT))
    parser.add_argument("--catalog", default=str(CATALOG_DEFAULT))
    parser.add_argument("--existing-price", default=str(EXISTING_PRICE_DEFAULT))
    parser.add_argument("--out", default=str(REPORT_DEFAULT))
    args = parser.parse_args()

    report = build_report(
        audit_path=Path(args.audit),
        review_path=Path(args.review),
        catalog_path=Path(args.catalog),
        existing_price_path=Path(args.existing_price),
    )
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
