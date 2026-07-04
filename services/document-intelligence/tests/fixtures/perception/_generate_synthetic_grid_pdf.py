"""
Fase 2 P3-geometri — PDF sintetis NON-PLHUT dengan bubble-as + garis-dimensi
NYATA (lingkaran vektor asli + teks angka), §0.1: label/nilai sengaja BEDA
dari fixture PLHUT (huruf P/Q/R bukan A-F, angka bentang 3500/2800/4000/3200
bukan 5000/2000/3000/4000) supaya lolos hanya kalau algoritma benar-benar
menggeneralisasi geometri, bukan hafal nilai PLHUT.
"""
from __future__ import annotations

import fitz


def build_synthetic_grid_pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=600, height=500)

    # --- keluarga sumbu_x (bubble angka 1,2,3 berjajar horizontal, cy=80) ---
    numeric_axes = [("1", 100.0), ("2", 260.0), ("3", 420.0)]
    for label, cx in numeric_axes:
        page.draw_circle((cx, 80), 18, color=(0, 0, 0), width=1)
        page.insert_text((cx - 3, 84), label, fontsize=10)

    # dimensi antar-as (baris utama, y=115) + offset tepi sebelum axis "1"
    page.insert_text((160 - 14, 115), "3500", fontsize=9)   # 1-2
    page.insert_text((330 - 14, 115), "2800", fontsize=9)   # 2-3
    page.insert_text((100 - 40, 115), "600", fontsize=9)    # offset tepi sebelum "1"
    # total (baris lain, y=40, jauh dari bbox bubble cy=80 radius18 supaya
    # tak tumpang tindih dengan label bubble "2") = 3500+2800=6300
    page.insert_text((250 - 16, 40), "6300", fontsize=9)

    # --- keluarga sumbu_y (bubble huruf P,Q,R berjajar vertikal, cx=40) ---
    alpha_axes = [("P", 160.0), ("Q", 300.0), ("R", 440.0)]
    for label, cy in alpha_axes:
        page.draw_circle((40, cy), 18, color=(0, 0, 0), width=1)
        page.insert_text((37, cy + 4), label, fontsize=10)

    # dimensi antar-as (baris utama, x=70) + total (baris lain, x=55)
    page.insert_text((70, 230 - 5), "4000", fontsize=9)   # P-Q
    page.insert_text((70, 370 - 5), "3200", fontsize=9)   # Q-R
    page.insert_text((55, 300 - 5), "7200", fontsize=9)   # total P-R = 7200

    # --- penanda lain (BUKAN bubble as): 2 lingkaran KECIL kebetulan sejajar
    # cx=520, ukuran BEDA (diameter ~20 vs 36 keluarga asli) -> harus GUGUR
    # oleh filter kelompok-ukuran dominan, bukan dianggap keluarga baru.
    page.draw_circle((520, 120), 10, color=(0, 0, 0), width=1)
    page.insert_text((517, 124), "M", fontsize=9)
    page.draw_circle((520, 300), 10, color=(0, 0, 0), width=1)
    page.insert_text((517, 304), "N", fontsize=9)

    # teks lain yang tak boleh ikut dianggap grid (kode elemen biasa)
    page.insert_text((450, 450), "K1", fontsize=10)

    return doc.tobytes()
