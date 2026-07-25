"""
PAAX Document Intelligence — Label->grid binding + notasi offset (brain-00
§5, Fase C rencana besar 2026-07-05: `docs/plans/
PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`).

Mengikat posisi bbox tiap elemen ke alamat grid NYATA:
- Di dalam rentang KEDUA keluarga as (huruf & angka) -> alamat gabungan
  "A1", "B3" (huruf dulu baru angka, konvensi gambar kerja Indonesia) via
  as TERDEKAT -- BUKAN mensyaratkan pas persis di garis as. Alasan (temuan
  nyata dari verifikasi PDF PLHUT sesi ini): teks label elemen HAMPIR SELALU
  digeser dari simbol/posisi asli elemen (~30-35pt di PDF asli) supaya tidak
  menimpa simbol/garis as -- mensyaratkan jarak sangat dekat ke garis as
  salah mengklasifikasi elemen yang justru tepat di grid.
- Di luar rentang SATU keluarga as (offset tepi, §3.1.1c) -> alamat huruf
  (atau angka bila yang di luar rentang justru keluarga huruf) digabung
  "-offset_{sebelum|sesudah}_{as_acuan_terluar}". Arah dihitung dari URUTAN
  as (sebelum/sesudah dlm rantai posisi), BUKAN "atas/bawah" visual -- supaya
  benar apa pun orientasi/rotasi halaman (§0.1: harus generalisasi).
- Di luar rentang KEDUA keluarga sekaligus -> tetap dilaporkan (estimasi
  terdekat) TAPI ditandai `needs_review=True` (INV-TKG-02 zero-loss: tidak
  pernah dibuang, tidak pernah dipalsukan jadi alamat pasti tanpa dasar).

PENTING: modul ini HANYA bekerja bila `axis_points` (posisi titik PDF asli
dari `grid_geometry.py`) tersedia -- grid yang HANYA berasal dari notasi
teks (`_extract_grid_from_notation`) tidak punya posisi titik nyata utk
dibandingkan ke bbox elemen, jadi binding tidak mungkin dilakukan (dilaporkan
jujur, bukan ditebak).
"""
from __future__ import annotations

_RANGE_TOLERANCE_FRACTION = 0.4
_MIN_TOLERANCE_PT = 1.0


def _typical_spacing(axis_points: dict[str, float]) -> float:
    values = sorted(axis_points.values())
    if len(values) < 2:
        return 0.0
    diffs = [values[i + 1] - values[i] for i in range(len(values) - 1)]
    return sum(diffs) / len(diffs)


def _nearest(point: float, axis_points: dict[str, float]) -> tuple[str, float]:
    label = min(axis_points, key=lambda l: abs(point - axis_points[l]))
    return label, point - axis_points[label]


def _is_alpha(label: str) -> bool:
    return label.isalpha()


def _format_pair(label_a: str, label_b: str) -> str:
    """Alamat gabungan SELALU huruf dulu baru angka, apa pun yang kebetulan
    jadi sumbu_x/sumbu_y di gambar ybs."""
    return f"{label_a}{label_b}" if _is_alpha(label_a) else f"{label_b}{label_a}"


def _format_offset(in_range_label: str, edge_label: str, arah: str) -> str:
    if _is_alpha(in_range_label):
        return f"{in_range_label}-offset_{arah}_{edge_label}"
    return f"{edge_label}-offset_{arah}_{in_range_label}"


def _edge_and_direction(value: float, axis_points: dict[str, float]) -> tuple[str, str]:
    if value < min(axis_points.values()):
        return min(axis_points, key=lambda l: axis_points[l]), "sebelum"
    return max(axis_points, key=lambda l: axis_points[l]), "sesudah"


def _line_intersect(p1: tuple[float, float], p2: tuple[float, float], p3: tuple[float, float], p4: tuple[float, float]) -> bool:
    """Return True if segment p1-p2 intersects segment p3-p4."""
    def ccw(A, B, C):
        return (C[1]-A[1]) * (B[0]-A[0]) > (B[1]-A[1]) * (C[0]-A[0])
    return ccw(p1,p3,p4) != ccw(p2,p3,p4) and ccw(p1,p2,p3) != ccw(p1,p2,p4)


def _crosses_table(p1: tuple[float, float], p2: tuple[float, float], table_bboxes: list[tuple[float, float, float, float]]) -> bool:
    for tx0, ty0, tx1, ty1 in table_bboxes:
        # Check all 4 edges of the table bounding box
        t_edges = [
            ((tx0, ty0), (tx1, ty0)),
            ((tx1, ty0), (tx1, ty1)),
            ((tx1, ty1), (tx0, ty1)),
            ((tx0, ty1), (tx0, ty0))
        ]
        for p3, p4 in t_edges:
            if _line_intersect(p1, p2, p3, p4):
                return True
    return False


def bind_alamat(
    bbox: tuple[float, float, float, float],
    axis_points_x: dict[str, float],
    axis_points_y: dict[str, float],
    views: list[any] | None = None,
    table_bboxes: list[tuple[float, float, float, float]] | None = None,
) -> tuple[str, bool]:
    """Kembalikan (alamat, needs_review)."""
    if not axis_points_x or not axis_points_y:
        return "grid tidak tersedia di sheet ini", True

    cx = (bbox[0] + bbox[2]) / 2
    cy = (bbox[1] + bbox[3]) / 2

    # View Boundary Guard & Legend/Title Block isolation
    if views:
        elem_view = None
        for v in views:
            v_bbox = getattr(v, "bbox", None) or (v.get("bbox") if isinstance(v, dict) else None)
            if v_bbox:
                vx0, vy0, vx1, vy1 = v_bbox
                if vx0 <= cx <= vx1 and vy0 <= cy <= vy1:
                    elem_view = v
                    break
        if elem_view:
            v_bbox = getattr(elem_view, "bbox", None) or (elem_view.get("bbox") if isinstance(elem_view, dict) else None)
            vx0, vy0, vx1, vy1 = v_bbox
            # Keep only axis lines that reside within this element's view bounds
            axis_points_x = {l: val for l, val in axis_points_x.items() if vx0 <= val <= vx1}
            axis_points_y = {l: val for l, val in axis_points_y.items() if vy0 <= val <= vy1}
            
            if not axis_points_x or not axis_points_y:
                return "grid tidak tersedia di view ini", True

    label_x, coord_x_diff = _nearest(cx, axis_points_x)
    label_y, coord_y_diff = _nearest(cy, axis_points_y)
    
    coord_x = cx - coord_x_diff
    coord_y = cy - coord_y_diff

    # Table Boundary Guard: check if the link path crosses a table
    if table_bboxes:
        if _crosses_table((cx, cy), (coord_x, coord_y), table_bboxes):
            return "tidak dapat diikat melewati tabel", True

    tol_x = max(_typical_spacing(axis_points_x) * _RANGE_TOLERANCE_FRACTION, _MIN_TOLERANCE_PT)
    tol_y = max(_typical_spacing(axis_points_y) * _RANGE_TOLERANCE_FRACTION, _MIN_TOLERANCE_PT)

    x_min, x_max = min(axis_points_x.values()), max(axis_points_x.values())
    y_min, y_max = min(axis_points_y.values()), max(axis_points_y.values())

    x_in_range = x_min - tol_x <= cx <= x_max + tol_x
    y_in_range = y_min - tol_y <= cy <= y_max + tol_y

    if x_in_range and y_in_range:
        return _format_pair(label_x, label_y), False

    if x_in_range and not y_in_range:
        edge_label, arah = _edge_and_direction(cy, axis_points_y)
        return _format_offset(label_x, edge_label, arah), False

    if y_in_range and not x_in_range:
        edge_label, arah = _edge_and_direction(cx, axis_points_x)
        return _format_offset(label_y, edge_label, arah), False

    return f"dekat {_format_pair(label_x, label_y)} (perlu verifikasi)", True

