"""
PAAX Document Intelligence — Ekstraksi geometri simbol kusen dan MEP.
"""
from __future__ import annotations

from dataclasses import dataclass

import fitz

@dataclass
class _SymbolCluster:
    bbox: tuple[float, float, float, float]
    items: list[tuple]


def _rect_intersect_or_close(r1: tuple[float, float, float, float], r2: tuple[float, float, float, float], tol: float = 2.0) -> bool:
    x0 = max(r1[0] - tol, r2[0] - tol)
    y0 = max(r1[1] - tol, r2[1] - tol)
    x1 = min(r1[2] + tol, r2[2] + tol)
    y1 = min(r1[3] + tol, r2[3] + tol)
    return x0 <= x1 and y0 <= y1


def _cluster_drawings(page: fitz.Page) -> list[_SymbolCluster]:
    try:
        drawings = page.get_drawings()
    except Exception:
        return []

    clusters: list[_SymbolCluster] = []
    
    for d in drawings:
        items = d.get("items") or []
        if not items:
            continue
            
        r = d["rect"]
        r_tup = (r.x0, r.y0, r.x1, r.y1)
        
        # Cari cluster yang overlap atau dekat
        matched = []
        for c in clusters:
            if _rect_intersect_or_close(c.bbox, r_tup):
                matched.append(c)
                
        if not matched:
            clusters.append(_SymbolCluster(bbox=r_tup, items=items))
        else:
            # Gabungkan dengan cluster pertama yang cocok
            first = matched[0]
            nx0 = min(first.bbox[0], r_tup[0])
            ny0 = min(first.bbox[1], r_tup[1])
            nx1 = max(first.bbox[2], r_tup[2])
            ny1 = max(first.bbox[3], r_tup[3])
            first.bbox = (nx0, ny0, nx1, ny1)
            first.items.extend(items)
            
            # Jika menabrak lebih dari satu cluster, gabungkan semuanya
            for other in matched[1:]:
                nx0 = min(first.bbox[0], other.bbox[0])
                ny0 = min(first.bbox[1], other.bbox[1])
                nx1 = max(first.bbox[2], other.bbox[2])
                ny1 = max(first.bbox[3], other.bbox[3])
                first.bbox = (nx0, ny0, nx1, ny1)
                first.items.extend(other.items)
                clusters.remove(other)

    return clusters


def count_door_window_symbols(page: fitz.Page) -> dict[str, int]:
    """Menghitung jumlah simbol arc_door dan rect_window di halaman."""
    clusters = _cluster_drawings(page)
    
    counts = {"arc_door": 0, "rect_window": 0}
    
    for c in clusters:
        w = c.bbox[2] - c.bbox[0]
        h = c.bbox[3] - c.bbox[1]
        
        if w <= 5 or h <= 5: # Terlalu kecil untuk kusen
            continue
            
        if w > 200 or h > 200: # Terlalu besar
            continue

        has_curve = False
        has_lines = False
        has_rect = False
        line_count = 0
        
        for item in c.items:
            if item[0] == "c":
                has_curve = True
            elif item[0] == "l":
                has_lines = True
                line_count += 1
            elif item[0] == "re":
                has_rect = True
                
        # Heuristik Pintu: Ada curve (arc swing pintu) dan garis (daun pintu/kusen)
        if has_curve and has_lines:
            counts["arc_door"] += 1
            continue
            
        # Heuristik Jendela: Tidak ada curve, ada rect dan inner lines, atau banyak garis membentuk rect + dalam
        if not has_curve and (has_rect and has_lines) or (not has_curve and line_count >= 5):
            # Pastikan aspect ratio masuk akal untuk jendela (tidak garis panjang sekali)
            if 0.1 <= w/h <= 10.0:
                counts["rect_window"] += 1
                
    return counts


def count_symbols_near_legend(page: fitz.Page, legend_symbol_bbox: tuple[float, float, float, float]) -> int:
    """Menghitung simbol di halaman yang mirip dengan simbol di legenda."""
    clusters = _cluster_drawings(page)
    
    ref_cluster = None
    for c in clusters:
        # Cek apakah cluster berada di dalam legend_symbol_bbox
        # Gunakan toleransi
        rx0, ry0, rx1, ry1 = legend_symbol_bbox
        cx0, cy0, cx1, cy1 = c.bbox
        if cx0 >= rx0 - 2 and cy0 >= ry0 - 2 and cx1 <= rx1 + 2 and cy1 <= ry1 + 2:
            ref_cluster = c
            break
            
    if not ref_cluster:
        return 0
        
    ref_w = ref_cluster.bbox[2] - ref_cluster.bbox[0]
    ref_h = ref_cluster.bbox[3] - ref_cluster.bbox[1]
    
    ref_aspect = ref_w / ref_h if ref_h > 0 else 1.0
    
    ref_item_types = [item[0] for item in ref_cluster.items]
    ref_item_counts = {}
    for t in ref_item_types:
        ref_item_counts[t] = ref_item_counts.get(t, 0) + 1
        
    count = 0
    for c in clusters:
        # Jangan hitung legend itu sendiri
        if c is ref_cluster:
            continue
            
        w = c.bbox[2] - c.bbox[0]
        h = c.bbox[3] - c.bbox[1]
        
        if w <= 0 or h <= 0:
            continue
            
        aspect = w / h
        
        # Toleransi aspect ratio 20%
        if abs(aspect - ref_aspect) / ref_aspect > 0.2:
            continue
            
        # Periksa kesamaan jenis item
        item_types = [item[0] for item in c.items]
        item_counts = {}
        for t in item_types:
            item_counts[t] = item_counts.get(t, 0) + 1
            
        if item_counts == ref_item_counts:
            count += 1
            
    return count
