import os
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.security import MAX_UPLOAD_BYTES, sanitise_filename, validate_pdf_magic

router = APIRouter(prefix="/upload", tags=["Upload"])

# Sama dengan default di drawing_routes.py — file yang diunggah di sini WAJIB
# ditemukan lagi oleh /drawings/analyze lewat file_name yang sama.
UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(tempfile.gettempdir(), "paax_uploads"))


@router.post("")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nama file kosong.")

    safe_name = sanitise_filename(file.filename)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    dest_path = os.path.join(UPLOAD_DIR, safe_name)

    size = 0
    first_chunk = True
    with open(dest_path, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                out.close()
                os.remove(dest_path)
                raise HTTPException(status_code=413, detail="File lebih dari 50 MB — belum didukung.")
            # Validate PDF magic bytes on the first chunk only
            if first_chunk:
                first_chunk = False
                if not validate_pdf_magic(chunk):
                    out.close()
                    os.remove(dest_path)
                    raise HTTPException(
                        status_code=400,
                        detail="File bukan PDF yang valid (magic byte tidak cocok). Hanya file PDF yang didukung.",
                    )
            out.write(chunk)

    return {"filename": safe_name, "status": "uploaded", "size_bytes": size}
