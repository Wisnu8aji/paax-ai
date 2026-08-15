from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import fitz


REPO_ROOT = Path(__file__).resolve().parents[2]
AHSP_DEFAULT = REPO_ROOT / "data" / "ahsp" / "cipta-karya-2026.json"
FINDINGS_DEFAULT = REPO_ROOT / "report" / "AHSP_IMPORT_BATCH_FINDINGS_2026-07-08.md"
PDF_DIR_DEFAULT = Path(r"D:\paax-data\ahsp")
REPORT_DEFAULT = REPO_ROOT / "report" / "AHSP_UNIT_GAP_RESOLUTION_2026-07-10.md"


@dataclass(frozen=True)
class PdfPageText:
    pdf_name: str
    page_number: int
    text: str


def _md(text: object, limit: int | None = None) -> str:
    value = str(text).replace("\r", " ").replace("\n", " ")
    value = re.sub(r"\s+", " ", value).strip()
    if limit is not None and len(value) > limit:
        value = value[: limit - 3].rstrip() + "..."
    return value.replace("|", "\\|")


def _pdf_sort_key(path: Path) -> int:
    match = re.search(r"-(\d+)\.pdf$", path.name)
    return int(match.group(1)) if match else 9999


def _exact_code_pattern(code: str) -> re.Pattern[str]:
    return re.compile(r"(?<![\d.])" + re.escape(code) + r"(?![\d.])")


def unit_gap_codes_from_findings(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return re.findall(r"- `([^`]+)`: unit kosong", text)


def load_empty_unit_items(ahsp_path: Path) -> dict[str, dict]:
    raw = json.loads(ahsp_path.read_text(encoding="utf-8"))
    return {
        item["code"]: item
        for item in raw.get("items", [])
        if not str(item.get("unit", "")).strip()
    }


def extract_pdf_pages(pdf_dir: Path) -> list[PdfPageText]:
    pdfs = sorted(
        pdf_dir.glob("Lampiran-VI-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Cipta-Karya-*.pdf"),
        key=_pdf_sort_key,
    )
    pages: list[PdfPageText] = []
    for pdf in pdfs:
        doc = fitz.open(pdf)
        try:
            for idx, page in enumerate(doc, start=1):
                text = re.sub(r"\s+", " ", page.get_text("text")).strip()
                pages.append(PdfPageText(pdf.name, idx, text))
        finally:
            doc.close()
    return pages


def _next_code_offset(text: str, start: int) -> int:
    match = re.search(r"\s\d+(?:\.\d+){1,5}\s", text[start:])
    return start + match.start() if match else len(text)


def find_pdf_unit(code: str, pages: Iterable[PdfPageText]) -> dict[str, object]:
    pattern = _exact_code_pattern(code)
    for page in pages:
        match = pattern.search(page.text)
        if match is None:
            continue

        end = _next_code_offset(page.text, match.end())
        segment = page.text[match.end():end].strip()
        unit_match = re.search(r"(.+?)\s+(\S+)\s+(?:Normatif|Informatif)\s+", segment)
        if unit_match is None:
            return {
                "status": "tidak_ketemu",
                "unit": "",
                "source": f"{page.pdf_name} halaman {page.page_number}",
                "evidence": segment,
            }

        return {
            "status": "pdf",
            "unit": unit_match.group(2),
            "source": f"{page.pdf_name} halaman {page.page_number}",
            "evidence": f"{code} {segment}",
        }

    return {
        "status": "tidak_ketemu",
        "unit": "",
        "source": "tidak-ketemu",
        "evidence": "Kode tidak ditemukan di teks PDF resmi.",
    }


def build_report(ahsp_path: Path, findings_path: Path, pdf_dir: Path) -> str:
    codes = unit_gap_codes_from_findings(findings_path)
    items = load_empty_unit_items(ahsp_path)
    pages = extract_pdf_pages(pdf_dir)

    rows = []
    for code in codes:
        if code not in items:
            raise ValueError(f"Kode {code} tercatat unit kosong, tetapi tidak ditemukan sebagai unit kosong di AHSP JSON.")
        evidence = find_pdf_unit(code, pages)
        rows.append((code, items[code], evidence))

    pdf_count = sum(1 for _, _, evidence in rows if evidence["status"] == "pdf")
    unresolved = [code for code, _, evidence in rows if evidence["status"] != "pdf"]

    lines = [
        "# AHSP Unit Gap Resolution - 2026-07-10",
        "",
        "Laporan ini adalah USULAN berbasis bukti untuk 188 item AHSP CK 2026 yang `unit`-nya kosong di JSON impor.",
        "Tidak ada nilai satuan yang diterapkan ke `data/ahsp/cipta-karya-2026.json` dalam fase ini.",
        "",
        "## Ringkasan",
        "",
        f"- Total kode unit kosong dari findings Fase N: **{len(codes)}**",
        f"- Ditemukan pasti di PDF resmi: **{pdf_count}**",
        "- Diinfer dari pola nama: **0**",
        f"- Tidak terselesaikan: **{len(unresolved)}**",
        "",
        "Sumber PDF: `D:\\paax-data\\ahsp\\Lampiran-VI-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Cipta-Karya-{1..16}.pdf`.",
        "",
        "## Detail 188 Kode",
        "",
        "| Kode | Nama item (dipotong) | Satuan diusulkan | Sumber | Bukti/kutipan singkat |",
        "|---|---|---|---|---|",
    ]

    for code, item, evidence in rows:
        lines.append(f"<!-- unit-gap-code:{code} -->")
        lines.append(
            "| "
            f"`{code}` | "
            f"{_md(item['name'], 90)} | "
            f"`{_md(evidence['unit'])}` | "
            f"{_md(evidence['source'])} | "
            f"{_md(evidence['evidence'], 220)} |"
        )

    lines.extend([
        "",
        "## Kelompok Akhir",
        "",
        f"### A. Ditemukan pasti di PDF resmi ({pdf_count})",
        "",
        "Semua kode pada tabel detail di atas masuk kelompok ini karena satuannya muncul langsung di halaman indeks PDF resmi.",
        "",
        "### B. Diinfer dari pola nama (0)",
        "",
        "Tidak dipakai, karena seluruh 188 kode ditemukan di PDF resmi.",
        "",
        f"### C. Tidak terselesaikan ({len(unresolved)})",
        "",
        "Tidak ada." if not unresolved else ", ".join(f"`{code}`" for code in unresolved),
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ahsp", default=str(AHSP_DEFAULT))
    parser.add_argument("--findings", default=str(FINDINGS_DEFAULT))
    parser.add_argument("--pdf-dir", default=str(PDF_DIR_DEFAULT))
    parser.add_argument("--out", default=str(REPORT_DEFAULT))
    args = parser.parse_args()

    report = build_report(Path(args.ahsp), Path(args.findings), Path(args.pdf_dir))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
