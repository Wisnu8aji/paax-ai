import fitz
import re
from typing import Dict, Any, List

class TableExtractor:
    """
    SK-04 EKSTRAKSI SCHEDULE -> TypeDict
    Mengekstrak tabel schedule kolom/balok dari teks PyMuPDF.
    """
    def process(self, raw_text: str) -> Dict[str, Any]:
        records = []
        lines = raw_text.splitlines()
        
        # Heuristic simple untuk tabel schedule
        # Mencari pola seperti "K1 400x400 8D16"
        for line in lines:
            # Pola: Kode (huruf+angka), dimensi (angka x angka), tulangan (angka D angka)
            match = re.search(r'\b([KB]\d+)\s+(\d+)\s*[xX]\s*(\d+)\s+(\d+[DdP]\d+)\b', line, re.IGNORECASE)
            if match:
                kode = match.group(1).upper()
                b = float(match.group(2))
                h = float(match.group(3))
                tul = match.group(4).upper()
                
                records.append({
                    "kode": kode,
                    "kategori": "kolom" if kode.startswith('K') else "balok",
                    "dimensi": {"b": b, "h": h},
                    "tulangan": [{"raw": tul, "posisi": "utama"}],
                    "confidence": 0.85
                })
                
        return {
            "tables": [{"judul": "schedule_terdeteksi", "records": records}],
            "records_count": len(records)
        }
