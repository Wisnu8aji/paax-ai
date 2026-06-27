# -*- coding: utf-8 -*-
"""
PAAX — Extractor AHSP Cipta Karya 2026 (SE DJBK No. 47/2026).

Membaca 16 PDF di G:\\AHSP, mengekstrak tabel analisa (A Tenaga Kerja / B Bahan /
C Peralatan + koefisien), lalu menyimpan dataset terstruktur (schema engine) +
katalog resource ke G:\\paax-data (DI LUAR repo — data ini moat, jangan di-commit).

Catatan:
- Sumber resmi hanya memberi KOEFISIEN; kolom harga KOSONG (diisi SHSD per wilayah).
  Jadi output = koefisien + katalog resource (harga menyusul).
- Pakai PyMuPDF (fitz). Tanpa dependency baru. Paralel via ProcessPoolExecutor.

Jalankan:
    python scripts/ahsp/extract_ahsp.py --src "G:\\AHSP" --out "G:\\paax-data"
"""
from __future__ import annotations
import argparse
import csv
import json
import os
import re
import glob
from concurrent.futures import ProcessPoolExecutor, as_completed

import fitz  # PyMuPDF

# Kode pekerjaan: minimal 3 segmen angka (mis. 2.2.2.4.4). Hindari "1." / "6.".
WORK_CODE = re.compile(r"^\s*(\d+\.\d+\.\d+(?:\.\d+)*)\s*(.*)$", re.S)
# Unit dari nama "Per-m'", "Per-m2", "Per-buah", dst.
UNIT_RE = re.compile(r"^per[-\s]*([a-z0-9'²³./]+)\s+(.*)$", re.I | re.S)
# Penanda akhir nama item (mulai tabel / seksi).
STOP_LINE = re.compile(r"^(No\b|Uraian\b|A\b|B\b|C\b|Tenaga Kerja\b|Tabel\b|Satuan\b|Harga\b|Bahan\b|Peralatan\b)", re.I)

# Satuan kerja AHSP (dimensi cm/mm/m polos sengaja TIDAK dimasukkan agar tak salah
# tangkap ukuran). Pola "<angka> <satuan>" di dalam nama, mis. "1 kg", "1 m2".
_UNIT_TOKENS = ["m³", "m3", "m²", "m2", "m'", "m1", "kg", "ton", "buah", "bh", "titik",
                "unit", "ls", "set", "lembar", "lbr", "batang", "btg", "zak", "sak",
                "liter", "ltr", "roll"]
_UNIT_MAP = {"m³": "m3", "m²": "m2", "bh": "buah", "ltr": "liter", "lbr": "lembar", "btg": "batang", "m1": "m'"}
_UNIT_ALT = "|".join(re.escape(u) for u in sorted(_UNIT_TOKENS, key=len, reverse=True))
# Pakai lookahead (?!\w) bukan \b — token "m'" diakhiri apostrof (bukan word char).
QTY_UNIT = re.compile(r"\b\d+(?:[.,]\d+)?\s*(" + _UNIT_ALT + r")(?!\w)", re.I)
PER_UNIT = re.compile(r"\bper[-\s]+(" + _UNIT_ALT + r")(?!\w)", re.I)


def _norm_unit(u: str) -> str:
    u = u.strip().rstrip(".")
    low = u.lower()
    return _UNIT_MAP.get(u, _UNIT_MAP.get(low, low if low != "m'" else "m'"))

CATEGORY_BY_SECTION = {"A": "upah", "B": "bahan", "C": "alat"}
STOP_SECTIONS = {"D", "E", "F", "G"}


def norm(s: str | None) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", str(s)).strip()


def parse_koef(s: str | None):
    s = norm(s)
    if not s:
        return None
    m = re.search(r"-?\d[\d.]*,?\d*", s)
    if not m:
        return None
    tok = m.group(0)
    if "," in tok:                      # 1.234,56 -> 1234.56 ; 0,1088 -> 0.1088
        tok = tok.replace(".", "").replace(",", ".")
    try:
        v = float(tok)
        return v if v > 0 else None
    except ValueError:
        return None


def parse_unit_name(raw_name: str):
    name = norm(raw_name)
    probe = name.replace("’", "'").replace("‘", "'").replace("`", "'")  # apostrof keriting
    m = UNIT_RE.match(probe)                      # format "Per-<unit> ..."
    if m:
        return _norm_unit(m.group(1)), norm(m.group(2)) or name
    m2 = QTY_UNIT.search(probe)                   # format "... 1 kg / 1 m2 ..."
    if m2:
        return _norm_unit(m2.group(1)), name
    m3 = PER_UNIT.search(probe)                   # format "... per m' ..."
    if m3:
        return _norm_unit(m3.group(1)), name
    return "", name


def _header_indices(row):
    idx = {}
    for i, c in enumerate(row):
        cl = norm(c).lower()
        if "uraian" in cl and "uraian" not in idx:
            idx["uraian"] = i
        elif cl == "kode" or cl.startswith("kode"):
            idx.setdefault("kode", i)
        elif "satuan" in cl:
            idx.setdefault("satuan", i)
        elif "koefisien" in cl:
            idx.setdefault("koef", i)
    return idx


def parse_table(rows):
    """Dari rows tabel -> list komponen [{category, uraian, kode, satuan, koefisien}]."""
    # cari baris header
    h = None
    for i, r in enumerate(rows):
        joined = " ".join(norm(c).lower() for c in r)
        if "uraian" in joined and "koefisien" in joined:
            h = i
            idx = _header_indices(r)
            break
    if h is None:
        return []
    ui = idx.get("uraian", 1)
    ki = idx.get("kode", 2)
    si = idx.get("satuan", 3)
    fi = idx.get("koef", 4)

    comps = []
    category = None
    for r in rows[h + 1:]:
        col0 = norm(r[0]).upper() if r and r[0] is not None else ""
        sect = col0[:1]
        if sect in STOP_SECTIONS:
            break
        if sect in CATEGORY_BY_SECTION:
            category = CATEGORY_BY_SECTION[sect]
            continue
        if category is None:
            continue
        uraian = norm(r[ui]) if ui < len(r) else ""
        if not uraian or "jumlah harga" in uraian.lower():
            continue
        koef = parse_koef(r[fi]) if fi < len(r) else None
        if koef is None:
            continue
        comps.append({
            "category": category,
            "uraian": uraian,
            "kode": norm(r[ki]) if ki < len(r) else "",
            "satuan": norm(r[si]) if si < len(r) else "",
            "koefisien": koef,
        })
    return comps


def parse_pdf(path: str):
    """Return (items, stats) untuk satu PDF."""
    doc = fitz.open(path)
    n_pages = doc.page_count
    items = []
    carry = None  # item yang tabelnya bersambung ke halaman berikutnya
    for p in range(n_pages):
        page = doc[p]
        # Baris teks (dict) untuk deteksi kode pekerjaan yang andal di awal baris.
        lines = []
        for block in page.get_text("dict").get("blocks", []):
            if block.get("type") != 0:
                continue
            for ln in block.get("lines", []):
                txt = norm("".join(sp["text"] for sp in ln.get("spans", [])))
                if txt:
                    lines.append((ln["bbox"][1], txt))
        lines.sort(key=lambda x: x[0])

        code_lines = []  # (y, code, name)
        for i, (y, txt) in enumerate(lines):
            m = WORK_CODE.match(txt)
            if not m:
                continue
            name_parts = [m.group(2)] if norm(m.group(2)) else []
            for (_, t2) in lines[i + 1:i + 4]:
                if WORK_CODE.match(t2) or STOP_LINE.match(t2):
                    break
                name_parts.append(t2)
            code_lines.append((y, m.group(1), norm(" ".join(name_parts))))
        code_lines.sort(key=lambda x: x[0])

        try:
            tabs = list(page.find_tables().tables)
        except Exception:
            tabs = []
        tabs.sort(key=lambda t: t.bbox[1])

        for tab in tabs:
            ty0 = tab.bbox[1]
            owner = None
            for (y, code, nm) in code_lines:
                if y <= ty0 + 4:
                    owner = (code, nm)
            try:
                rows = tab.extract()
            except Exception:
                continue
            comps = parse_table(rows)

            if owner is not None:
                # item baru
                if carry is not None:
                    items.append(carry)
                unit, name = parse_unit_name(owner[1])
                carry = {
                    "code": owner[0], "name": name, "unit": unit,
                    "overhead_profit": 0.10, "source_page": p + 1,
                    "components": comps,
                }
            else:
                # lanjutan tabel item sebelumnya
                if carry is not None and comps:
                    carry["components"].extend(comps)
    if carry is not None:
        items.append(carry)
    doc.close()

    stats = {
        "file": os.path.basename(path),
        "pages": n_pages,
        "items": len(items),
        "items_no_components": sum(1 for it in items if not it["components"]),
        "items_no_unit": sum(1 for it in items if not it["unit"]),
    }
    return items, stats


def build_resource_catalog(items):
    """Dedup resource (tenaga/bahan/alat) lintas item -> katalog + kode stabil."""
    catalog = {}          # key -> resource dict
    gen_counter = {"bahan": 0, "alat": 0, "upah": 0}
    for it in items:
        for c in it["components"]:
            name = c["uraian"]
            cat = c["category"]
            unit = c["satuan"]
            key = (cat, name.lower(), unit.lower())
            if key in catalog:
                code = catalog[key]["code"]
            else:
                code = c["kode"].strip()
                if not code:
                    gen_counter[cat] += 1
                    prefix = {"upah": "L", "bahan": "M", "alat": "E"}[cat]
                    code = f"{prefix}.GEN.{gen_counter[cat]:04d}"
                catalog[key] = {"code": code, "name": name, "category": cat, "unit": unit, "price": 0}
            c["resource_code"] = code
    return list(catalog.values())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=r"G:\AHSP")
    ap.add_argument("--out", default=r"G:\paax-data")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    files = sorted(
        glob.glob(os.path.join(args.src, "*.pdf")),
        key=lambda f: int("".join(ch for ch in os.path.basename(f).split("-")[-1] if ch.isdigit()) or 0),
    )
    print(f"Memproses {len(files)} PDF dengan {args.workers} worker paralel…")

    all_items, all_stats = [], []
    with ProcessPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(parse_pdf, f): f for f in files}
        for fut in as_completed(futs):
            items, stats = fut.result()
            all_items.extend(items)
            all_stats.append(stats)
            print(f"  ✓ {stats['file']}: {stats['items']} item ({stats['pages']} hal)")

    all_stats.sort(key=lambda s: s["file"])
    # dedup kode pekerjaan (jaga-jaga sambungan ganda), pertahankan komponen terbanyak
    by_code = {}
    for it in all_items:
        ex = by_code.get(it["code"])
        if ex is None or len(it["components"]) > len(ex["components"]):
            by_code[it["code"]] = it
    all_sorted = sorted(by_code.values(), key=lambda x: x["code"])
    # Saring item tanpa komponen (header/parent yang bukan AHSP nyata).
    items = [it for it in all_sorted if it["components"]]
    dropped = [it["code"] for it in all_sorted if not it["components"]]

    resources = build_resource_catalog(items)

    # ---- tulis output (di luar repo) ----
    ahsp_dir = os.path.join(args.out, "ahsp")
    harga_dir = os.path.join(args.out, "harga-satuan")
    audit_dir = os.path.join(args.out, "_audit")
    for d in (ahsp_dir, harga_dir, audit_dir):
        os.makedirs(d, exist_ok=True)

    # JSON schema engine: komponen hanya {resource_code, category, coefficient}
    engine_items = [{
        "code": it["code"], "name": it["name"], "unit": it["unit"],
        "overhead_profit": it["overhead_profit"],
        "components": [
            {"resource_code": c["resource_code"], "category": c["category"], "coefficient": c["koefisien"]}
            for c in it["components"]
        ],
    } for it in items]

    with open(os.path.join(ahsp_dir, "cipta-karya-2026.json"), "w", encoding="utf-8") as f:
        json.dump({
            "bidang": "Cipta Karya",
            "source": "SE DJBK No. 47 Tahun 2026 — Lampiran VI (AHSP Bidang Cipta Karya)",
            "note": "Koefisien resmi. Harga (HSD) diisi terpisah dari SHSD regional.",
            "items": engine_items,
        }, f, ensure_ascii=False, indent=2)

    # katalog resource (skeleton price book, harga 0)
    with open(os.path.join(harga_dir, "_resources_catalog.json"), "w", encoding="utf-8") as f:
        json.dump({"region": "(template)", "region_code": "template", "currency": "IDR",
                   "source": "katalog resource dari AHSP CK 2026 — isi harga dari SHSD",
                   "resources": sorted(resources, key=lambda r: (r["category"], r["code"]))},
                  f, ensure_ascii=False, indent=2)
    with open(os.path.join(harga_dir, "_resources_catalog.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["code", "name", "category", "unit", "price"])
        for r in sorted(resources, key=lambda r: (r["category"], r["code"])):
            w.writerow([r["code"], r["name"], r["category"], r["unit"], r["price"]])

    # laporan cakupan
    coverage = {
        "total_items": len(items),
        "total_components": sum(len(it["components"]) for it in items),
        "total_resources": len(resources),
        "dropped_no_components": len(dropped),
        "items_no_unit": sum(1 for it in items if not it["unit"]),
        "review_no_unit_sample": [it["code"] for it in items if not it["unit"]][:40],
        "dropped_codes_sample": dropped[:40],
        "per_file": all_stats,
    }
    with open(os.path.join(audit_dir, "coverage.json"), "w", encoding="utf-8") as f:
        json.dump(coverage, f, ensure_ascii=False, indent=2)

    print("\n=== RINGKASAN ===")
    print(f"Item AHSP   : {coverage['total_items']}")
    print(f"Komponen    : {coverage['total_components']}")
    print(f"Resource    : {coverage['total_resources']}")
    print(f"Disaring (tanpa komponen): {coverage['dropped_no_components']} | Tanpa satuan: {coverage['items_no_unit']}")
    print(f"Output di    : {args.out}")
    # sampel validasi
    sample = next((it for it in items if it["code"].startswith("2.2.2.4.4")), items[0] if items else None)
    if sample:
        print(f"\nSAMPEL {sample['code']} — {sample['name']} [{sample['unit']}]")
        for c in sample["components"][:8]:
            print(f"  {c['category']:<6} {c['resource_code']:<10} {c['koefisien']}")


if __name__ == "__main__":
    main()
