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
    # TKG Pipeline V1.0 (Real Data)
    tkg_document: Optional[dict] = None
    tkg_text: Optional[str] = None

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

import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime

from app.processors.pdf_renderer import PdfRenderer
from app.processors.drawing_classifier import DrawingClassifier
from app.processors.ocr_extractor import OcrExtractor
from app.processors.table_extractor import TableExtractor
from app.processors.grid_extractor import GridExtractor
from app.tkg.builder import build_tkg_from_text

# --- Endpoints ---

@router.post("/analyze", response_model=DrawingAnalysisResponse)
async def analyze_drawing(req: DrawingAnalyzeRequest):
    # Pipeline Asli TKG (Brain v4.1)
    file_name = req.file_metadata.file_name
    
    # Path mockup utk simulasi atau file sesungguhnya
    base_path = os.getenv("UPLOAD_DIR", "/tmp/paax_uploads")
    file_path = os.path.join(base_path, file_name)
    
    raw_text = ""
    classification = "Unclassified"
    tkg_doc = None
    tkg_text = None
    
    warnings = [
        DrawingWarning(
            id=str(uuid.uuid4()), 
            message="Sistem menggunakan TKG Pipeline V1.0 (Real PyMuPDF Extraction).", 
            level="INFO", 
            related_elements=[]
        )
    ]
    
    if os.path.exists(file_path) and file_name.endswith('.pdf'):
        # 1. Triase & Split (SK-01)
        pdf_processor = PdfRenderer()
        pdf_res = pdf_processor.process(file_path)
        
        if pdf_res["status"] == "success" and pdf_res["sheets"]:
            sheet = pdf_res["sheets"][0]
            raw_text = sheet.get("raw_text", "")
            
            # 2. OCR Normalization (SK-10)
            ocr = OcrExtractor()
            ocr_res = ocr.process(raw_text)
            normalized_text = ocr_res["normalized_text"]
            
            # 3. Klasifikasi (SK-02)
            classifier = DrawingClassifier()
            class_res = classifier.process(normalized_text)
            classification = class_res["classification"]
            
            # 4. Tabel & Grid (SK-04, SK-05)
            tables = TableExtractor().process(normalized_text)
            grids = GridExtractor().process(normalized_text)
            
            # 5. Build TKG (SK-07)
            builder_res = build_tkg_from_text(
                project_id=req.file_metadata.project_id or "prj-123",
                revision_id="rev-1",
                sheet_id=sheet["sheet_id"],
                title=file_name,
                raw_text=normalized_text
            )
            
            tkg_doc = builder_res.tkg_json
            tkg_text = builder_res.tkg_txt
            
            # Tambah hasil tabel dan grid ke TKG (Mutate)
            if tkg_doc and "sheets" in tkg_doc and len(tkg_doc["sheets"]) > 0:
                tkg_doc["sheets"][0]["tables"].extend(tables["tables"])
                tkg_doc["sheets"][0]["grid"]["bentang"].extend(grids["grid"]["bentang"])
                tkg_doc["sheets"][0]["levels"].extend(grids["levels"])
                
            if class_res["needs_vision_fallback"]:
                warnings.append(DrawingWarning(
                    id=str(uuid.uuid4()), 
                    message="Confidence klasifikasi rendah, butuh fallback vision LLM.", 
                    level="MEDIUM", 
                    related_elements=[]
                ))
    else:
        warnings.append(DrawingWarning(
            id=str(uuid.uuid4()), 
            message=f"File {file_name} tidak ditemukan di server. Ekstraksi kosong.", 
            level="CRITICAL", 
            related_elements=[]
        ))

    return DrawingAnalysisResponse(
        file_id=str(uuid.uuid4()),
        classification=classification,
        rooms=[],
        doors=[],
        windows=[],
        quantity_candidates=[], # Sengaja dikosongkan untuk menghindari halusinasi (AP-01)
        warnings=warnings,
        tkg_document=tkg_doc,
        tkg_text=tkg_text
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
