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

# --- Helper: Demo Data Generator ---
def generate_demo_extraction(file_name: str) -> DrawingAnalysisResponse:
    # Deterministic fallback/demo extraction based on user request
    return DrawingAnalysisResponse(
        file_id=str(uuid.uuid4()),
        classification="Architectural Floor Plan",
        rooms=["Ruang tamu", "Kamar tidur utama", "Kamar tidur anak", "Kamar mandi", "Dapur", "Teras"],
        doors=["Pintu Utama", "Pintu Kamar 1", "Pintu Kamar 2", "Pintu Kamar Mandi", "Pintu Dapur", "Pintu Belakang"],
        windows=["Jendela Depan 1", "Jendela Depan 2", "Jendela Kamar 1", "Jendela Kamar 1b", "Jendela Kamar 2", "Jendela Dapur 1", "Jendela Dapur 2", "Boven Kamar Mandi"],
        quantity_candidates=[
            QuantityCandidate(id=str(uuid.uuid4()), quantity_name="Floor Area", unit="m2", value=150.0, source="Floor Plan calculation", confidence=0.85, linked_rab_category="pekerjaan_lantai", evidence_note="Total area bounded by exterior walls"),
            QuantityCandidate(id=str(uuid.uuid4()), quantity_name="Ceiling Area", unit="m2", value=150.0, source="Derived from Floor Area", confidence=0.80, linked_rab_category="pekerjaan_plafon", evidence_note="Assuming flat ceiling matching floor area"),
            QuantityCandidate(id=str(uuid.uuid4()), quantity_name="Interior Wall Paint Area", unit="m2", value=420.0, source="Wall length * standard height (3m)", confidence=0.75, linked_rab_category="pekerjaan_cat_interior", evidence_note="Estimated from interior wall segments"),
            QuantityCandidate(id=str(uuid.uuid4()), quantity_name="Exterior Wall Paint Area", unit="m2", value=180.0, source="Perimeter * standard height (3m)", confidence=0.78, linked_rab_category="pekerjaan_cat_eksterior", evidence_note="Estimated from building perimeter minus openings"),
            QuantityCandidate(id=str(uuid.uuid4()), quantity_name="Door Units", unit="unit", value=6.0, source="Door schedule count", confidence=0.95, linked_rab_category="pekerjaan_pintu", evidence_note="Counted 6 distinct door symbols"),
            QuantityCandidate(id=str(uuid.uuid4()), quantity_name="Window Units", unit="unit", value=8.0, source="Window schedule count", confidence=0.95, linked_rab_category="pekerjaan_jendela", evidence_note="Counted 8 distinct window symbols"),
            QuantityCandidate(id=str(uuid.uuid4()), quantity_name="Bathroom Fixtures", unit="set", value=2.0, source="Plumbing fixture count", confidence=0.90, linked_rab_category="pekerjaan_sanitasi", evidence_note="Counted 1 closet and 1 shower/sink set"),
            QuantityCandidate(id=str(uuid.uuid4()), quantity_name="Roof Area", unit="m2", value=165.0, source="Floor Area + 10% overhang", confidence=0.70, linked_rab_category="pekerjaan_atap", evidence_note="Derived assumption, requires roof plan for accuracy"),
        ],
        warnings=[
            DrawingWarning(id=str(uuid.uuid4()), message="Scale not verified", level="MEDIUM", related_elements=[]),
            DrawingWarning(id=str(uuid.uuid4()), message="Dimensions require manual validation", level="HIGH", related_elements=["all_areas"]),
            DrawingWarning(id=str(uuid.uuid4()), message="Wall thickness not confirmed", level="LOW", related_elements=[]),
            DrawingWarning(id=str(uuid.uuid4()), message="Openings need user verification", level="MEDIUM", related_elements=["doors", "windows"]),
            DrawingWarning(id=str(uuid.uuid4()), message="Quantity is candidate, not final", level="INFO", related_elements=[]),
            DrawingWarning(id=str(uuid.uuid4()), message="MEP drawing not included", level="INFO", related_elements=[]),
            DrawingWarning(id=str(uuid.uuid4()), message="Structural drawing not included", level="INFO", related_elements=[]),
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
