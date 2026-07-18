"""Fase C (rencana besar 2026-07-05) — test `binding.bind_alamat` (§5).

Unit test murni pada fungsi binding (tanpa perlu generate PDF) supaya cepat
+ mudah menutup semua kombinasi kasus; fixture PDF sintetis independen sudah
ada di `test_perception_grid_geometry.py` (P3-geometri) yang jadi sumber
`axis_points` di produksi -- di sini fokus ke logika bind_alamat itu sendiri.
"""
from __future__ import annotations

from app.perception.binding import bind_alamat

# keluarga angka (mis. "sumbu_x" grid_geometry) sengaja diberi jarak TIDAK rata
# (142/57/85) meniru pola nyata PLHUT -- membuktikan toleransi tidak hardcode
# ke satu jarak-antar-as tertentu.
AXIS_X = {"1": 377.0, "2": 519.0, "3": 576.0, "4": 661.0}
AXIS_Y = {"A": 312.0, "B": 426.0, "C": 539.0, "D": 652.0, "E": 766.0, "F": 879.0}


def _bbox_at(cx: float, cy: float, w: float = 10.0, h: float = 10.0):
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


def test_clean_intersection_alpha_first():
    alamat, needs_review = bind_alamat(_bbox_at(377.0, 312.0), AXIS_X, AXIS_Y)
    assert alamat == "A1"
    assert needs_review is False


def test_clean_intersection_tolerates_label_offset_from_symbol():
    """Label elemen sungguhan digeser ~30-35pt dari posisi as asli (temuan
    nyata sesi ini) -- harus TETAP terikat rapi, bukan salah dianggap offset."""
    alamat, needs_review = bind_alamat(_bbox_at(377.0 + 34.7, 312.0 + 15.0), AXIS_X, AXIS_Y)
    assert alamat == "A1"
    assert needs_review is False


def test_offset_before_first_numeric_axis():
    """Elemen di luar rentang angka (sebelum '1') tapi di dalam rentang huruf
    ('B') -> alamat huruf + offset ke as angka acuan, PERSIS pola PLHUT nyata
    'B-offset_sebelum_1' (bukan ditebak arah atas/bawah visual)."""
    alamat, needs_review = bind_alamat(_bbox_at(306.0, 426.0), AXIS_X, AXIS_Y)
    assert alamat == "B-offset_sebelum_1"
    assert needs_review is False


def test_offset_after_last_numeric_axis():
    alamat, needs_review = bind_alamat(_bbox_at(730.0, 539.0), AXIS_X, AXIS_Y)
    assert alamat == "C-offset_sesudah_4"
    assert needs_review is False


def test_offset_after_last_alpha_axis():
    """Simetris: kalau yang di luar rentang justru keluarga HURUF, huruf tepi
    tetap tampil sbg acuan offset, angka yg valid tetap di depan (huruf dulu)."""
    alamat, needs_review = bind_alamat(_bbox_at(519.0, 950.0), AXIS_X, AXIS_Y)
    assert alamat == "F-offset_sesudah_2"
    assert needs_review is False


def test_offset_before_first_alpha_axis():
    alamat, needs_review = bind_alamat(_bbox_at(576.0, 200.0), AXIS_X, AXIS_Y)
    assert alamat == "A-offset_sebelum_3"
    assert needs_review is False


def test_both_out_of_range_flags_needs_review():
    alamat, needs_review = bind_alamat(_bbox_at(50.0, 50.0), AXIS_X, AXIS_Y)
    assert needs_review is True
    assert "perlu verifikasi" in alamat


def test_no_grid_available_returns_honest_message():
    alamat, needs_review = bind_alamat(_bbox_at(400.0, 400.0), {}, {})
    assert needs_review is True
    assert "grid tidak tersedia" in alamat


def test_view_boundary_guard():
    axis_x = {"1": 100.0, "3": 410.0}
    axis_y = {"A": 100.0, "B": 200.0}
    
    views = [
        {"bbox": (0.0, 0.0, 400.0, 400.0), "view_id": "view_1"},
        {"bbox": (405.0, 0.0, 800.0, 400.0), "view_id": "view_2"}
    ]
    
    # Element at x=390 is in view_1. Sumbu "3" (410) is in view_2, so it shouldn't be matched.
    # It must fallback to Sumbu "1" (100) inside view_1.
    alamat, needs_review = bind_alamat(_bbox_at(390.0, 100.0), axis_x, axis_y, views=views)
    assert "1" in alamat
    assert "3" not in alamat


def test_table_boundary_crossing():
    axis_x = {"1": 300.0}
    axis_y = {"A": 150.0}
    table_bboxes = [(200.0, 100.0, 250.0, 200.0)]
    
    alamat, needs_review = bind_alamat(_bbox_at(150.0, 150.0), axis_x, axis_y, table_bboxes=table_bboxes)
    assert needs_review is True
    assert "tidak dapat diikat melewati tabel" in alamat

