"""
PAAX Document Intelligence — Penyatuan fragmen span (RULE-EXT-03, Fase 2 P1).

PDF sering memecah satu angka/label menjadi beberapa span ("1","0","0","0" ->
"1000"). Gabungkan span yang SEARAH ROTASI, SEBARIS (baseline sama dalam
toleransi), dan BERDEKATAN (celah < ambang proporsional tinggi huruf) —
SEBELUM parsing grammar (P2). Simpan raw per-span DAN hasil gabungan. Span
dari sumber (`method`) berbeda TIDAK PERNAH digabung dalam satu Run (supaya
TKG tidak mencampur fakta vektor dan OCR raster).
"""
from __future__ import annotations

from app.perception.models import Run, TextSpan

_VERTICAL_ROTASI = (90, 270)


def _baseline_coord(span: TextSpan) -> float:
    return span.origin[0] if span.rotasi in _VERTICAL_ROTASI else span.origin[1]


def _reading_start(span: TextSpan) -> float:
    return span.bbox[1] if span.rotasi in _VERTICAL_ROTASI else span.bbox[0]


def _reading_end(span: TextSpan) -> float:
    return span.bbox[3] if span.rotasi in _VERTICAL_ROTASI else span.bbox[2]


def _union_bbox(spans: list[TextSpan]) -> tuple[float, float, float, float]:
    x0 = min(s.bbox[0] for s in spans)
    y0 = min(s.bbox[1] for s in spans)
    x1 = max(s.bbox[2] for s in spans)
    y1 = max(s.bbox[3] for s in spans)
    return (x0, y0, x1, y1)


def merge_runs(
    spans: list[TextSpan],
    *,
    tol_baseline: float | None = None,
    gap_factor: float = 0.6,
) -> list[Run]:
    """RULE-EXT-03: kelompokkan span jadi Run sebelum grammar memprosesnya."""
    if not spans:
        return []

    # Kelompokkan per (method, rotasi, line_hint) — DILARANG gabung lintas
    # sumber/arah, dan DILARANG gabung lintas baris visual asli (line_hint
    # dari PyMuPDF, otentik). Baseline-tolerance di bawah HANYA memutuskan
    # penggabungan FRAGMEN dalam satu baris yang sama, bukan menggantikan
    # segmentasi baris (itu rawan salah gabung baris tabel yang berdekatan —
    # lihat catatan `line_hint` di app/perception/models.py).
    groups: dict[tuple[str, int, int], list[TextSpan]] = {}
    for sp in spans:
        groups.setdefault((sp.method, sp.rotasi, sp.line_hint), []).append(sp)

    runs: list[Run] = []
    run_counter = 0
    for group_spans in groups.values():
        ordered = sorted(group_spans, key=lambda s: (round(_baseline_coord(s), 1), _reading_start(s)))

        current: list[TextSpan] = [ordered[0]]
        for nxt in ordered[1:]:
            prev = current[-1]
            font = (prev.font_size + nxt.font_size) / 2 or 1.0
            tol = tol_baseline if tol_baseline is not None else 0.5 * font
            baseline_diff = abs(_baseline_coord(nxt) - _baseline_coord(prev))
            gap = _reading_start(nxt) - _reading_end(prev)

            merge_threshold = gap_factor * font
            ragu_upper = 2 * merge_threshold

            sebaris = baseline_diff <= 2 * tol
            # Gap negatif besar = span TIDAK dalam urutan baca wajar (bukan
            # fragmen sungguhan) -> tolak. Overlap kecil (kerning/rounding)
            # tetap diizinkan via slack -0.5*font.
            berdekatan = -0.5 * font <= gap <= ragu_upper

            if sebaris and berdekatan:
                current.append(nxt)
            else:
                runs.append(_build_run(current, run_counter, gap_factor))
                run_counter += 1
                current = [nxt]
        runs.append(_build_run(current, run_counter, gap_factor))
        run_counter += 1

    return runs


def _build_run(members: list[TextSpan], index: int, gap_factor: float) -> Run:
    ragu = False
    for i in range(1, len(members)):
        prev, nxt = members[i - 1], members[i]
        font = (prev.font_size + nxt.font_size) / 2 or 1.0
        gap = _reading_start(nxt) - _reading_end(prev)
        merge_threshold = gap_factor * font
        if gap > merge_threshold:
            ragu = True
    text = "".join(s.text for s in members)
    return Run(
        run_id=f"run-{index:04d}",
        text=text,
        spans=members,
        bbox=_union_bbox(members),
        rotasi=members[0].rotasi,
        method=members[0].method,
        confidence=min(s.confidence for s in members),
        ragu=ragu,
    )
