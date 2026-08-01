"""Bootstrap canonical PLHUT reference artifacts into ARTIFACT_STORE.

Imports PDF bytes from repo fixture and seeds package-analysis.json for run
514fb7f2-26fd-5816-9f22-a4a2412688bf using the standard ARTIFACT_STORE interface.
"""
import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DOC_INTEL_PATH = REPO_ROOT / "services" / "document-intelligence"
if str(DOC_INTEL_PATH) not in sys.path:
    sys.path.insert(0, str(DOC_INTEL_PATH))

from app.api.dem_routes import ARTIFACT_STORE
from app.drawing_intelligence.pipeline import analyze_drawing_package

EXPECTED_SHA256 = "bf582e74951312cc6ccd305c2d48772ca27e7ffdf5b0fb1a0ef7104c19e9eb68"
EXPECTED_PAGES = 88


def bootstrap_plhut():
    manifest_path = REPO_ROOT / "fixtures" / "plhut" / "project-manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        pdf_rel_path = manifest.get("source_document", {}).get("path", "GAMBAR KERJA PLHUT SURAKARTA (1).pdf")
        pdf_path = REPO_ROOT / "fixtures" / "plhut" / pdf_rel_path
    else:
        pdf_path = REPO_ROOT / "fixtures" / "plhut" / "GAMBAR KERJA PLHUT SURAKARTA (1).pdf"

    run_id = "514fb7f2-26fd-5816-9f22-a4a2412688bf"

    if not pdf_path.exists():
        print(f"[BOOTSTRAP ERROR] Reference PDF not found at {pdf_path}")
        return False

    pdf_bytes = pdf_path.read_bytes()
    digest = hashlib.sha256(pdf_bytes).hexdigest()
    if digest != EXPECTED_SHA256:
        print(f"[BOOTSTRAP ERROR] PDF hash mismatch: got {digest}, expected {EXPECTED_SHA256}")
        return False

    # Seed original PDF bytes with canonical key
    ARTIFACT_STORE.put("original-pdf", pdf_bytes, content_type="application/pdf", object_key=f"runs/{run_id}")

    # Analyze full document (no max_pages truncation) and seed package-analysis
    analysis = analyze_drawing_package(pdf_path, max_pages=None)
    if len(analysis.pages) != EXPECTED_PAGES:
        print(f"[BOOTSTRAP WARNING] Expected {EXPECTED_PAGES} pages in analysis, got {len(analysis.pages)}")

    key = f"runs/{run_id}/package-analysis.json"
    ARTIFACT_STORE.put(
        "drawing-intelligence",
        analysis.model_dump_json(indent=2).encode("utf-8"),
        content_type="application/json",
        object_key=key,
    )
    print(f"[BOOTSTRAP SUCCESS] Seeded PLHUT 88-page artifact & package-analysis into ARTIFACT_STORE for run {run_id}")
    return True


if __name__ == "__main__":
    bootstrap_plhut()
