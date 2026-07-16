"""HTTP endpoints for DEM extraction jobs."""
from __future__ import annotations

import hashlib
import uuid

import fitz
from fastapi import APIRouter, BackgroundTasks, File, Form, UploadFile

from app.transcription.db_client import DemDbClient
from app.transcription.document_loop import process_document
from app.transcription.providers.qwen import QwenDemAdapter

router = APIRouter(prefix="/drawings/dem", tags=["DEM"])
PROMPT_VERSION = "dem-extraction-v1.0.0"


@router.post("/start")
async def start_dem_run(background_tasks: BackgroundTasks, file: UploadFile = File(...), project_id: str | None = Form(default=None)):
    pdf_bytes = await file.read()
    document_hash = f"sha256:{hashlib.sha256(pdf_bytes).hexdigest()}"
    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        total_pages = document.page_count
    finally:
        document.close()
    document_id = f"DOC-{uuid.uuid4().hex[:8]}"
    db_client = DemDbClient()
    run = await db_client.create_run(project_id=project_id, document_id=document_id, document_hash=document_hash, file_name=file.filename or "unknown.pdf", total_pages=total_pages, provider="qwen", prompt_version=PROMPT_VERSION)
    provider = QwenDemAdapter.from_env()
    if provider is None:
        return {"run_id": run["id"], "status": "requires_review", "message": "DRAWING_INTELLIGENCE_API_KEY not configured"}
    background_tasks.add_task(
        process_document, pdf_bytes=pdf_bytes, run_id=run["id"], document_id=document_id,
        document_hash=document_hash, total_pages=total_pages, provider=provider, db_client=db_client,
        prompt_version=PROMPT_VERSION, project_id=project_id, file_name=file.filename or "unknown.pdf",
    )
    return {"run_id": run["id"], "status": "pages_queued", "total_pages": total_pages}


@router.get("/{run_id}/status")
async def get_dem_status(run_id: str):
    return await DemDbClient().get_run_status(run_id)
