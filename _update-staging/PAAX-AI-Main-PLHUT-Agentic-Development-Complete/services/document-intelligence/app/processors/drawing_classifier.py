import re
from typing import Dict, Any

class DrawingClassifier:
    """
    SK-02 KLASIFIKASI SHEET
    Mendeteksi tipe sheet (denah, potongan, schedule, dll) menggunakan heuristik teks (vektor).
    Fallback ke Gemini Vision akan diatur di level orchestrator jika confidence rendah.
    """
    def process(self, raw_text: str) -> Dict[str, Any]:
        text_upper = raw_text.upper()
        
        # Heuristics keywords
        keywords = {
            "DENAH": ["DENAH", "FLOOR PLAN", "PLAN", "TAMPAK ATAS"],
            "POTONGAN": ["POTONGAN", "SECTION", "X-X", "Y-Y"],
            "TAMPAK": ["TAMPAK", "ELEVATION", "DEPAN", "SAMPING", "BELAKANG"],
            "SCHEDULE": ["SCHEDULE", "DAFTAR", "REKAPITULASI", "TABEL", "TULANGAN", "PROFIL"],
            "DETAIL": ["DETAIL", "SAMBUNGAN", "POTONGAN DETAIL", "ISOMETRI"],
            "MEP": ["PLUMBING", "LISTRIK", "DIAGRAM", "SINGLE LINE", "MEP", "HVAC"],
            "NOTES": ["CATATAN", "NOTES", "SPESIFIKASI", "UMUM", "KETERANGAN"]
        }
        
        scores = {k: 0 for k in keywords}
        
        for k, v_list in keywords.items():
            for v in v_list:
                # Count occurrences
                scores[k] += len(re.findall(r'\b' + re.escape(v) + r'\b', text_upper))
                
        # Find max score
        max_class = "UNCLASSIFIED"
        max_score = 0
        for k, v in scores.items():
            if v > max_score:
                max_score = v
                max_class = k
                
        confidence = min(0.9, 0.4 + (max_score * 0.1)) if max_score > 0 else 0.1
        
        return {
            "classification": max_class,
            "confidence": confidence,
            "scores": scores,
            "needs_vision_fallback": confidence < 0.6
        }
