import re
from typing import Dict, Any

class GridExtractor:
    """
    SK-05 GRID & JARAK
    Mengekstrak bentang grid dan elevasi dari teks raw.
    """
    def process(self, raw_text: str) -> Dict[str, Any]:
        spans = []
        levels = []
        lines = raw_text.splitlines()
        
        for line in lines:
            # Cari Grid: A-B = 4000
            grid_match = re.search(r'\b([A-Z\d]+)\s*[-_]\s*([A-Z\d]+)\s*=\s*(\d+(?:\.\d+)?)\b', line)
            if grid_match:
                spans.append({
                    "sumbu": "x" if grid_match.group(1).isalpha() else "y",
                    "dari": grid_match.group(1),
                    "ke": grid_match.group(2),
                    "nilai": float(grid_match.group(3)),
                    "unit": "mm"
                })
                
            # Cari elevasi: EL +3.50 atau FF +3.50
            lvl_match = re.search(r'\b(?:EL|FF|SFL|PEIL)\s*([+-]?\d+(?:\.\d+)?)\b', line, re.IGNORECASE)
            if lvl_match:
                levels.append({
                    "label": "Elevasi Ditemukan",
                    "nilai_m": float(lvl_match.group(1)),
                    "raw": line
                })
                
        return {
            "grid": {"bentang": spans},
            "levels": levels
        }
