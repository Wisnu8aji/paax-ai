import uuid
import tempfile
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
from datetime import datetime

# Direktori unggahan lintas-platform (default lama "/tmp/paax_uploads" tidak
# valid di Windows). Override via env UPLOAD_DIR bila perlu, samakan dengan
# upload_routes.py.
UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(tempfile.gettempdir(), "paax_uploads"))

router = APIRouter(prefix="/drawings", tags=["Drawing Intelligence"])

# --- Models ---
class DrawingFileMetadata(BaseModel):
    file_id: Optional[str] = None
    file_name: str
    file_type: str
    project_id: Optional[str] = None

class DrawingAnalyzeRequest(BaseModel):
    file_metadata: DrawingFileMetadata
    options: Optional[dict] = None

class QuantityCandidate(BaseModel):
    id: str
    quantity_name: str
    unit: str
    value: float
    source: str
    confidence: float
    needs_verification: bool = True
    linked_rab_category: Optional[str] = None
    source_page: Optional[int] = None
    evidence_note: Optional[str] = None
    status: str = "CANDIDATE"
    notes: Optional[str] = None

class DrawingWarning(BaseModel):
    id: str
    message: str
    level: str
    related_elements: List[str] = []

class DrawingAnalysisResponse(BaseModel):
    file_id: str
    classification: str
    classification_confidence: Optional[float] = None
    rooms: List[str]
    doors: List[str]
    windows: List[str]
    quantity_candidates: List[QuantityCandidate]
    warnings: List[DrawingWarning]
    # TKG Pipeline V1.0 (Real Data)
    tkg_document: Optional[dict] = None
    tkg_text: Optional[str] = None
    # Fase 2 P4: metrik & gerbang NYATA dari pipeline persepsi (bukan
    # dihitung ulang di frontend — lihat docs/plans/PAAX_FASE2_PERSEPSI_PLAN_2026-07-04.md).
    metrics: Optional[dict] = None
    gerbang: Optional[dict] = None

class VerifyCandidateRequest(BaseModel):
    candidate_id: str
    status: str # APPROVED, REJECTED, EDITED
    verified_value: Optional[float] = None
    notes: Optional[str] = None

class BoqPreviewRequest(BaseModel):
    verified_quantities: List[dict]

def generate_demo_extraction(file_name: str) -> DrawingAnalysisResponse:
    # TODO (Brain v4.1): Implement real PyMuPDF and OCR extraction to TKG.
    # Mengembalikan data kosong (tanpa karangan) sesuai INV-01 dan AP-03.
    return DrawingAnalysisResponse(
        file_id=str(uuid.uuid4()),
        classification="Unclassified",
        rooms=[],
        doors=[],
        windows=[],
        quantity_candidates=[],
        warnings=[
            DrawingWarning(id=str(uuid.uuid4()), message="Sistem dalam transisi ke arsitektur TKG (Brain v4.1). Ekstraksi gambar dinonaktifkan sementara untuk menghindari data karangan (AP-01, AP-03).", level="CRITICAL", related_elements=[]),
            DrawingWarning(id=str(uuid.uuid4()), message="Gunakan fitur Manual Takeoff atau Smart Import sampai TKG Pipeline v1.0 aktif.", level="INFO", related_elements=[])
        ]
    )

from app.perception.assemble import assemble_document_from_pdf_bytes
from app.perception.render import render_tkg_txt
from app.perception.validate import aggregate_metrics, build_gerbang

# --- Endpoints ---

@router.post("/analyze", response_model=DrawingAnalysisResponse)
async def analyze_drawing(req: DrawingAnalyzeRequest):
    """
    Fase 2 (P1-P4): pipeline persepsi vektor NYATA — span PyMuPDF + merge-run
    (RULE-EXT-03) + grammar notasi struktur (brain-00 §2) + rekonstruksi tabel
    via `page.find_tables()` + metrik/gerbang. Menggantikan SK-07 MVP regex
    naif sebelumnya (`app/tkg/builder.py`, masih dipakai jalur teks-manual
    `/drawings/tkg/build`, TIDAK dihapus).

    CAKUPAN JUJUR: rekonstruksi grid dari geometri bubble+garis-dimensi (§3.1.1
    penuh) BELUM diimplementasikan — grid hanya terbaca dari notasi gabungan
    eksplisit "<as>-<as>=<nilai>". Lihat docstring `app/perception/assemble.py`.
    """
    file_name = req.file_metadata.file_name
    file_path = os.path.join(UPLOAD_DIR, file_name)

    classification = "Unclassified"
    classification_confidence: Optional[float] = None
    tkg_doc: Optional[dict] = None
    tkg_text: Optional[str] = None
    metrics_out: Optional[dict] = None
    gerbang_out: Optional[dict] = None

    warnings = [
        DrawingWarning(
            id=str(uuid.uuid4()),
            message="Sistem menggunakan pipeline persepsi Fase 2 (span vektor + merge-run + grammar + tabel bergaris nyata).",
            level="INFO",
            related_elements=[],
        )
    ]

    if os.path.exists(file_path) and file_name.lower().endswith(".pdf"):
        with open(file_path, "rb") as f:
            pdf_bytes = f.read()
        try:
            tkg_document, per_sheet_metrics = assemble_document_from_pdf_bytes(
                pdf_bytes, prj_id=req.file_metadata.project_id or "prj-123",
            )
        except Exception as e:
            warnings.append(DrawingWarning(
                id=str(uuid.uuid4()),
                message=f"Pipeline persepsi gagal memproses PDF ({e}). Gunakan jalur teks deskripsi manual.",
                level="CRITICAL",
                related_elements=[],
            ))
        else:
            tkg_doc = tkg_document.model_dump()
            tkg_text = render_tkg_txt(tkg_document)

            if per_sheet_metrics:
                first = per_sheet_metrics[0]
                classification = first["classification"]
                classification_confidence = first["classification_confidence"]
                if first["needs_vision_fallback"]:
                    warnings.append(DrawingWarning(
                        id=str(uuid.uuid4()),
                        message="Confidence klasifikasi rendah, butuh fallback vision LLM.",
                        level="MEDIUM",
                        related_elements=[],
                    ))

            raster_sheets = [m for m in per_sheet_metrics if m.get("is_raster")]
            if raster_sheets:
                unavailable = [m for m in raster_sheets if m.get("ocr_message")]
                if unavailable:
                    warnings.append(DrawingWarning(
                        id=str(uuid.uuid4()),
                        message=(
                            f"{len(unavailable)} sheet terdeteksi raster (scan/foto) tapi OCR tidak tersedia "
                            f"di server — {unavailable[0]['ocr_message']}"
                        ),
                        level="MEDIUM",
                        related_elements=[],
                    ))
                else:
                    warnings.append(DrawingWarning(
                        id=str(uuid.uuid4()),
                        message=(
                            f"{len(raster_sheets)} sheet dibaca via OCR (raster) — confidence lebih rendah "
                            "dari pembacaan vektor, WAJIB direview manusia sebelum dipakai (RULE-EXT-33)."
                        ),
                        level="MEDIUM",
                        related_elements=[],
                    ))

            aggregated = aggregate_metrics(per_sheet_metrics)
            metrics_out = aggregated
            gerbang_out = build_gerbang(aggregated, n_sheets=len(tkg_document.sheets))

            if aggregated["n_unclassified"] > 0:
                warnings.append(DrawingWarning(
                    id=str(uuid.uuid4()),
                    message=(
                        f"{aggregated['n_unclassified']}/{aggregated['span_total']} teks tidak cocok grammar §2 "
                        f"— masuk UNCLASSIFIED (tidak dibuang, INV-TKG-02). Cakupan {aggregated['cakupan']:.1%}."
                    ),
                    level="MEDIUM",
                    related_elements=[],
                ))
    else:
        warnings.append(DrawingWarning(
            id=str(uuid.uuid4()),
            message=f"File {file_name} tidak ditemukan di server. Ekstraksi kosong.",
            level="CRITICAL",
            related_elements=[],
        ))

    return DrawingAnalysisResponse(
        file_id=str(uuid.uuid4()),
        classification=classification,
        classification_confidence=classification_confidence,
        rooms=[],
        doors=[],
        windows=[],
        quantity_candidates=[],  # Sengaja dikosongkan untuk menghindari halusinasi (AP-01)
        warnings=warnings,
        tkg_document=tkg_doc,
        tkg_text=tkg_text,
        metrics=metrics_out,
        gerbang=gerbang_out,
    )

@router.post("/classify")
async def classify_drawing(req: DrawingAnalyzeRequest):
    return {"classification": "Architectural Floor Plan", "confidence": 0.9}

@router.post("/extract")
async def extract_drawing(req: DrawingAnalyzeRequest):
    return generate_demo_extraction(req.file_metadata.file_name)

@router.post("/verify")
async def verify_candidate(req: VerifyCandidateRequest):
    # In a real app, this would update the database.
    # For v0.5, verification state is managed in the frontend's localStorage.
    # This endpoint can act as an audit log or validation check.
    return {
        "status": "success",
        "candidate_id": req.candidate_id,
        "new_status": req.status,
        "verified_at": datetime.now().isoformat()
    }

@router.post("/boq-preview")
async def boq_preview(req: BoqPreviewRequest):
    # Generate a draft BOQ based on verified quantities
    draft_items = []
    
    for vq in req.verified_quantities:
        # Simplistic mapping for demo
        draft_items.append({
            "id": str(uuid.uuid4()),
            "category": vq.get("linked_rab_category", "Pekerjaan Persiapan"),
            "item_name": vq.get("quantity_name", "Unknown Item"),
            "unit": vq.get("unit", "ls"),
            "quantity": vq.get("verified_value", vq.get("value", 0)),
            "source_candidate_ids": [vq.get("id")],
            "confidence": 1.0, # Verified items have 100% confidence
            "status": "READY"
        })
        
    return {
        "status": "success",
        "draft_items": draft_items
    }
