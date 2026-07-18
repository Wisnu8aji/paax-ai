from fastapi import APIRouter, UploadFile, File, HTTPException
import fitz  # PyMuPDF
from typing import Any, Dict

from app.security import MAX_UPLOAD_BYTES, sanitise_filename, validate_pdf_magic

router = APIRouter(prefix="/pdf", tags=["PDF"])


@router.post("/process")
async def process_pdf(file: UploadFile = File(...)) -> Dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    safe_name = sanitise_filename(file.filename)  # noqa: F841 (used for audit; content validated below)

    content = await file.read()

    # Size limit check
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit.")

    # PDF magic-byte validation
    if not validate_pdf_magic(content):
        raise HTTPException(
            status_code=400,
            detail="File is not a valid PDF (magic byte mismatch). Only PDF files are supported.",
        )

    try:
        doc = fitz.open(stream=content, filetype="pdf")

        pages_text = []
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text = page.get_text("text")
            pages_text.append(text)

        return {"status": "success", "pages": pages_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")
