from typing import Dict, Any

class TriageReviewer:
    """
    SK-24 TRIAGE REVIEW & SK-25 SKORING CONFIDENCE
    Memberikan prioritas review berdasarkan confidence score dan aturan triangulasi.
    """
    def process(self, tkg_doc: Dict[str, Any]) -> Dict[str, Any]:
        review_tasks = []
        
        if not tkg_doc or "sheets" not in tkg_doc:
            return {"review_tasks": review_tasks}
            
        for sheet in tkg_doc["sheets"]:
            # Triage berdasarkan anomali atau confidence grid
            if not sheet.get("grid", {}).get("valid", True):
                review_tasks.append({
                    "target_type": "GRID",
                    "reason": "Total bentang grid tidak sinkron dengan parsial grid.",
                    "priority": "HIGH"
                })
                
            # Triage klasifikasi (Jika diintegrasikan ke level sheet)
            
            # Triage tabel tanpa elemen instance
            for table in sheet.get("tables", []):
                for rec in table.get("records", []):
                    if rec.get("confidence", 1.0) < 0.9:
                        review_tasks.append({
                            "target_type": "TABLE_RECORD",
                            "target_id": rec.get("kode"),
                            "reason": "Confidence pembacaan OCR pada tabel rendah.",
                            "priority": "MEDIUM"
                        })
                        
        return {"review_tasks": review_tasks}
