"""
PAAX Core Engine — Renderer TKG -> .tkg.txt (brain TXT00 §6).

Render teks DETERMINISTIK untuk manusia: satu fakta per baris, urutan tetap,
format `[ID] JENIS | nilai | unit | alamat/anchor | raw="..."`. Inilah "skrip"
yang dibaca insinyur (dan Engineering Chat) tanpa membuka gambar lagi.
"""
from __future__ import annotations
from typing import List

from .models import TkgDocument, TkgValidationResult


def _baris(idx: str, jenis: str, *kolom: str) -> str:
    isi = " | ".join(k for k in kolom if k)
    return f"[{idx}] {jenis} | {isi}"


def render_tkg_txt(doc: TkgDocument, validation: TkgValidationResult | None = None) -> str:
    out: List[str] = []
    out.append("=" * 78)
    out.append(f"TKG — TRANSKRIP KANONIK GAMBAR · proyek {doc.prj_id} · revisi {doc.rev_id}")
    out.append(f"locale={doc.locale} · satuan_default={doc.satuan_default} · sumber={doc.generated_by}")
    out.append("=" * 78)

    for sheet in doc.sheets:
        s = sheet.sheet_id
        out.append("")
        out.append(f"--- SHEET {s} · {sheet.jenis.upper()} · \"{sheet.meta.judul}\""
                   + (f" · {sheet.meta.nomor}" if sheet.meta.nomor else "")
                   + (f" · skala {sheet.meta.skala}" if sheet.meta.skala else ""))

        if sheet.grid:
            g = sheet.grid
            if g.sumbu_x:
                out.append(_baris(f"{s}-GRID-X", "SUMBU-X", ",".join(a.label for a in g.sumbu_x)))
            if g.sumbu_y:
                out.append(_baris(f"{s}-GRID-Y", "SUMBU-Y", ",".join(a.label for a in g.sumbu_y)))
            for i, sp in enumerate(g.bentang_x, 1):
                out.append(_baris(f"{s}-GRID-X{i:02d}", "BENTANG", f"{sp.nilai:g}", sp.unit,
                                  f"as {sp.dari}->{sp.ke}", f'raw="{sp.raw}"' if sp.raw else ""))
            for i, sp in enumerate(g.bentang_y, 1):
                out.append(_baris(f"{s}-GRID-Y{i:02d}", "BENTANG", f"{sp.nilai:g}", sp.unit,
                                  f"as {sp.dari}->{sp.ke}", f'raw="{sp.raw}"' if sp.raw else ""))
            if g.total_x:
                out.append(_baris(f"{s}-GRID-TX", "TOTAL", f"{g.total_x.nilai:g}", g.total_x.unit,
                                  f"as {g.total_x.dari}->{g.total_x.ke}"))
            if g.total_y:
                out.append(_baris(f"{s}-GRID-TY", "TOTAL", f"{g.total_y.nilai:g}", g.total_y.unit,
                                  f"as {g.total_y.dari}->{g.total_y.ke}"))
            for i, sp in enumerate(g.offset_tepi, 1):
                out.append(_baris(f"{s}-OFS-{i:02d}", "OFFSET-TEPI", f"{sp.nilai:g}", sp.unit,
                                  f"as {sp.dari}->{sp.ke} (di luar as ujung, tidak ikut total)"))

        for i, lv in enumerate(sheet.levels, 1):
            out.append(_baris(f"{s}-LVL-{i:02d}", "LEVEL", f"{lv.nilai_m:+.3f}", "m",
                              lv.lantai or "", f'raw="{lv.label_raw}"'))

        for table in sheet.tables:
            for rec in table.records:
                dim = "; ".join(f"{k}={v:g}" for k, v in sorted(rec.dimensi.items()))
                tul = "; ".join(f"{r.posisi}={r.raw}" for r in rec.tulangan)
                rid = f"{s}-TBL-{rec.kode}" + (f"-{rec.lantai}" if rec.lantai else "")
                out.append(_baris(
                    rid, "RECORD",
                    rec.kode + (f" lantai {rec.lantai}" if rec.lantai else ""),
                    f"dim[{rec.satuan_dimensi}]: {dim}" if dim else "",
                    f"tul: {tul}" if tul else "",
                    f"mutu: {rec.mutu_beton}" if rec.mutu_beton else "",
                    f"ket: {rec.keterangan}" if rec.keterangan else "",
                ))

        for i, el in enumerate(sheet.elements, 1):
            cnt = ""
            if el.count_simbol is not None or el.count_label is not None:
                sm = el.count_simbol if el.count_simbol is not None else "?"
                lb = el.count_label if el.count_label is not None else "?"
                cnt = f"n={el.n} (simbol={sm}, label={lb})"
            else:
                cnt = f"n={el.n}"
            ruas = ""
            if el.ruas:
                ruas = f"ruas as {el.ruas.dari}->{el.ruas.ke}" + (f" pada as {el.ruas.pada}" if el.ruas.pada else "")
            out.append(_baris(
                f"{s}-EL-{i:03d}", "ELEMEN", el.kode, el.bentuk, el.alamat, cnt, ruas,
                f"panjang tertulis={el.panjang_m:g} m" if el.panjang_m is not None else "",
                f"lantai {el.lantai}" if el.lantai else "",
            ))

        for i, d in enumerate(sheet.dimensions, 1):
            out.append(_baris(f"{s}-DIM-{i:03d}", "DIMENSI", f"{d.nilai:g}", d.unit, d.anchor,
                              f"target={d.target_kode}" if d.target_kode else "",
                              f'raw="{d.raw}"' if d.raw else ""))

        for i, note in enumerate(sheet.notes, 1):
            out.append(_baris(f"{s}-NOTE-{i:02d}", "CATATAN", note))

        for i, u in enumerate(sheet.unclassified, 1):
            out.append(_baris(f"{s}-UNC-{i:03d}", "UNCLASSIFIED", f'raw="{u.raw}"', u.alasan))

    if validation is not None:
        out.append("")
        out.append("--- VALIDASI (V-01..V-10 subset) ---")
        out.append(f"errors={validation.n_errors} · warnings={validation.n_warnings} · "
                   f"gerbang={'LOLOS' if validation.gate_passed else 'BELUM (draft)'}")
        for i, issue in enumerate(validation.issues, 1):
            out.append(_baris(f"VAL-{i:02d}", issue.code,
                              issue.severity.upper(),
                              issue.sheet_id or "",
                              issue.subject or "",
                              issue.message))
        if validation.orphans_tanpa_definisi:
            out.append(f"Orphan tanpa definisi: {', '.join(validation.orphans_tanpa_definisi)}")
        if validation.orphans_tanpa_instance:
            out.append(f"Definisi tanpa instance: {', '.join(validation.orphans_tanpa_instance)}")

    out.append("")
    out.append("=" * 78)
    return "\n".join(out)
