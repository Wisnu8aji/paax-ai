"""
Fase 2 P3 — PDF sintetis NON-PLHUT dengan tabel BERGARIS asli (§0.1).

Gaya balok "B1/B2" (bukan kolom K-series PLHUT) supaya bukti generalisasi.
Bisa dipanggil langsung dari test (in-memory) tanpa perlu file di disk.
"""
from __future__ import annotations

import fitz


def build_synthetic_table_pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=500, height=400)

    # Tabel bergaris: header + 2 baris data (kode/dimensi/tul utama/sengkang)
    x0, y0 = 50, 50
    col_w = [50, 70, 70, 70]
    row_h = 22
    n_rows = 3
    total_w = sum(col_w)
    for r in range(n_rows + 1):
        page.draw_line((x0, y0 + r * row_h), (x0 + total_w, y0 + r * row_h))
    x = x0
    xs = [x0]
    for w in col_w:
        x += w
        xs.append(x)
    for cx in xs:
        page.draw_line((cx, y0), (cx, y0 + n_rows * row_h))

    rows = [
        ["KODE", "DIMENSI", "TUL UTAMA", "SENGKANG"],
        ["B1", "300X500", "4D19", "D10-150"],
        ["B2", "250X400", "4D16", "D10-150"],
    ]
    for r, row in enumerate(rows):
        cx = x0
        for c, text in enumerate(row):
            page.insert_text((cx + 4, y0 + r * row_h + 15), text, fontsize=8)
            cx += col_w[c]

    # Grid notasi gabungan (§3.1.1, cakupan jujur iterasi ini)
    page.insert_text((50, 200), "A-B=6000", fontsize=10)
    page.insert_text((50, 220), "TOTAL A-B=6000", fontsize=10)

    # Level
    page.insert_text((50, 250), "SFL +0.000", fontsize=10)

    # Elemen standalone (JAUH dari bbox tabel di x:50-310,y:50-116), muncul 3x -> count_label=3
    page.insert_text((400, 100), "K1", fontsize=10)
    page.insert_text((400, 130), "K1", fontsize=10)
    page.insert_text((400, 160), "K1", fontsize=10)

    # Teks yang TIDAK cocok grammar apa pun -> harus masuk UNCLASSIFIED
    page.insert_text((50, 280), "CATATAN UMUM PROYEK", fontsize=10)

    return doc.tobytes()
