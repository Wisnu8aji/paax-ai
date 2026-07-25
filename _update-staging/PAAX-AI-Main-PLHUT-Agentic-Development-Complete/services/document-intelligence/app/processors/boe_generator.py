from typing import Dict, Any, List

class BoeGenerator:
    """
    SK-23 ASSUMPTION / BOE GENERATOR
    Mengumpulkan semua asumsi dan evidence menjadi Basis of Estimate.
    """
    def generate(self, tkg_doc: Dict[str, Any], core_engine_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        boe = {
            "title": "Basis of Estimate (BOE)",
            "project_id": tkg_doc.get("prj_id", "Unknown"),
            "assumptions": [],
            "warnings": []
        }
        
        # Ekstrak dari TKG
        if "sheets" in tkg_doc:
            for sheet in tkg_doc["sheets"]:
                for w in sheet.get("warnings", []):
                    boe["warnings"].append(f"Sheet {sheet.get('sheet_id')}: {w}")
                    
        # Ekstrak asumsi dari Core Engine
        for result in core_engine_results:
            domain = result.get("domain", "General")
            for asm in result.get("assumptions", []):
                boe["assumptions"].append({
                    "domain": domain,
                    "assumption": asm
                })
                
        return boe
