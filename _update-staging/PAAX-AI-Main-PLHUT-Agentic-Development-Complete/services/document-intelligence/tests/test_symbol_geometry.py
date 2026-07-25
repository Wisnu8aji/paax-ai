import pytest
import fitz

from app.perception.vector.symbol_geometry import count_door_window_symbols, count_symbols_near_legend
from app.perception.ai_assist.kusen_assist import suggest_kusen_schedule
from app.perception.ai_assist.mep_assist import suggest_mep_points
from app.perception.ai_assist.client import AiAssistClient


def test_count_door_window_symbols():
    doc = fitz.open()
    page = doc.new_page(width=500, height=500)
    
    # Buat simbol pintu: garis lurus (10,10 to 10,40) dan arc (kurva dari 10,40 to 40,10)
    # Ini akan dideteksi sebagai "c" dan "l"
    shape = page.new_shape()
    shape.draw_line(fitz.Point(10, 10), fitz.Point(10, 40)) # kusen
    shape.draw_bezier(fitz.Point(10, 40), fitz.Point(20, 40), fitz.Point(40, 20), fitz.Point(40, 10)) # arc
    shape.finish()
    shape.commit()
    
    # Buat simbol jendela: rect (50,50 to 90,60) + garis di tengah (70,50 to 70,60)
    shape2 = page.new_shape()
    shape2.draw_rect(fitz.Rect(50, 50, 90, 60))
    shape2.draw_line(fitz.Point(70, 50), fitz.Point(70, 60))
    shape2.finish()
    shape2.commit()
    
    counts = count_door_window_symbols(page)
    
    assert counts["arc_door"] == 1
    assert counts["rect_window"] == 1


def test_count_symbols_near_legend():
    doc = fitz.open()
    page = doc.new_page(width=500, height=500)
    
    # Legenda LAMPU TL di (10, 10, 30, 20) -> w=20, h=10
    shape_legend = page.new_shape()
    shape_legend.draw_rect(fitz.Rect(10, 10, 30, 20))
    shape_legend.draw_line(fitz.Point(15, 10), fitz.Point(15, 20)) # 1 rect, 1 line
    shape_legend.finish()
    shape_legend.commit()
    
    # Titik 1 di map (100, 100, 120, 110)
    shape_map1 = page.new_shape()
    shape_map1.draw_rect(fitz.Rect(100, 100, 120, 110))
    shape_map1.draw_line(fitz.Point(105, 100), fitz.Point(105, 110))
    shape_map1.finish()
    shape_map1.commit()
    
    # Titik 2 di map (200, 200, 220, 210)
    shape_map2 = page.new_shape()
    shape_map2.draw_rect(fitz.Rect(200, 200, 220, 210))
    shape_map2.draw_line(fitz.Point(205, 200), fitz.Point(205, 210))
    shape_map2.finish()
    shape_map2.commit()
    
    # Simbol lain (aspect ratio beda) di map (300, 300, 310, 310) -> kotak
    shape_map3 = page.new_shape()
    shape_map3.draw_rect(fitz.Rect(300, 300, 310, 310))
    shape_map3.draw_line(fitz.Point(305, 300), fitz.Point(305, 310))
    shape_map3.finish()
    shape_map3.commit()
    
    # Bbox pencarian mencakup (10,10,30,20)
    count = count_symbols_near_legend(page, (8, 8, 32, 22))
    
    # Harusnya ketangkap 2 buah di map yang sama persis w=20,h=10
    assert count == 2


class DummyAiAssistClient(AiAssistClient):
    def __init__(self, raw_return):
        self.raw_return = raw_return

    def generate_json(self, system_prompt, user_prompt, response_schema):
        return self.raw_return


def test_kusen_assist_symbol_counts():
    client = DummyAiAssistClient({
        "items": [
            {
                "tipe": "PINTU 1",
                "width_m": 0.9,
                "height_m": 2.1,
                "qty": 5,
                "source_texts": ["PINTU 1 0.9 2.1 5"]
            }
        ]
    })
    
    # Kalau symbol count mendukung
    suggestions = suggest_kusen_schedule(
        document_texts=["PINTU 1 0.9 2.1 5"],
        client=client,
        symbol_counts={"arc_door": 5, "rect_window": 0}
    )
    
    assert len(suggestions) == 1
    assert suggestions[0].confidence > 0.8
    assert "Didukung simbol gambar: ~5 pintu" in suggestions[0].reasoning

    # Kalau tidak ada text, tapi ada symbol_counts
    suggestions2 = suggest_kusen_schedule(
        document_texts=[],
        client=None,
        symbol_counts={"arc_door": 3, "rect_window": 2}
    )
    
    assert len(suggestions2) == 2
    assert any(s.tipe == "PINTU-AUTO" and s.qty == 3 for s in suggestions2)
    assert any(s.tipe == "JENDELA-AUTO" and s.qty == 2 for s in suggestions2)


def test_mep_assist_legend_counts():
    client = DummyAiAssistClient({
        "items": [
            {
                "jenis": "LAMPU TL",
                "count": 10,
                "source_texts": ["LAMPU TL 10"]
            }
        ]
    })
    
    # Cocok
    suggestions = suggest_mep_points(
        document_texts=["LAMPU TL 10"],
        client=client,
        symbol_counts_from_legend={"LAMPU TL": 10}
    )
    
    assert len(suggestions) == 1
    assert suggestions[0].confidence > 0.8
    assert "Sangat sesuai" in suggestions[0].reasoning
    
    # Tidak ada text
    suggestions2 = suggest_mep_points(
        document_texts=[],
        client=None,
        symbol_counts_from_legend={"STOP KONTAK": 5}
    )
    
    assert len(suggestions2) == 1
    assert suggestions2[0].jenis == "STOP KONTAK-AUTO"
    assert suggestions2[0].count == 5
    assert "Dihitung otomatis dari kemiripan geometri" in suggestions2[0].reasoning
