"""
PAAX Document Intelligence — Rekonstruksi grid as dari geometri (brain-00 §3.1.1).

Lapis KEDUA di samping notasi eksplisit "<as>-<as>=<nilai>" (assemble.py):
membaca bubble-as (lingkaran vektor berisi label As) + garis-dimensi (angka
antar-bubble) langsung dari geometri PDF — pola nyata pada gambar kerja,
berbeda dari notasi teks yang jarang dipakai di gambar sungguhan.

PENDEKATAN (digeneralisasi, BUKAN dituning ke satu proyek — §0.1 fixture
bukan template; diverifikasi analitis dulu terhadap PDF PLHUT SEBAGAI KUNCI
UJI sebelum ditulis, bukan ditebak):

1. Deteksi lingkaran vektor murni (`page.get_drawings()`): bbox persegi
   (aspek ~1:1) berisi HANYA kurva bezier ('c') ATAU poligon-garis rapat
   (>= 8 segmen 'l') — dua cara umum PDF merender lingkaran, supaya tidak
   terpaku ke satu exporter. Lingkaran lain (bukan bubble as, mis. penanda
   detail/potongan) OTOMATIS tersingkir di langkah 3 karena tidak sejajar
   dengan bubble lain manapun — bukan ditebak dari ukuran mutlak.
2. Ikat tiap lingkaran ke Run yang bbox-nya di dalam lingkaran -> label As.
   Label harus cocok pola label as (satu huruf ATAU satu-dua angka) —
   penanda lain (mis. label "-" atau multi-karakter) otomatis gugur.
3. Kelompokkan bubble yang SEJAJAR: cx sama -> keluarga "sumbu_x" (anggota
   berbeda cx, label biasanya angka 1,2,3..); cy sama -> keluarga "sumbu_y"
   (anggota berbeda cy, label biasanya huruf A,B,C..). Minimal 2 anggota
   sejajar supaya lolos — bubble tunggal/tak sejajar tersingkir alami.
4. Untuk tiap keluarga, cari Run angka murni (2-6 digit, dalam rentang
   DIMS_RANGE["bentang_as"]) di 'channel' tegak lurus arah keluarga.
   Baris (row) dikelompokkan via koordinat sekunder Run (chain-dimension
   bisa berlapis: bentang lokal vs total pada baris berbeda). Baris dengan
   jumlah anggota-dalam-rentang PALING DEKAT dengan jumlah pasangan-as
   (n-1) dipilih sebagai baris bentang; nilai di LUAR rentang bubble
   pertama..terakhir -> offset_tepi (§3.1.1c), TIDAK ikut penjumlahan total
   (mencegah alarm palsu ala AP-E-08).
5. Total HANYA diterima bila cocok penjumlahan bentang yang ditemukan
   (toleransi kecil) — tidak cocok -> dibiarkan None. Modul ini TIDAK PERNAH
   mengarang angka (selaras Aturan Emas §1: persepsi boleh usul, bukan
   memutuskan sepihak tanpa verifikasi silang aritmetika yang tersedia).

BELUM (dicatat jujur, bukan gap tersembunyi): garis-as itu sendiri (line
lurus panjang searah keluarga) TIDAK diverifikasi ulang di sini — deteksi
murni bertumpu pada bubble+label+dimensi-angka (cukup untuk GridAxis/
GridSpan/GridTotal kanonik); binding elemen->alamat grid (§5) TERPISAH,
belum diimplementasikan (di luar cakupan modul ini).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable

import fitz

from app.perception.locale import normalize_number
from app.perception.models import Run
from app.perception.params import DIMS_RANGE
from app.perception.tkg.models import Grid, GridAxis, GridSpan, GridTotal

_AXIS_LABEL_ALPHA = re.compile(r"^[A-Za-z]$")
_AXIS_LABEL_NUM = re.compile(r"^\d{1,2}$")
_NUMERIC_RUN = re.compile(r"^\d{2,6}(?:[.,]\d+)?$")

_ALIGN_TOL = 3.0
_CHANNEL_BAND = 200.0
_CHANNEL_MARGIN = 80.0
_TOTAL_TOLERANCE_REL = 0.01
_MIN_CIRCLE_LINE_SEGMENTS = 8

Rect = tuple[float, float, float, float]


@dataclass
class _Bubble:
    run_ids: list[str]
    label: str
    cx: float
    cy: float
    diameter: float


def _is_circle_drawing(items: list, rect: "fitz.Rect") -> bool:
    if rect.width <= 0 or rect.height <= 0:
        return False
    if abs(rect.width - rect.height) > max(rect.width, rect.height) * 0.15:
        return False
    kinds = {it[0] for it in items}
    if kinds == {"c"} and len(items) >= 3:
        return True
    if kinds == {"l"} and len(items) >= _MIN_CIRCLE_LINE_SEGMENTS:
        return True
    return False


def _detect_circle_rects(page: "fitz.Page") -> list[Rect]:
    rects: list[Rect] = []
    try:
        drawings = page.get_drawings()
    except Exception:
        return rects
    for d in drawings:
        items = d.get("items") or []
        if not items:
            continue
        if not _is_circle_drawing(items, d["rect"]):
            continue
        r = d["rect"]
        rects.append((r.x0, r.y0, r.x1, r.y1))
    return rects


def _run_center_inside(run: Run, rect: Rect) -> bool:
    x0, y0, x1, y1 = run.bbox
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx0, ry0, rx1, ry1 = rect
    return rx0 <= cx <= rx1 and ry0 <= cy <= ry1


def _detect_bubbles(page: "fitz.Page", runs: list[Run]) -> list[_Bubble]:
    bubbles: list[_Bubble] = []
    for rect in _detect_circle_rects(page):
        inside = [r for r in runs if _run_center_inside(r, rect)]
        if not inside:
            continue
        label = "".join(r.text.strip() for r in inside).strip()
        if not (_AXIS_LABEL_ALPHA.match(label) or _AXIS_LABEL_NUM.match(label)):
            continue
        x0, y0, x1, y1 = rect
        bubbles.append(_Bubble(
            run_ids=[r.run_id for r in inside],
            label=label,
            cx=(x0 + x1) / 2,
            cy=(y0 + y1) / 2,
            diameter=((x1 - x0) + (y1 - y0)) / 2,
        ))
    return _dominant_size_group(bubbles)


def _dominant_size_group(bubbles: list[_Bubble]) -> list[_Bubble]:
    """Bubble as SUNGGUHAN biasanya berulang banyak dengan diameter seragam
    di satu sheet; penanda lain (mis. rujukan detail/potongan) kebetulan bisa
    sejajar tapi JARANG punya ukuran sama dgn keluarga as yang sesungguhnya.
    Pilih kelompok ukuran (diameter dibulatkan 3pt) dengan anggota TERBANYAK
    supaya keluarga as asli tidak tercampur penanda lain yang kebetulan
    sejajar — bukan angka mutlak per proyek (§0.1)."""
    if not bubbles:
        return bubbles
    buckets: dict[float, list[_Bubble]] = {}
    for b in bubbles:
        key = round(b.diameter / 3.0) * 3.0
        buckets.setdefault(key, []).append(b)
    dominant = max(buckets.values(), key=len)
    return dominant


def _cluster(bubbles: list[_Bubble], coord: Callable[[_Bubble], float]) -> list[list[_Bubble]]:
    clusters: list[list[_Bubble]] = []
    for b in sorted(bubbles, key=coord):
        for cluster in clusters:
            if abs(coord(cluster[0]) - coord(b)) <= _ALIGN_TOL:
                cluster.append(b)
                break
        else:
            clusters.append([b])
    return [c for c in clusters if len(c) >= 2]


def _numeric_candidates(
    runs: list[Run], excluded: set[str], x0: float, x1: float, y0: float, y1: float,
) -> list[tuple[Run, float]]:
    out: list[tuple[Run, float]] = []
    for r in runs:
        if r.run_id in excluded:
            continue
        text = r.text.strip()
        if not _NUMERIC_RUN.match(text):
            continue
        rx0, ry0, rx1, ry1 = r.bbox
        rcx, rcy = (rx0 + rx1) / 2, (ry0 + ry1) / 2
        if not (x0 <= rcx <= x1 and y0 <= rcy <= y1):
            continue
        nilai = normalize_number(text)["nilai"]
        if nilai is None:
            continue
        out.append((r, nilai))
    return out


def _build_family(
    cluster: list[_Bubble],
    varies_in_x: bool,
    runs: list[Run],
    used_ids: set[str],
) -> tuple[list[GridAxis], list[GridSpan], GridTotal | None, list[GridSpan], set[str]]:
    primary: Callable[[_Bubble], float] = (lambda b: b.cx) if varies_in_x else (lambda b: b.cy)
    ordered = sorted(cluster, key=primary)
    consumed: set[str] = set()
    for b in ordered:
        consumed.update(b.run_ids)

    p_min, p_max = primary(ordered[0]), primary(ordered[-1])
    sec0 = (ordered[0].cy if varies_in_x else ordered[0].cx)

    if varies_in_x:
        x0, x1 = p_min - _CHANNEL_MARGIN, p_max + _CHANNEL_MARGIN
        y0, y1 = sec0 - _CHANNEL_BAND, sec0 + _CHANNEL_BAND
    else:
        x0, x1 = sec0 - _CHANNEL_BAND, sec0 + _CHANNEL_BAND
        y0, y1 = p_min - _CHANNEL_MARGIN, p_max + _CHANNEL_MARGIN

    candidates = _numeric_candidates(runs, used_ids | consumed, x0, x1, y0, y1)

    lo, hi = DIMS_RANGE["bentang_as"]
    def cand_primary(run: Run) -> float:
        bx0, by0, bx1, by1 = run.bbox
        return (bx0 + bx1) / 2 if varies_in_x else (by0 + by1) / 2

    def cand_secondary_key(run: Run) -> float:
        bx0, by0, bx1, by1 = run.bbox
        return round(((by0 + by1) / 2 if varies_in_x else (bx0 + bx1) / 2) / 5.0)

    all_candidates = [(r, v, cand_primary(r)) for r, v in candidates]

    rows: dict[float, list[tuple[Run, float, float]]] = {}
    for r, v, p in all_candidates:
        rows.setdefault(cand_secondary_key(r), []).append((r, v, p))

    # baris bentang dipilih HANYA dari kandidat dlm rentang wajar 1 bentang
    # (DIMS_RANGE); TOTAL sengaja TIDAK dibatasi rentang ini karena total
    # bentang gabungan wajar melebihi 1 bentang tunggal.
    n_pairs = len(ordered) - 1
    best_row: list[tuple[Run, float, float]] = []
    best_diff: int | None = None
    for row in rows.values():
        row_in_range = [x for x in row if p_min - 1 <= x[2] <= p_max + 1 and lo <= x[1] <= hi]
        diff = abs(len(row_in_range) - n_pairs)
        if best_diff is None or diff < best_diff:
            best_diff = diff
            best_row = row

    spans: list[GridSpan] = []
    offsets: list[GridSpan] = []
    slot_used: set[str] = set()
    for i in range(n_pairs):
        lo_p, hi_p = primary(ordered[i]), primary(ordered[i + 1])
        slot_matches = [
            x for x in best_row
            if lo_p - 1 <= x[2] <= hi_p + 1 and lo <= x[1] <= hi and x[0].run_id not in slot_used
        ]
        if len(slot_matches) == 1:
            r, v, _p = slot_matches[0]
            spans.append(GridSpan(dari=ordered[i].label, ke=ordered[i + 1].label, nilai=v, raw=r.text.strip()))
            consumed.add(r.run_id)
            slot_used.add(r.run_id)

    for r, v, p in best_row:
        if r.run_id in slot_used:
            continue
        if p < p_min:
            offsets.append(GridSpan(dari="tepi", ke=ordered[0].label, nilai=v, raw=r.text.strip()))
            consumed.add(r.run_id)
        elif p > p_max:
            offsets.append(GridSpan(dari=ordered[-1].label, ke="tepi", nilai=v, raw=r.text.strip()))
            consumed.add(r.run_id)

    total: GridTotal | None = None
    if spans:
        span_sum = sum(s.nilai for s in spans)
        for row in rows.values():
            if row is best_row:
                continue
            row_in_range = [x for x in row if p_min - 1 <= x[2] <= p_max + 1]
            if len(row_in_range) == 1:
                r, v, _p = row_in_range[0]
                if abs(v - span_sum) <= max(span_sum * _TOTAL_TOLERANCE_REL, 1.0):
                    total = GridTotal(dari=ordered[0].label, ke=ordered[-1].label, nilai=v, raw=r.text.strip())
                    consumed.add(r.run_id)
                    break

    span_by_pair = {(s.dari, s.ke): s.nilai for s in spans}
    axes: list[GridAxis] = [GridAxis(label=ordered[0].label, posisi_mm=0.0)]
    posisi = 0.0
    chain_intact = True
    for i in range(1, len(ordered)):
        key = (ordered[i - 1].label, ordered[i].label)
        if chain_intact and key in span_by_pair:
            posisi += span_by_pair[key]
            axes.append(GridAxis(label=ordered[i].label, posisi_mm=posisi))
        else:
            chain_intact = False
            axes.append(GridAxis(label=ordered[i].label, posisi_mm=None))

    return axes, spans, total, offsets, consumed


def reconstruct_grid_from_geometry(
    page: "fitz.Page", runs: list[Run],
) -> tuple[Grid | None, set[str]]:
    """Kembalikan (Grid, used_run_ids) dari bubble+garis-dimensi, atau
    (None, set()) bila tidak ada pola bubble-as yang sejajar (>=2 anggota)."""
    bubbles = _detect_bubbles(page, runs)
    if len(bubbles) < 2:
        return None, set()

    used_ids: set[str] = set()
    sumbu_x: list[GridAxis] = []
    sumbu_y: list[GridAxis] = []
    bentang_x: list[GridSpan] = []
    bentang_y: list[GridSpan] = []
    total_x: GridTotal | None = None
    total_y: GridTotal | None = None
    offset_tepi: list[GridSpan] = []

    for cluster in _cluster(bubbles, lambda b: b.cy):  # sejajar-y -> keluarga sumbu_x
        axes, spans, total, offsets, consumed = _build_family(cluster, True, runs, used_ids)
        sumbu_x.extend(axes)
        bentang_x.extend(spans)
        offset_tepi.extend(offsets)
        total_x = total or total_x
        used_ids |= consumed

    for cluster in _cluster(bubbles, lambda b: b.cx):  # sejajar-x -> keluarga sumbu_y
        axes, spans, total, offsets, consumed = _build_family(cluster, False, runs, used_ids)
        sumbu_y.extend(axes)
        bentang_y.extend(spans)
        offset_tepi.extend(offsets)
        total_y = total or total_y
        used_ids |= consumed

    if not sumbu_x and not sumbu_y:
        return None, set()

    grid = Grid(
        sumbu_x=sumbu_x, sumbu_y=sumbu_y,
        bentang_x=bentang_x, bentang_y=bentang_y,
        total_x=total_x, total_y=total_y,
        offset_tepi=offset_tepi,
    )
    return grid, used_ids
