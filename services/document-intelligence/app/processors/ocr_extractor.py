import re
from typing import Dict, Any, Tuple

class OcrExtractor:
    """
    SK-10 NORMALISASI ANGKA & KOREKSI OCR
    Locale id-ID + kamus koreksi domain.
    """
    
    def process(self, raw_text: str) -> Dict[str, Any]:
        normalized, corrections = self.normalize_numbers(raw_text)
        normalized, domain_corrections = self.domain_corrections(normalized)
        
        corrections.extend(domain_corrections)
        
        return {
            "original_text": raw_text,
            "normalized_text": normalized,
            "corrections": corrections,
            "needs_review": len(corrections) > 5 # Jika terlalu banyak koreksi, minta review manusia
        }
        
    def normalize_numbers(self, text: str) -> Tuple[str, list]:
        """
        Normalisasi angka id-ID:
        Misal: 1.000,50 -> 1000.50
        """
        corrections = []
        
        # Regex mencari format angka Indonesia: digit diikuti titik/koma
        # Contoh: 1.200,50 atau 12.000
        def replacer(match):
            original = match.group(0)
            # Hapus titik (pemisah ribuan id-ID)
            no_dots = original.replace('.', '')
            # Ganti koma dengan titik (desimal id-ID ke float)
            normalized = no_dots.replace(',', '.')
            if original != normalized:
                corrections.append({"type": "number_format", "from": original, "to": normalized})
            return normalized

        # Deteksi angka dengan format titik dan koma
        # \d{1,3}(?:\.\d{3})*(?:,\d+)?
        pattern = r'\b\d{1,3}(?:\.\d{3})*(?:,\d+)?\b'
        
        # We need to be careful not to mess up section numbers like 1.2.3
        # If it has multiple dots and no commas, and segments are < 3 digits, it's probably a section.
        # Simple heuristic: only replace if it exactly matches currency/measurement format.
        
        # A simpler approach for MVP:
        # Just find patterns like \d+,\d+ and change to \d+.\d+
        def comma_replacer(match):
            original = match.group(0)
            normalized = original.replace(',', '.')
            corrections.append({"type": "decimal_format", "from": original, "to": normalized})
            return normalized
            
        res = re.sub(r'\b(\d+),(\d+)\b', comma_replacer, text)
        return res, corrections
        
    def domain_corrections(self, text: str) -> Tuple[str, list]:
        """
        Koreksi OCR spesifik domain arsitektur.
        """
        corrections = []
        dictionary = {
            r'\b0LT\b': 'PLT',
            r'\b8ETON\b': 'BETON',
            r'\bKDLOM\b': 'KOLOM',
            r'\b8ALOK\b': 'BALOK',
            r'\bm2\b': 'm2',
            r'\bm3\b': 'm3',
        }
        
        res = text
        for pattern, replacement in dictionary.items():
            def replacer(match):
                corrections.append({"type": "domain_ocr", "from": match.group(0), "to": replacement})
                return replacement
            res = re.sub(pattern, replacer, res, flags=re.IGNORECASE)
            
        return res, corrections
