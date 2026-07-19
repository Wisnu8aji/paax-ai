"""HTTP endpoints for DEM extraction jobs."""
from __future__ import annotations

import hashlib
import os
import time
import uuid
from pathlib import Path

import fitz
import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile

from app.artifact_storage import ArtifactStore, ArtifactUnavailable, LocalArtifactStore, S3ArtifactStore, sign_artifact_key, verify_artifact_signature
from app.durable_jobs import DbDurableJobStore, InMemoryDurableJobStore
from app.security import MAX_UPLOAD_BYTES, MalwareScanner, sanitise_filename, scan_or_reject, validate_pdf_magic, validate_pdf_policy
from app.transcription.db_client import DemDbClient
from app.auth import User, get_current_user

router = APIRouter(prefix="/drawings/dem", tags=["DEM"])
PROMPT_VERSION = "dem-extraction-v1.0.0"


# These defaults are deliberately object-key based. Production replaces both
# adapters with shared object storage and the DB-backed queue at startup --
# see _durable_adapters_or_fail_startup below, which refuses to let the
# process even come up with these non-durable defaults when ENV=production.
# A previous audit found no composition root ever overrode them: process
# restart silently loses the queue, and local artifacts are not portable
# across instances/Cloud Run's ephemeral filesystem.
def _durable_adapters_or_fail_startup() -> tuple[ArtifactStore, object]:
    env_mode = os.environ.get("ENV", "development")
    artifact_backend = os.environ.get("ARTIFACT_STORE_BACKEND", "local")
    job_queue_backend = os.environ.get("JOB_QUEUE_BACKEND", "memory")
    if env_mode == "production":
        if artifact_backend == "local":
            raise RuntimeError(
                "ARTIFACT_STORE_BACKEND=local is not durable and must not run in "
                "production (ENV=production). Configure a real object-storage "
                "backend, or set ARTIFACT_STORE_BACKEND explicitly if this "
                "process is intentionally non-production."
            )
        if job_queue_backend == "memory":
            raise RuntimeError(
                "JOB_QUEUE_BACKEND=memory is not durable and must not run in "
                "production (ENV=production). Configure a real durable queue "
                "backend, or set JOB_QUEUE_BACKEND explicitly if this process "
                "is intentionally non-production."
            )
    job_queue = DbDurableJobStore() if job_queue_backend == "durable-db" else InMemoryDurableJobStore()
    artifact_store: ArtifactStore = (
        S3ArtifactStore() if artifact_backend == "s3" else LocalArtifactStore(Path(__file__).resolve().parents[2] / ".artifacts")
    )
    return (artifact_store, job_queue)


ARTIFACT_STORE, JOB_QUEUE = _durable_adapters_or_fail_startup()
MALWARE_SCANNER: MalwareScanner | None = None
_RATE: dict[str, list[float]] = {}


async def _enqueue_job(job_type: str, payload: dict, *, idempotency_key: str) -> None:
    """Uniform call for both the sync in-memory store and the async
    DB-backed store (DbDurableJobStore.enqueue makes an HTTP call)."""
    result = JOB_QUEUE.enqueue(job_type, payload, idempotency_key=idempotency_key)
    if hasattr(result, "__await__"):
        await result


def _rate_limit(actor: str, project_id: str, action: str, *, limit: int = 30) -> None:
    now = time.monotonic(); key = f"{actor}:{project_id}:{action}"
    recent = [value for value in _RATE.get(key, []) if value > now - 60]
    if len(recent) >= limit:
        raise HTTPException(status_code=429, detail="artifact rate limit exceeded")
    recent.append(now); _RATE[key] = recent


def _artifact_signing_secret() -> bytes:
    """A predictable fallback secret would let anyone who reads this source
    forge artifact URLs against any deployment that forgot to set
    ARTIFACT_SIGNING_SECRET. The fallback is only acceptable under an
    explicit TESTING=1 flag (matching the internal-service-key convention in
    app/auth.py); otherwise a missing secret must fail the request, not
    silently sign with a well-known value."""
    secret = os.getenv("ARTIFACT_SIGNING_SECRET")
    if secret:
        return secret.encode()
    if os.environ.get("TESTING") == "1":
        return b"development-only-artifact-secret"
    raise HTTPException(status_code=500, detail="ARTIFACT_SIGNING_SECRET is not configured")


@router.post("/start")
async def start_dem_run(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    user: User = Depends(get_current_user),
):
    # Actor identity (who is asking) is `user`, resolved from the caller's own
    # credential -- never trusted from a request body field. project_id is
    # required (not optional) precisely because there is no run yet to
    # resolve a project scope from; the caller must state which project they
    # are authorized to write into, and that claim is verified below against
    # services/db's authoritative ProjectMember/owner data before anything
    # is created. This closes the gap where any authenticated caller could
    # previously start a DEM run under an arbitrary project_id and have the
    # (internal-service-authenticated) pipeline act on it regardless of
    # whether the real user had any relationship to that project.
    try:
        await DemDbClient().authorize_actor_for_project(user.uid, project_id)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 403:
            raise HTTPException(status_code=403, detail="not a member of this project")
        raise

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
    if file.content_type not in {"application/pdf", "application/x-pdf", None}:
        raise HTTPException(status_code=415, detail="Upload MIME type must be application/pdf")

    safe_filename = sanitise_filename(file.filename) if file.filename else "unknown.pdf"

    document_hash = f"sha256:{hashlib.sha256(pdf_bytes).hexdigest()}"
    try:
        total_pages = validate_pdf_policy(pdf_bytes)
        scan_or_reject(MALWARE_SCANNER, pdf_bytes, filename=safe_filename)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    document_id = f"DOC-{uuid.uuid4().hex[:8]}"

    # ── Security: sanitise filename (path-traversal prevention) ───────────────
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
        requested_by=user.uid,
    )
    await _enqueue_job(
        "dem.extract",
        {"run_id": run["id"], "document_id": document_id, "document_hash": document_hash,
         "total_pages": total_pages, "artifact_key": artifact_key, "project_id": project_id,
         "file_name": safe_filename, "prompt_version": PROMPT_VERSION},
        idempotency_key=f"dem.extract:{run['id']}",
    )
    return {"run_id": run["id"], "status": "pages_queued", "total_pages": total_pages}


@router.get("/{run_id}/pages/{page_index}/image")
async def get_page_image(run_id: str, page_index: int, user: User = Depends(get_current_user)):
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
    project_id = run.get("project_id")
    if not project_id:
        raise HTTPException(status_code=403, detail="artifact has no project scope")
    _rate_limit(user.uid, project_id, "read")
    try:
        await db_client.authorize_artifact(project_id, artifact_key, actor_id=user.uid)
    except Exception:
        raise HTTPException(status_code=403, detail="artifact access denied")

    from app.transcription.page_renderer import render_page_to_png
    try:
        pdf_bytes = ARTIFACT_STORE.get(artifact_key)
        png_bytes = render_page_to_png(pdf_bytes, page_index)
    except ArtifactUnavailable:
        raise HTTPException(status_code=503, detail="Original PDF artifact is unavailable")
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Failed to render page: {str(exc)}")

    return Response(content=png_bytes, media_type="image/png")


@router.post("/{run_id}/artifact-url")
async def issue_artifact_url(run_id: str, user: User = Depends(get_current_user)):
    run = await DemDbClient().get_run(run_id)
    project_id, key = run.get("project_id"), run.get("artifact_key")
    if not project_id or not key:
        raise HTTPException(status_code=404, detail="artifact not found")
    db_client = DemDbClient()
    await db_client.authorize_artifact(project_id, key, actor_id=user.uid)
    if (await db_client.get_artifact_retention(run_id)).get("deleted_at"):
        raise HTTPException(status_code=410, detail="artifact has been deleted")
    _rate_limit(user.uid, project_id, "sign")
    expiry = int(time.time()) + 300
    secret = _artifact_signing_secret()
    return {"project_id": project_id, "artifact_key": key, "expires_at": expiry, "token": sign_artifact_key(key, secret=secret, expires_at=expiry, project_id=project_id)}


@router.get("/{run_id}/artifact")
async def consume_artifact_url(run_id: str, token: str):
    """Consume a short-lived signed link; token binds project, key, and expiry."""
    db_client = DemDbClient()
    try:
        run = await db_client.get_run(run_id)
    except Exception:
        raise HTTPException(status_code=404, detail="artifact not found")
    project_id, key = run.get("project_id"), run.get("artifact_key")
    if not project_id or not key:
        raise HTTPException(status_code=404, detail="artifact not found")
    if (await db_client.get_artifact_retention(run_id)).get("deleted_at"):
        raise HTTPException(status_code=410, detail="artifact has been deleted")
    secret = _artifact_signing_secret()
    if not verify_artifact_signature(key, token, secret=secret, project_id=project_id):
        raise HTTPException(status_code=403, detail="invalid or expired artifact token")
    try:
        return Response(content=ARTIFACT_STORE.get(key), media_type="application/pdf")
    except ArtifactUnavailable:
        raise HTTPException(status_code=404, detail="artifact unavailable")


@router.delete("/{run_id}/artifact")
async def delete_artifact(run_id: str, user: User = Depends(get_current_user)):
    run = await DemDbClient().get_run(run_id)
    project_id, key = run.get("project_id"), run.get("artifact_key")
    if not project_id or not key:
        raise HTTPException(status_code=404, detail="artifact not found")
    # DB role enforcement is authoritative; delete never accepts a caller key/path.
    db_client = DemDbClient()
    await db_client.authorize_artifact(project_id, key, actor_id=user.uid, action="delete")
    _rate_limit(user.uid, project_id, "delete")
    await db_client.mark_artifact_deleted(run_id, actor_id=user.uid)
    try:
        ARTIFACT_STORE.delete(key)
    except ArtifactUnavailable:
        # Retention tombstone is authoritative and makes retries idempotent.
        pass
    return {"deleted": True, "retention_status": "deleted"}


@router.post("/{run_id}/synthesize")
async def trigger_synthesis(run_id: str, user: User = Depends(get_current_user)):
    db_client = DemDbClient()
    run_status = await db_client.get_run_status(run_id)
    project_id = run_status.get("project_id")
    if not project_id:
        raise HTTPException(status_code=400, detail="Cannot synthesize: DEM run has no project_id")
    # project_id here is resolved from the existing run (server-side truth),
    # not trusted from any caller-supplied field -- knowing a run_id must not
    # be sufficient to trigger synthesis on a project the actor has no
    # relationship to.
    try:
        await db_client.authorize_actor_for_project(user.uid, project_id)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 403:
            raise HTTPException(status_code=403, detail="not a member of this project")
        raise

    current_status = run_status.get("status")
    if current_status in ("synthesis_in_progress", "synthesis_complete"):
        raise HTTPException(status_code=400, detail=f"Synthesis already in progress or complete (status: {current_status})")

    if current_status not in ("dem_complete", "partially_failed", "synthesis_failed"):
        if any(p["status"] not in ("complete", "failed") for p in run_status.get("pages", [])):
            raise HTTPException(status_code=400, detail="Cannot synthesize: Extraction is not complete")

    await db_client.update_run_status(run_id, "synthesis_in_progress")
    await _enqueue_job(
        "dem.synthesize", {"run_id": run_id, "project_id": project_id},
        idempotency_key=f"dem.synthesize:{run_id}",
    )
    
    return {"run_id": run_id, "status": "synthesis_started"}


@router.get("/{run_id}/status")
async def get_dem_status(run_id: str, user: User = Depends(get_current_user)):
    db_client = DemDbClient()
    data = await db_client.get_run_status(run_id)
    project_id = data.get("project_id")
    if project_id:
        try:
            await db_client.authorize_actor_for_project(user.uid, project_id)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 403:
                raise HTTPException(status_code=403, detail="not a member of this project")
            raise
    status = data.get("status")
    if status in ("synthesis_in_progress", "synthesis_complete", "synthesis_failed"):
        data["synthesis_status"] = status
    else:
        data["synthesis_status"] = "pending"
    return data
