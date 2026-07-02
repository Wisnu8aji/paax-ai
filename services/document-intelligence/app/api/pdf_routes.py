from fastapi import APIRouter, UploadFile, File, HTTPException
import fitz  # PyMuPDF
from typing import Any, Dict

router = APIRouter(prefix="/pdf", tags=["PDF"])

@router.post("/process")
async def process_pdf(file: UploadFile = File(...)) -> Dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        
        pages_text = []
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text = page.get_text("text")
            pages_text.append(text)
            
        return {"status": "success", "pages": pages_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")

