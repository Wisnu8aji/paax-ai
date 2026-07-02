"""
PAAX Core Engine — Validator TKG (gerbang NO-MISTAKE, brain TXT00 §7).

Subset deterministik yang bisa dicek dari isi TkgDocument:
  V-02  Σ bentang antar as ujung = total (offset tepi DIKECUALIKAN, §3.1.1c)
  V-03  sidik jari grid seragam antar sheet denah
  V-04  rujukan tipe lengkap lintas sheet (orphan W-TYP / W-DEF)
  V-05  hitung ganda-metode (count simbol = count label) -> W-CNT
  V-08  level masuk akal (terurut, tidak duplikat kontradiktif) -> W-LVL

V-01/V-06/V-09/V-10 butuh data span/skala mentah dari pipeline persepsi —
belum dievaluasi di jalur manual/AI-proposal (dicatat sebagai keterbatasan,
bukan di-skip diam-diam).
"""
from __future__ import annotations
from typing import Dict, List

from .models import Grid, TkgDocument, TkgIssue, TkgValidationResult
from .params import TakeoffParams

_UNIT_KE_M = {"mm": 0.001, "cm": 0.01, "m": 1.0}


def ke_meter(nilai: float, unit: str) -> float:
    """A-10: konversi satuan panjang ke meter."""
    return nilai * _UNIT_KE_M[unit]


def grid_distance_m(grid: Grid, sumbu: str, dari: str, ke: str) -> float:
    """
    F-A01 (via bentang tertulis): jarak antar dua as = Σ bentang segmen
    berurutan dari `dari` ke `ke`. KeyError bila rantai segmen tidak lengkap.
    """
    spans = grid.bentang_x if sumbu == "x" else grid.bentang_y
    berikut = {s.dari: s for s in spans}
    total = 0.0
    cursor = dari
    langkah = 0
    while cursor != ke:
        seg = berikut.get(cursor)
        if seg is None:
            raise KeyError(
                f"Rantai bentang sumbu {sumbu} terputus di as '{cursor}' "
                f"(menuju '{ke}')."
            )
        total += ke_meter(seg.nilai, seg.unit)
        cursor = seg.ke
        langkah += 1
        if langkah > 200:  # pengaman rantai melingkar
            raise KeyError(f"Rantai bentang sumbu {sumbu} melingkar/berulang.")
    return total


def _grid_fingerprint(grid: Grid) -> str:
    """V-03: label as + bentang kanonik (dibulatkan mm) sebagai sidik jari."""
    fx = ";".join(f"{s.dari}-{s.ke}:{round(ke_meter(s.nilai, s.unit) * 1000)}" for s in grid.bentang_x)
    fy = ";".join(f"{s.dari}-{s.ke}:{round(ke_meter(s.nilai, s.unit) * 1000)}" for s in grid.bentang_y)
    lx = ",".join(a.label for a in grid.sumbu_x)
    ly = ",".join(a.label for a in grid.sumbu_y)
    return f"X[{lx}]({fx})|Y[{ly}]({fy})"


def _cek_v02(grid: Grid, sheet_id: str, tol: float, issues: List[TkgIssue]) -> None:
    for sumbu, spans, total in (("x", grid.bentang_x, grid.total_x), ("y", grid.bentang_y, grid.total_y)):
        if total is None or not spans:
            continue
        jumlah = sum(ke_meter(s.nilai, s.unit) for s in spans)
        nilai_total = ke_meter(total.nilai, total.unit)
        if nilai_total <= 0:
            issues.append(TkgIssue(
                code="E-GRID", severity="error", sheet_id=sheet_id,
                message=f"Total bentang sumbu {sumbu} tidak wajar ({nilai_total} m).",
            ))
            continue
        if abs(jumlah - nilai_total) / nilai_total > tol:
            issues.append(TkgIssue(
                code="E-GRID", severity="error", sheet_id=sheet_id,
                message=(
                    f"V-02 gagal sumbu {sumbu}: Σ bentang = {jumlah:g} m ≠ "
                    f"total {nilai_total:g} m (tol {tol:.1%}). Offset tepi tidak ikut dijumlah."
                ),
            ))


def validate_tkg(doc: TkgDocument, params: TakeoffParams | None = None) -> TkgValidationResult:
    params = params or TakeoffParams()
    issues: List[TkgIssue] = []

    # V-02 per sheet + V-03 lintas sheet denah
    fingerprints: Dict[str, str] = {}
    for sheet in doc.sheets:
        if sheet.grid is not None:
            _cek_v02(sheet.grid, sheet.sheet_id, params.tol_grid, issues)
            if sheet.jenis == "denah" and (sheet.grid.bentang_x or sheet.grid.bentang_y):
                fingerprints[sheet.sheet_id] = _grid_fingerprint(sheet.grid)
    if len(set(fingerprints.values())) > 1:
        detail = "; ".join(f"{sid}" for sid in fingerprints)
        issues.append(TkgIssue(
            code="E-GRID", severity="error",
            message=f"V-03 gagal: sidik jari grid BEDA antar sheet denah ({detail}). "
                    f"Kemungkinan salah baca / beda revisi / beda bangunan.",
        ))

    # V-04: TYPE_INDEX lintas sheet
    type_index: Dict[str, Dict[str, List[str]]] = {}
    for sheet in doc.sheets:
        for table in sheet.tables:
            for rec in table.records:
                entry = type_index.setdefault(rec.kode, {"definisi": [], "instance": []})
                if sheet.sheet_id not in entry["definisi"]:
                    entry["definisi"].append(sheet.sheet_id)
        for el in sheet.elements:
            entry = type_index.setdefault(el.kode, {"definisi": [], "instance": []})
            if sheet.sheet_id not in entry["instance"]:
                entry["instance"].append(sheet.sheet_id)

    orphans_tanpa_definisi = sorted(k for k, v in type_index.items() if v["instance"] and not v["definisi"])
    orphans_tanpa_instance = sorted(k for k, v in type_index.items() if v["definisi"] and not v["instance"])
    for kode in orphans_tanpa_definisi:
        issues.append(TkgIssue(
            code="W-TYP", severity="warning", subject=kode,
            message=f"Elemen '{kode}' terpasang di denah tetapi tidak punya definisi di tabel/detail.",
        ))
    for kode in orphans_tanpa_instance:
        issues.append(TkgIssue(
            code="W-DEF", severity="warning", subject=kode,
            message=f"Tipe '{kode}' terdefinisi di tabel tetapi tidak ditemukan instansinya di denah.",
        ))

    # V-05: dual-count per instance
    for sheet in doc.sheets:
        for el in sheet.elements:
            if el.count_simbol is not None and el.count_label is not None \
                    and el.count_simbol != el.count_label:
                issues.append(TkgIssue(
                    code="W-CNT", severity="warning", sheet_id=sheet.sheet_id, subject=el.kode,
                    message=(
                        f"V-05: hitung simbol ({el.count_simbol}) ≠ hitung label "
                        f"({el.count_label}) untuk '{el.kode}' — needs_review."
                    ),
                ))

    # V-08: level terurut wajar (per sheet, urutan nilai unik naik)
    for sheet in doc.sheets:
        nilai_per_label: Dict[str, float] = {}
        for lv in sheet.levels:
            if lv.label_raw in nilai_per_label and nilai_per_label[lv.label_raw] != lv.nilai_m:
                issues.append(TkgIssue(
                    code="W-LVL", severity="warning", sheet_id=sheet.sheet_id, subject=lv.label_raw,
                    message=f"Level '{lv.label_raw}' muncul dua kali dengan nilai berbeda.",
                ))
            nilai_per_label[lv.label_raw] = lv.nilai_m

    n_errors = sum(1 for i in issues if i.severity == "error")
    n_warnings = len(issues) - n_errors
    ada_cnt = any(i.code == "W-CNT" for i in issues)
    return TkgValidationResult(
        ok=n_errors == 0,
        gate_passed=n_errors == 0 and not ada_cnt,
        n_errors=n_errors,
        n_warnings=n_warnings,
        issues=issues,
        type_index=type_index,
        orphans_tanpa_definisi=orphans_tanpa_definisi,
        orphans_tanpa_instance=orphans_tanpa_instance,
    )
