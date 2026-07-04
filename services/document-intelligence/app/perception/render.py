"""
PAAX Document Intelligence — Render `.tkg.txt` deterministik (brain-00 §6).

Satu fakta per baris, format `[ID] JENIS | nilai | unit | alamat | ...` — untuk
review manusia (jembatan gambar -> otak). Render sederhana (belum termasuk
bbox/hal locator penuh — itu perluasan lanjutan, dicatat bukan disembunyikan).
"""
from __future__ import annotations

from app.perception.tkg.models import TkgDocument


def render_tkg_txt(doc: TkgDocument) -> str:
    lines: list[str] = []
    for sheet in doc.sheets:
        if sheet.grid:
            for i, sp in enumerate(sheet.grid.bentang_x, 1):
                lines.append(f"[{sheet.sheet_id}-GRID-X{i:02d}] BENTANG | {sp.nilai:g} | {sp.unit} | as {sp.dari}->{sp.ke}")
            for i, sp in enumerate(sheet.grid.bentang_y, 1):
                lines.append(f"[{sheet.sheet_id}-GRID-Y{i:02d}] BENTANG | {sp.nilai:g} | {sp.unit} | as {sp.dari}->{sp.ke}")
            if sheet.grid.total_x:
                lines.append(f"[{sheet.sheet_id}-GRID-TOTX] TOTAL | {sheet.grid.total_x.nilai:g} | {sheet.grid.total_x.unit} | as {sheet.grid.total_x.dari}->{sheet.grid.total_x.ke}")
            if sheet.grid.total_y:
                lines.append(f"[{sheet.sheet_id}-GRID-TOTY] TOTAL | {sheet.grid.total_y.nilai:g} | {sheet.grid.total_y.unit} | as {sheet.grid.total_y.dari}->{sheet.grid.total_y.ke}")
        for i, lv in enumerate(sheet.levels, 1):
            lines.append(f"[{sheet.sheet_id}-LVL-{i:02d}] LEVEL | {lv.nilai_m:g} | m | raw=\"{lv.label_raw}\"")
        for table in sheet.tables:
            for rec in table.records:
                tul = "; ".join(f"{t.posisi}:{t.raw}" for t in rec.tulangan) or "-"
                dim = ",".join(f"{k}={v:g}" for k, v in rec.dimensi.items()) or "-"
                lines.append(
                    f"[{sheet.sheet_id}-TBL-{rec.kode}] RECORD | {rec.kode} | "
                    f"dim={dim} {rec.satuan_dimensi}; tul={tul}"
                )
        for i, el in enumerate(sheet.elements, 1):
            lines.append(f"[{sheet.sheet_id}-EL-{i:03d}] ELEMEN | {el.kode} | n={el.n} | {el.alamat}")
        if sheet.unclassified:
            lines.append(f"[{sheet.sheet_id}-UNCLASSIFIED] {len(sheet.unclassified)} item tidak cocok grammar §2")
    return "\n".join(lines)
