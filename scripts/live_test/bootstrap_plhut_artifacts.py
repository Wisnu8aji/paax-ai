"""Bootstrap canonical PLHUT reference artifacts into ARTIFACT_STORE.

Imports PDF bytes and seeds package-analysis.json for run 514fb7f2-26fd-5816-9f22-a4a2412688bf
using the standard ARTIFACT_STORE interface (no dynamic request-time fallback).
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DOC_INTEL_PATH = REPO_ROOT / "services" / "document-intelligence"
if str(DOC_INTEL_PATH) not in sys.path:
    sys.path.insert(0, str(DOC_INTEL_PATH))

from app.api.dem_routes import ARTIFACT_STORE
from app.drawing_intelligence.pipeline import analyze_drawing_package

def bootstrap_plhut():
    pdf_path = Path(r"G:\paax-data\gambar kerja\gambar-kerja-arsitektur-gedung-a.pdf")
    run_id = "514fb7f2-26fd-5816-9f22-a4a2412688bf"
    
    if not pdf_path.exists():
        print(f"[BOOTSTRAP WARNING] Reference PDF not found at {pdf_path}")
        return False
        
    pdf_bytes = pdf_path.read_bytes()
    # Seed original PDF bytes
    ARTIFACT_STORE.put("original-pdf", pdf_bytes, content_type="application/pdf", object_key=f"runs/{run_id}")
    ARTIFACT_STORE.put("original-pdf", pdf_bytes, content_type="application/pdf", object_key="runs/PLHUT-SURAKARTA")
    
    # Analyze and seed package-analysis
    analysis = analyze_drawing_package(pdf_path, max_pages=5)
    key = f"runs/{run_id}/package-analysis.json"
    ARTIFACT_STORE.put("drawing-intelligence", analysis.model_dump_json().encode("utf-8"), content_type="application/json", object_key=key)
    print(f"[BOOTSTRAP SUCCESS] Seeded PLHUT artifact & package-analysis into ARTIFACT_STORE for run {run_id}")
    return True

if __name__ == "__main__":
    bootstrap_plhut()
