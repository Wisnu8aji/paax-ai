import os
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter(prefix="/upload", tags=["Upload"])

# Sama dengan default di drawing_routes.py — file yang diunggah di sini WAJIB
# ditemukan lagi oleh /drawings/analyze lewat file_name yang sama.
UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(tempfile.gettempdir(), "paax_uploads"))

# Guard ukuran sederhana (bukan validasi konten) — hindari file raksasa
# memenuhi disk lokal saat pengembangan.
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post("")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nama file kosong.")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    dest_path = os.path.join(UPLOAD_DIR, file.filename)

    size = 0
    with open(dest_path, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                out.close()
                os.remove(dest_path)
                raise HTTPException(status_code=413, detail="File lebih dari 50 MB — belum didukung.")
            out.write(chunk)

    return {"filename": file.filename, "status": "uploaded", "size_bytes": size}
