import pytest
import fitz

from app.perception.tkg.models import Grid, GridAxis, GridSpan
from app.perception.vector.wall_geometry import detect_wall_polygons
from app.perception.ai_assist.wall_assist import suggest_dinding_pasangan
from app.perception.ai_assist.client import AiAssistClient


def _create_synthetic_grid_and_axis() -> tuple[Grid, dict[str, dict[str, float]]]:
    # Grid sederhana: A-B = 3000mm, 1-2 = 4000mm
    # px distance: A=100, B=250 -> 150px = 3000mm -> 20 mm/px
    # 1=100, 2=300 -> 200px = 4000mm -> 20 mm/px
    grid = Grid(
        sumbu_x=[GridAxis(label="A", posisi_mm=0.0), GridAxis(label="B", posisi_mm=3000.0)],
        sumbu_y=[GridAxis(label="1", posisi_mm=0.0), GridAxis(label="2", posisi_mm=4000.0)],
        bentang_x=[GridSpan(dari="A", ke="B", nilai=3000.0, raw="3000")],
        bentang_y=[GridSpan(dari="1", ke="2", nilai=4000.0, raw="4000")],
        total_x=None,
        total_y=None,
    )
    axis_points = {
        "x": {"A": 100.0, "B": 250.0},
        "y": {"1": 100.0, "2": 300.0},
    }
    return grid, axis_points


def test_wall_geometry_single_room():
    doc = fitz.open()
    page = doc.new_page(width=500, height=500)
    
    # Gambar 1 ruangan persegi ukuran 100x100 px
    # Skala 20 mm/px -> 2000mm x 2000mm -> keliling = 8000mm = 8m
    shape = page.new_shape()
    shape.draw_rect(fitz.Rect(100, 100, 200, 200))
    shape.finish()
    shape.commit()
    
    grid, axis_points = _create_synthetic_grid_and_axis()
    
    total_length_m, needs_review, reason = detect_wall_polygons(page, grid, axis_points)
    
    assert not needs_review
    # 4 sisi x 100px = 400px
    # 400px * 20 mm/px = 8000 mm = 8.0 m
    assert total_length_m == pytest.approx(8.0, rel=0.01)


def test_wall_geometry_deduplication():
    doc = fitz.open()
    page = doc.new_page(width=500, height=500)
    
    # Ruang 1: 100x100 (dari x=100..200)
    # Ruang 2: 100x100 (dari x=200..300)
    # Sisi bersama di x=200 (y=100..200)
    # Total keliling 2 ruangan kalau digabung:
    # Atas: 100 + 100 = 200px
    # Bawah: 100 + 100 = 200px
    # Kiri: 100px
    # Kanan: 100px
    # Tengah: 100px (tidak boleh dihitung 2x)
    # Total panjang px = 200 + 200 + 100 + 100 + 100 = 700px
    # Skala 20 mm/px -> 14000 mm = 14.0 m
    
    shape = page.new_shape()
    shape.draw_rect(fitz.Rect(100, 100, 200, 200))
    shape.finish()
    shape.commit()
    
    shape2 = page.new_shape()
    shape2.draw_rect(fitz.Rect(200, 100, 300, 200))
    shape2.finish()
    shape2.commit()
    
    grid, axis_points = _create_synthetic_grid_and_axis()
    
    total_length_m, needs_review, reason = detect_wall_polygons(page, grid, axis_points)
    
    assert not needs_review
    assert total_length_m == pytest.approx(14.0, rel=0.01)


def test_wall_geometry_no_scale():
    doc = fitz.open()
    page = doc.new_page(width=500, height=500)
    
    shape = page.new_shape()
    shape.draw_rect(fitz.Rect(100, 100, 200, 200))
    shape.finish()
    shape.commit()
    
    total_length_m, needs_review, reason = detect_wall_polygons(page, None, {})
    
    assert needs_review
    assert total_length_m is None
    assert "skala tidak diketahui" in reason


class DummyAiAssistClient(AiAssistClient):
    def __init__(self, raw_return):
        self.raw_return = raw_return

    def generate_json(self, system_prompt, user_prompt, response_schema):
        return self.raw_return


def test_wall_assist_wiring_corroborate():
    client = DummyAiAssistClient({
        "l_dinding_m": 10.0,
        "h_dinding_m": 3.0,
        "confidence": 0.7,
        "reasoning": "Dari teks dinding bata 10m tinggi 3m",
        "source_texts": ["DINDING BATA 10m TINGGI 3m"]
    })
    
    # Geometri = 10.5m (cocok, selisih 0.5 < 15%)
    suggestion = suggest_dinding_pasangan(
        candidate_texts=["PASANGAN DINDING BATA 10m TINGGI 3m"],
        client=client,
        geometry_candidate_m=10.5
    )
    
    assert suggestion is not None
    assert suggestion.l_dinding_m == 10.0 # Tetap pakai teks
    assert suggestion.confidence > 0.7 # Naik
    assert "Divalidasi silang dgn geometri polygon" in suggestion.reasoning


def test_wall_assist_wiring_discrepancy():
    client = DummyAiAssistClient({
        "l_dinding_m": 10.0,
        "h_dinding_m": 3.0,
        "confidence": 0.7,
        "reasoning": "Dari teks dinding bata 10m tinggi 3m",
        "source_texts": ["DINDING BATA 10m TINGGI 3m"]
    })
    
    # Geometri = 20.0m (selisih > 15%)
    suggestion = suggest_dinding_pasangan(
        candidate_texts=["PASANGAN DINDING BATA 10m TINGGI 3m"],
        client=client,
        geometry_candidate_m=20.0
    )
    
    assert suggestion is not None
    assert suggestion.confidence < 0.7 # Turun
    assert "WARNING" in suggestion.reasoning


def test_wall_assist_wiring_no_text_has_geometry():
    # Teks tidak ada, geometri = 15m
    suggestion = suggest_dinding_pasangan(
        candidate_texts=[],
        client=None, # client tak akan dipanggil
        geometry_candidate_m=15.0
    )
    
    assert suggestion is not None
    assert suggestion.l_dinding_m == 15.0
    assert suggestion.h_dinding_m is None
    assert "geometri independen" in suggestion.reasoning
