import fitz  # PyMuPDF
from typing import List, Dict, Any

class PdfRenderer:
    """
    SK-01 TRIASE & SPLIT
    Memecah PDF per sheet, mendeteksi apakah sheet berupa vektor atau raster,
    dan mengambil metadata teks.
    """
    
    def process(self, file_path: str) -> Dict[str, Any]:
        try:
            doc = fitz.open(file_path)
            sheets = []
            
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                
                # Cek teks bawaan
                text_dict = page.get_text("dict")
                text_blocks = [b for b in text_dict.get("blocks", []) if b["type"] == 0]
                has_text = len(text_blocks) > 0
                
                # Heuristik vektor/raster: 
                # Jika tidak ada teks sama sekali dan banyak gambar, kemungkinan besar raster (scanned).
                # Jika ada elemen vector gambar
                images = page.get_images()
                drawings = page.get_drawings()
                
                is_vector = len(drawings) > 0 or has_text
                
                raw_text = page.get_text("text")
                
                sheets.append({
                    "sheet_id": f"page-{page_num + 1}",
                    "page": page_num + 1,
                    "is_vector": is_vector,
                    "has_text": has_text,
                    "raw_text": raw_text.strip(),
                    "images_count": len(images),
                    "drawings_count": len(drawings)
                })
                
            return {
                "file_path": file_path,
                "total_pages": len(doc),
                "sheets": sheets,
                "status": "success"
            }
        except Exception as e:
            return {
                "file_path": file_path,
                "total_pages": 0,
                "sheets": [],
                "status": "error",
                "error": str(e)
            }

