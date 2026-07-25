"""
PAAX Document Intelligence — Ekstraksi geometri dinding dari polygon.
"""
from __future__ import annotations

import math
import statistics
from dataclasses import dataclass

import fitz

from app.perception.tkg.models import Grid
from app.perception.vector.grid_geometry import _is_circle_drawing

@dataclass
class WallSegment:
    x0: float
    y0: float
    x1: float
    y1: float
    length_px: float


def _get_scale_mm_per_px(grid: Grid | None, axis_points: dict[str, dict[str, float]]) -> float | None:
    """Mengestimasi skala mm/px dari rentang Grid dan axis_points."""
    if not grid or not axis_points:
        return None
    scales = []
    
    for span in grid.bentang_x:
        x_pts = axis_points.get("x", {})
        if span.dari in x_pts and span.ke in x_pts:
            px_dist = abs(x_pts[span.ke] - x_pts[span.dari])
            if px_dist > 1.0:
                scales.append(span.nilai / px_dist)
                
    for span in grid.bentang_y:
        y_pts = axis_points.get("y", {})
        if span.dari in y_pts and span.ke in y_pts:
            px_dist = abs(y_pts[span.ke] - y_pts[span.dari])
            if px_dist > 1.0:
                scales.append(span.nilai / px_dist)
                
    if not scales:
        return None
    return statistics.median(scales)


def detect_wall_polygons(
    page: fitz.Page, grid: Grid | None, axis_points: dict[str, dict[str, float]]
) -> tuple[float | None, bool, str]:
    """
    Ekstrak total panjang dinding dari segmen garis polygon, dengan deduplikasi.
    Return: (total_length_m, needs_review, reason)
    """
    scale_mm_per_px = _get_scale_mm_per_px(grid, axis_points)
    if scale_mm_per_px is None:
        return None, True, "skala tidak diketahui (grid tidak ditemukan)"

    segments: list[WallSegment] = []
    try:
        drawings = page.get_drawings()
    except Exception:
        return None, True, "gagal membaca drawings dari halaman"

    for d in drawings:
        items = d.get("items") or []
        if not items:
            continue
        
        # Abaikan lingkaran
        if _is_circle_drawing(items, d["rect"]):
            continue
            
        # Ekstrak garis
        for item in items:
            if item[0] == "l":
                p1, p2 = item[1], item[2]
                dx = p2.x - p1.x
                dy = p2.y - p1.y
                length = math.hypot(dx, dy)
                if length > 5.0: # Abaikan garis sangat pendek (noise)
                    segments.append(WallSegment(p1.x, p1.y, p2.x, p2.y, length))
            elif item[0] == "re":
                r = item[1]
                lines = [
                    (r.x0, r.y0, r.x1, r.y0),
                    (r.x1, r.y0, r.x1, r.y1),
                    (r.x1, r.y1, r.x0, r.y1),
                    (r.x0, r.y1, r.x0, r.y0),
                ]
                for x0, y0, x1, y1 in lines:
                    dx = x1 - x0
                    dy = y1 - y0
                    length = math.hypot(dx, dy)
                    if length > 5.0:
                        segments.append(WallSegment(x0, y0, x1, y1, length))

    if not segments:
        return 0.0, False, "tidak ada geometri dinding ditemukan"

    # RENCANA DEDUPLIKASI:
    # 1. Representasikan setiap segmen sebagai vektor arah unit (u) dan jarak ke origin (rho).
    # 2. Dua segmen dianggap kolinear (bisa overlap) jika arahnya mirip (< 5 derajat) 
    #    dan jaraknya berdekatan (selisih rho <= ketebalan dinding maksimum, misal 200mm).
    #    Untuk menoleransi arah terbalik, pastikan vektor u selalu menghadap kuadran positif.
    # 3. Kelompokkan segmen ke dalam "bucket" kolinear.
    # 4. Dalam setiap bucket, proyeksikan titik ujung ke garis 1D (koordinat t).
    # 5. Lakukan merge interval [t_start, t_end] pada koordinat t.
    # 6. Total panjang didapat dari penjumlahan panjang interval yang sudah dimerge.

    TOLERANCE_ANGLE_RAD = math.radians(5.0)
    # Toleransi jarak antar dinding (misal ketebalan dinding bata + plester = 150mm - 200mm)
    # Kita pakai 300mm agar lebih aman menangkap sisi dalam dan luar
    TOLERANCE_RHO_PX = 300.0 / scale_mm_per_px 
    
    buckets: list[list[WallSegment]] = []
    
    for seg in segments:
        dx = seg.x1 - seg.x0
        dy = seg.y1 - seg.y0
        
        # Normalisasi arah u
        u_x = dx / seg.length_px
        u_y = dy / seg.length_px
        
        # Pastikan u selalu menghadap positif X (atau Y positif jika vertikal)
        if u_x < -1e-5 or (abs(u_x) <= 1e-5 and u_y < 0):
            u_x, u_y = -u_x, -u_y
            
        n_x, n_y = -u_y, u_x
        rho = seg.x0 * n_x + seg.y0 * n_y
        
        # Cari bucket yang cocok
        matched_bucket = None
        for bucket in buckets:
            ref_seg = bucket[0]
            r_dx = ref_seg.x1 - ref_seg.x0
            r_dy = ref_seg.y1 - ref_seg.y0
            r_ux = r_dx / ref_seg.length_px
            r_uy = r_dy / ref_seg.length_px
            if r_ux < -1e-5 or (abs(r_ux) <= 1e-5 and r_uy < 0):
                r_ux, r_uy = -r_ux, -r_uy
            r_nx, r_ny = -r_uy, r_ux
            r_rho = ref_seg.x0 * r_nx + ref_seg.y0 * r_ny
            
            # Dot product untuk sudut
            dot = u_x * r_ux + u_y * r_uy
            # clamp to [-1, 1] for acos
            dot = max(-1.0, min(1.0, dot))
            angle = math.acos(dot)
            
            # Jika u_x, u_y terbalik persis, dot = -1 -> angle = pi (tidak mungkin terjadi karena u dinormalisasi)
            if angle <= TOLERANCE_ANGLE_RAD and abs(rho - r_rho) <= TOLERANCE_RHO_PX:
                matched_bucket = bucket
                break
                
        if matched_bucket is not None:
            matched_bucket.append(seg)
        else:
            buckets.append([seg])
            
    # Merge intervals
    total_length_px = 0.0
    for bucket in buckets:
        intervals = []
        # Gunakan referensi arah dari elemen pertama
        ref_seg = bucket[0]
        r_dx = ref_seg.x1 - ref_seg.x0
        r_dy = ref_seg.y1 - ref_seg.y0
        r_ux = r_dx / ref_seg.length_px
        r_uy = r_dy / ref_seg.length_px
        if r_ux < -1e-5 or (abs(r_ux) <= 1e-5 and r_uy < 0):
            r_ux, r_uy = -r_ux, -r_uy
            
        for seg in bucket:
            t0 = seg.x0 * r_ux + seg.y0 * r_uy
            t1 = seg.x1 * r_ux + seg.y1 * r_uy
            if t0 > t1:
                t0, t1 = t1, t0
            intervals.append([t0, t1])
            
        # Sort by start point
        intervals.sort(key=lambda x: x[0])
        
        merged = []
        for interval in intervals:
            if not merged:
                merged.append(interval)
            else:
                last = merged[-1]
                # Overlap atau nyambung (dengan toleransi gap kecil misal 5px)
                if interval[0] <= last[1] + 5.0:
                    last[1] = max(last[1], interval[1])
                else:
                    merged.append(interval)
                    
        for m in merged:
            total_length_px += (m[1] - m[0])
            
    total_length_m = (total_length_px * scale_mm_per_px) / 1000.0
    
    return total_length_m, False, f"dihitung dari deduplikasi geometri ({len(buckets)} dinding)"
