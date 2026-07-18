"""HTTP endpoints for DEM extraction jobs."""
from __future__ import annotations

import hashlib
import os
import tempfile
import uuid

import fitz
import httpx
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Response, UploadFile

from app.security import MAX_UPLOAD_BYTES, sanitise_filename, validate_pdf_magic
from app.transcription.db_client import DemDbClient
from app.transcription.document_loop import process_document
from app.transcription.models import DrawingEvidenceSheet
from app.transcription.providers.qwen import QwenDemAdapter
from app.project_graph.synthesis import synthesize_project_graph

router = APIRouter(prefix="/drawings/dem", tags=["DEM"])
PROMPT_VERSION = "dem-extraction-v1.0.0"


from app.project_graph.synthesis_task import synthesize_and_post_snapshot_task

UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(tempfile.gettempdir(), "paax_uploads"))


@router.post("/start")
async def start_dem_run(background_tasks: BackgroundTasks, file: UploadFile = File(...), project_id: str | None = Form(default=None)):
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

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    # Use document_id prefix so paths stay unique even if two uploads share a name.
    pdf_path = os.path.join(UPLOAD_DIR, f"{document_id}_{safe_filename}")
    with open(pdf_path, "wb") as out:
        out.write(pdf_bytes)

    db_client = DemDbClient()
    run = await db_client.create_run(
        project_id=project_id,
        document_id=document_id,
        document_hash=document_hash,
        file_name=safe_filename,
        total_pages=total_pages,
        provider="qwen",
        prompt_version=PROMPT_VERSION,
        pdf_path=pdf_path
    )
    provider = QwenDemAdapter.from_env()
    if provider is None:
        return {"run_id": run["id"], "status": "requires_review", "message": "DRAWING_INTELLIGENCE_API_KEY not configured"}
    background_tasks.add_task(
        process_document, pdf_bytes=pdf_bytes, run_id=run["id"], document_id=document_id,
        document_hash=document_hash, total_pages=total_pages, provider=provider, db_client=db_client,
        prompt_version=PROMPT_VERSION, project_id=project_id, file_name=safe_filename,
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
    cache_path = os.path.join(UPLOAD_DIR, f"cache_{run_id}_{page_index}.png")
    if os.path.exists(cache_path):
        with open(cache_path, "rb") as f:
            png_bytes = f.read()
        return Response(content=png_bytes, media_type="image/png")

    db_client = DemDbClient()
    try:
        run = await db_client.get_run(run_id)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(status_code=404, detail="DEM run not found")
        raise
    except Exception:
        raise HTTPException(status_code=404, detail="DEM run not found")

    pdf_path = run.get("pdf_path")
    if not pdf_path or not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="Original PDF not found")

    if page_index < 0 or page_index >= run.get("total_pages", 0):
        raise HTTPException(status_code=404, detail="Page index out of bounds")

    from app.transcription.page_renderer import render_page_to_png
    try:
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()
        png_bytes = render_page_to_png(pdf_bytes, page_index)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Failed to render page: {str(exc)}")

    try:
        with open(cache_path, "wb") as f:
            f.write(png_bytes)
    except Exception:
        pass

    return Response(content=png_bytes, media_type="image/png")


@router.post("/{run_id}/synthesize")
async def trigger_synthesis(run_id: str, background_tasks: BackgroundTasks):
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
    background_tasks.add_task(synthesize_and_post_snapshot_task, run_id, project_id, run_status, db_client)
    
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
