"""HTTP endpoints for DEM extraction jobs."""
from __future__ import annotations

import hashlib
import uuid
from pathlib import Path

import fitz
import httpx
from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile

from app.artifact_storage import ArtifactStore, ArtifactUnavailable, LocalArtifactStore
from app.durable_jobs import InMemoryDurableJobStore
from app.security import MAX_UPLOAD_BYTES, sanitise_filename, validate_pdf_magic
from app.transcription.db_client import DemDbClient

router = APIRouter(prefix="/drawings/dem", tags=["DEM"])
PROMPT_VERSION = "dem-extraction-v1.0.0"


# These defaults are deliberately object-key based. Production replaces both
# adapters with shared object storage and the DB-backed queue at startup.
ARTIFACT_STORE: ArtifactStore = LocalArtifactStore(Path(__file__).resolve().parents[2] / ".artifacts")
JOB_QUEUE = InMemoryDurableJobStore()


@router.post("/start")
async def start_dem_run(file: UploadFile = File(...), project_id: str | None = Form(default=None)):
    # ── Security: read with size guard ───────────────────────────────────────
    pdf_bytes = await file.read()
    if len(pdf_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File melebihi batas 50 MB.")

    # ── Security: validate PDF magic bytes before doing anything with content ─
    if not validate_pdf_magic(pdf_bytes):
        raise HTTPException(
            status_code=400,
            detail="File bukan PDF yang valid (magic byte tidak cocok). Hanya file PDF yang didukung.",
        )

    document_hash = f"sha256:{hashlib.sha256(pdf_bytes).hexdigest()}"
    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        total_pages = document.page_count
    finally:
        document.close()
    document_id = f"DOC-{uuid.uuid4().hex[:8]}"

    # ── Security: sanitise filename (path-traversal prevention) ───────────────
    safe_filename = sanitise_filename(file.filename) if file.filename else "unknown.pdf"

    artifact_key = ARTIFACT_STORE.put(
        "original-pdf", pdf_bytes, content_type="application/pdf",
        object_key=f"runs/{document_id}/source.pdf",
    )

    db_client = DemDbClient()
    run = await db_client.create_run(
        project_id=project_id,
        document_id=document_id,
        document_hash=document_hash,
        file_name=safe_filename,
        total_pages=total_pages,
        provider="qwen",
        prompt_version=PROMPT_VERSION,
        artifact_key=artifact_key,
    )
    JOB_QUEUE.enqueue(
        "dem.extract",
        {"run_id": run["id"], "document_id": document_id, "document_hash": document_hash,
         "total_pages": total_pages, "artifact_key": artifact_key, "project_id": project_id,
         "file_name": safe_filename, "prompt_version": PROMPT_VERSION},
        idempotency_key=f"dem.extract:{run['id']}",
    )
    return {"run_id": run["id"], "status": "pages_queued", "total_pages": total_pages}


@router.get("/{run_id}/pages/{page_index}/image")
async def get_page_image(run_id: str, page_index: int):
    """Render (or serve cached) PNG for a single page of a DEM run's source PDF.

    Note: this route previously had a duplicate definition later in this file
    (same path, same method) that FastAPI never dispatched to because route
    matching stops at the first registration -- the duplicate was dead code.
    It has been removed; this implementation keeps the duplicate's broader
    exception handling (catches generic errors from db_client.get_run and
    from cache writes, not just httpx.HTTPStatusError) since that made it the
    safer of the two.
    """
    db_client = DemDbClient()
    try:
        run = await db_client.get_run(run_id)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(status_code=404, detail="DEM run not found")
        raise
    except Exception:
        raise HTTPException(status_code=404, detail="DEM run not found")

    artifact_key = run.get("artifact_key")
    if not artifact_key:
        raise HTTPException(status_code=404, detail="Original PDF not found")

    if page_index < 0 or page_index >= run.get("total_pages", 0):
        raise HTTPException(status_code=404, detail="Page index out of bounds")

    from app.transcription.page_renderer import render_page_to_png
    try:
        pdf_bytes = ARTIFACT_STORE.get(artifact_key)
        png_bytes = render_page_to_png(pdf_bytes, page_index)
    except ArtifactUnavailable:
        raise HTTPException(status_code=503, detail="Original PDF artifact is unavailable")
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Failed to render page: {str(exc)}")

    return Response(content=png_bytes, media_type="image/png")


@router.post("/{run_id}/synthesize")
async def trigger_synthesis(run_id: str):
    db_client = DemDbClient()
    run_status = await db_client.get_run_status(run_id)
    project_id = run_status.get("project_id")
    if not project_id:
        raise HTTPException(status_code=400, detail="Cannot synthesize: DEM run has no project_id")
    
    current_status = run_status.get("status")
    if current_status in ("synthesis_in_progress", "synthesis_complete"):
        raise HTTPException(status_code=400, detail=f"Synthesis already in progress or complete (status: {current_status})")

    if current_status not in ("dem_complete", "partially_failed", "synthesis_failed"):
        if any(p["status"] not in ("complete", "failed") for p in run_status.get("pages", [])):
            raise HTTPException(status_code=400, detail="Cannot synthesize: Extraction is not complete")

    await db_client.update_run_status(run_id, "synthesis_in_progress")
    JOB_QUEUE.enqueue(
        "dem.synthesize", {"run_id": run_id, "project_id": project_id},
        idempotency_key=f"dem.synthesize:{run_id}",
    )
    
    return {"run_id": run_id, "status": "synthesis_started"}


@router.get("/{run_id}/status")
async def get_dem_status(run_id: str):
    data = await DemDbClient().get_run_status(run_id)
    status = data.get("status")
    if status in ("synthesis_in_progress", "synthesis_complete", "synthesis_failed"):
        data["synthesis_status"] = status
    else:
        data["synthesis_status"] = "pending"
    return data
