"""
Ekstraktor harga satuan Surakarta dari RAB PLHUT Kankemenag Surakarta 2024
(sheet "HARGA BAHAN") -> D:/paax-data/harga-satuan/surakarta.json
(format identik data/harga-satuan/semarang.json; loader menemukan otomatis
lewat PAAX_DATA_DIR).

Deterministik & reproducible: jalankan ulang -> keluaran identik.
Sumber di luar repo (data governance): file xlsx & keluaran TIDAK di-commit.

    python scripts/extract_harga_surakarta.py [path_xlsx] [path_output]
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd

DEFAULT_XLSX = r"C:\Users\Nothing\Downloads\rab gedung plhut surakarta ALFA.xlsx"
DEFAULT_OUT = r"D:\paax-data\harga-satuan\surakarta.json"

# Header seksi pada sheet -> kategori + prefiks kode
SECTIONS = {
    "UPAH": ("upah", "L"),
    "BAHAN": ("bahan", "M"),
    "ALAT": ("alat", "E"),
    "SEWA ALAT": ("alat", "E"),
    "PERALATAN": ("alat", "E"),
}
# Baris non-data yang harus dilewati
SKIP = {"DAFTAR HARGA BAHAN DAN UPAH", "NO.", "URAIAN", "URAIAN  PEKERJA",
        "SATUAN", "HARGA", "(RP)", "KET."}


def _clean(s: object) -> str:
    return re.sub(r"\s+", " ", str(s)).strip()


def extract(xlsx: str, out: str) -> None:
    df = pd.read_excel(xlsx, sheet_name="HARGA BAHAN", header=None)

    resources: list[dict] = []
    seen: set[tuple[str, str]] = set()
    counters = {"L": 0, "M": 0, "E": 0}
    kategori, prefix = None, None

    for _, row in df.iterrows():
        cells = [c for c in row.tolist() if not (isinstance(c, float) and pd.isna(c)) and c is not None]
        texts = [_clean(c) for c in cells if isinstance(c, str) and _clean(c)]
        nums = [float(c) for c in cells if isinstance(c, (int, float)) and not pd.isna(c)]

        # Ganti seksi?
        if len(texts) == 1 and texts[0].upper() in SECTIONS:
            kategori, prefix = SECTIONS[texts[0].upper()]
            continue
        if not texts or texts[0].upper() in SKIP or kategori is None:
            continue

        # Data: nama = teks pertama; satuan = teks pendek berikutnya; harga = angka pertama > 0
        name = texts[0]
        unit = next((t for t in texts[1:] if len(t) <= 8), None)
        price = next((n for n in nums if n > 0), None)
        if not unit or price is None or name.upper().startswith(("JUMLAH", "TOTAL")):
            continue

        key = (name.lower(), unit.lower())
        if key in seen:
            continue
        seen.add(key)
        counters[prefix] += 1
        resources.append({
            "code": f"SKA.{prefix}.{counters[prefix]:03d}",
            "name": name,
            "category": kategori,
            "unit": unit,
            "price": int(price) if float(price).is_integer() else price,
        })

    payload = {
        "region": "Surakarta",
        "region_code": "surakarta",
        "currency": "IDR",
        "source": ("Daftar Harga Bahan dan Upah — RAB Pembangunan PLHUT Kankemenag "
                   "Kota Surakarta TA 2024 (sheet 'HARGA BAHAN', rab gedung plhut "
                   "surakarta ALFA.xlsx)"),
        "effective_date": "2024-01-01",
        "resources": resources,
    }
    out_path = Path(out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    by_cat: dict[str, int] = {}
    for r in resources:
        by_cat[r["category"]] = by_cat.get(r["category"], 0) + 1
    print(f"OK -> {out_path} : {len(resources)} resource {by_cat}")


if __name__ == "__main__":
    xlsx = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLSX
    out = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT
    extract(xlsx, out)
