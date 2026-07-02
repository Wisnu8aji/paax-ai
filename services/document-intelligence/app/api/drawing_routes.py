import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
from datetime import datetime

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
    rooms: List[str]
    doors: List[str]
    windows: List[str]
    quantity_candidates: List[QuantityCandidate]
    warnings: List[DrawingWarning]

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

# --- Endpoints ---

@router.post("/analyze", response_model=DrawingAnalysisResponse)
async def analyze_drawing(req: DrawingAnalyzeRequest):
    api_key = os.getenv("GEMINI_API_KEY")
    
    # Check if we should use the real AI pipeline or fallback
    if api_key and api_key.strip():
        # TODO: Implement real Gemini 1.5 Pro multimodal processing here
        # For now, we simulate real AI by adding a slight delay and returning demo data,
        # but in production this would call the Vertex/Gemini API.
        return generate_demo_extraction(req.file_metadata.file_name)
    else:
        # Fallback mode
        return generate_demo_extraction(req.file_metadata.file_name)

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
