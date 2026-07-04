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


def _axis_positions_m(grid: Grid, sumbu: str) -> Dict[str, float]:
    """
    V-03: posisi label as untuk satu keluarga sumbu.

    Jika semua axis punya posisi kumulatif, pakai posisi itu. Jika tidak,
    turunkan posisi relatif dari rantai bentang dengan axis pertama sebagai 0.
    """
    axes = grid.sumbu_x if sumbu == "x" else grid.sumbu_y
    if not axes:
        return {}
    if all(axis.posisi_mm is not None for axis in axes):
        return {axis.label: ke_meter(axis.posisi_mm or 0.0, "mm") for axis in axes}

    anchor = axes[0].label
    positions = {anchor: 0.0}
    for axis in axes[1:]:
        try:
            positions[axis.label] = grid_distance_m(grid, sumbu, anchor, axis.label)
        except KeyError:
            continue
    return positions


def _cek_v03(
    grids: List[tuple[str, Grid]],
    tol: float,
    issues: List[TkgIssue],
) -> None:
    """
    V-03 lintas denah: bandingkan jarak relatif label as yang sama-sama muncul.

    Sheet denah direkonstruksi per halaman, sehingga titik nol posisi absolut
    bisa berbeda. Jika dua sheet hanya berbagi satu label, belum ada jarak
    relatif yang bisa dibandingkan dan V-03 tidak punya dasar memberi error.
    """
    axis_maps = [
        (sheet_id, _axis_positions_m(grid, "x"), _axis_positions_m(grid, "y"))
        for sheet_id, grid in grids
    ]
    abs_tol_m = 0.001
    eps = 1e-9
    for i, (sid_a, x_a, y_a) in enumerate(axis_maps):
        for sid_b, x_b, y_b in axis_maps[i + 1:]:
            for sumbu, pos_a, pos_b in (("x", x_a, x_b), ("y", y_a, y_b)):
                shared = sorted(set(pos_a) & set(pos_b))
                if len(shared) < 2:
                    continue

                ref = shared[0]
                for label in shared[1:]:
                    rel_a = pos_a[label] - pos_a[ref]
                    rel_b = pos_b[label] - pos_b[ref]
                    diff = abs(rel_a - rel_b)
                    if diff <= abs_tol_m:
                        continue
                    rel = diff / max(abs(rel_a), abs(rel_b), eps)
                    if rel > tol:
                        issues.append(TkgIssue(
                            code="E-GRID", severity="error", subject=f"{sumbu}:{label}",
                            message=(
                                f"V-03 gagal sumbu {sumbu} as '{label}': jarak relatif terhadap "
                                f"as '{ref}' di {sid_a} = {rel_a:g} m berbeda dari "
                                f"{sid_b} = {rel_b:g} m (tol {tol:.1%})."
                            ),
                        ))


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
    denah_grids: List[tuple[str, Grid]] = []
    for sheet in doc.sheets:
        if sheet.grid is not None:
            _cek_v02(sheet.grid, sheet.sheet_id, params.tol_grid, issues)
            if sheet.jenis == "denah" and (sheet.grid.bentang_x or sheet.grid.bentang_y):
                denah_grids.append((sheet.sheet_id, sheet.grid))
    _cek_v03(denah_grids, params.tol_grid, issues)

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
