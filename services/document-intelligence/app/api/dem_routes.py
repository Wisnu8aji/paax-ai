"""HTTP endpoints for DEM extraction jobs."""
from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from pathlib import Path

import fitz
import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field

from app.artifact_storage import ArtifactStore, ArtifactUnavailable, LocalArtifactStore, S3ArtifactStore, sign_artifact_key, verify_artifact_signature
from app.durable_jobs import DbDurableJobStore, InMemoryDurableJobStore
from app.security import MAX_UPLOAD_BYTES, MalwareScanner, sanitise_filename, scan_or_reject, validate_pdf_magic, validate_pdf_policy
from app.transcription.db_client import DemDbClient
from app.auth import User, get_current_user
from app.drawing_intelligence.models import BBox, DrawingPackageAnalysis, WorkItemCalculation
from app.drawing_intelligence.human_delivery import build_human_delivery
from app.drawing_intelligence.calculation_bridge import (
    CalculationNotReady, CoreEngineCalculationClient, build_calculation_request, calculation_from_response,
)
from app.drawing_intelligence.review_ledger import (
    ReviewDecisionRequest, ReviewLedger, append_decision, apply_ledger_to_human_delivery, empty_ledger,
)
from app.drawing_intelligence.vector_geometry import (
    find_similar_by_examples,
    one_click_area,
    one_click_line,
)
from app.drawing_intelligence.topology import trace_connected_line
from app.drawing_intelligence.prototype_store import (
    PrototypeRegistry, PrototypeSample, add_prototype_version, empty_registry,
)
from app.drawing_intelligence.vector_geometry import descriptor_for_bbox

router = APIRouter(prefix="/drawings/dem", tags=["DEM"])
PROMPT_VERSION = "dem-extraction-v1.0.0"


class OneClickAreaRequest(BaseModel):
    page_index: int = Field(ge=0)
    positive_points: list[tuple[float, float]] = Field(min_length=1)
    negative_points: list[tuple[float, float]] = Field(default_factory=list)


class OneClickLineRequest(BaseModel):
    page_index: int = Field(ge=0)
    point: tuple[float, float]


class FindSimilarRequest(BaseModel):
    page_index: int = Field(ge=0)
    positive_bboxes: list[BBox] = Field(min_length=1)
    negative_bboxes: list[BBox] = Field(default_factory=list)
    threshold: float = Field(default=0.78, ge=0, le=1)


class PrototypeSampleRequest(BaseModel):
    page_index: int = Field(ge=0)
    bbox: BBox
    label: str


class PrototypeCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    category: str = Field(min_length=2, max_length=80)
    samples: list[PrototypeSampleRequest] = Field(min_length=1)
    threshold: float = Field(default=0.78, ge=0, le=1)
    expected_latest_version: int = Field(default=0, ge=0)


def _validate_normalized_points(points: list[tuple[float, float]]) -> None:
    if any(not (0 <= x <= 1 and 0 <= y <= 1) for x, y in points):
        raise HTTPException(status_code=422, detail="points must be normalized to 0..1")


async def _authorized_run_pdf(run_id: str, user: User) -> tuple[dict, bytes]:
    db_client = DemDbClient()
    run = await db_client.get_run(run_id)
    project_id = run.get("project_id")
    artifact_key = run.get("artifact_key")
    if not project_id or not artifact_key:
        raise HTTPException(status_code=404, detail="run source artifact is unavailable")
    try:
        await db_client.authorize_actor_for_project(user.uid, project_id)
        await db_client.authorize_artifact(project_id, artifact_key, actor_id=user.uid)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 403:
            raise HTTPException(status_code=403, detail="not a member of this project")
        raise
    except Exception:
        raise HTTPException(status_code=403, detail="artifact access denied")
    try:
        return run, ARTIFACT_STORE.get(artifact_key)
    except ArtifactUnavailable:
        raise HTTPException(status_code=404, detail="run source artifact is unavailable")


def _open_run_page(pdf_bytes: bytes, page_index: int) -> tuple[fitz.Document, fitz.Page]:
    try:
        document = fitz.open(stream=pdf_bytes, filetype="pdf")
    except fitz.FileDataError as exc:
        raise HTTPException(status_code=422, detail=f"stored artifact is not a valid PDF: {exc}") from exc
    if page_index < 0 or page_index >= document.page_count:
        document.close()
        raise HTTPException(status_code=422, detail="page_index is outside the PDF")
    return document, document[page_index]


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


def _artifact_etag(content: bytes) -> str:
    return f'"sha256-{hashlib.sha256(content).hexdigest()}"'


def _single_byte_range(header: str | None, size: int) -> tuple[int, int] | None:
    if header is None:
        return None
    if size <= 0 or not header.startswith("bytes="):
        raise ValueError("invalid byte range")
    spec = header.removeprefix("bytes=")
    if not spec or "," in spec or "-" not in spec:
        raise ValueError("invalid byte range")
    start_text, end_text = spec.split("-", 1)
    if not start_text and not end_text:
        raise ValueError("invalid byte range")
    if not start_text:
        if not end_text.isdigit() or int(end_text) <= 0:
            raise ValueError("invalid byte range")
        return max(0, size - int(end_text)), size - 1
    if not start_text.isdigit() or (end_text and not end_text.isdigit()):
        raise ValueError("invalid byte range")
    start = int(start_text)
    end = int(end_text) if end_text else size - 1
    if start >= size or end < start:
        raise ValueError("invalid byte range")
    return start, min(end, size - 1)


def _artifact_response_headers(content: bytes) -> dict[str, str]:
    return {
        "Accept-Ranges": "bytes",
        "Content-Length": str(len(content)),
        "ETag": _artifact_etag(content),
        "Cache-Control": "private, max-age=0, must-revalidate",
    }


@router.get("/{run_id}/artifact")
async def consume_artifact_url(run_id: str, token: str, request: Request):
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
        content = ARTIFACT_STORE.get(key)
    except ArtifactUnavailable:
        raise HTTPException(status_code=404, detail="artifact unavailable")
    headers = _artifact_response_headers(content)
    etag = headers["ETag"]
    if request.headers.get("if-none-match") in {"*", etag}:
        return Response(status_code=304, headers=headers)
    try:
        byte_range = _single_byte_range(request.headers.get("range"), len(content))
    except ValueError:
        headers["Content-Range"] = f"bytes */{len(content)}"
        headers.pop("Content-Length", None)
        return Response(status_code=416, headers=headers)
    if byte_range is None:
        return Response(content=content, media_type="application/pdf", headers=headers)
    start, end = byte_range
    partial = content[start:end + 1]
    headers["Content-Range"] = f"bytes {start}-{end}/{len(content)}"
    headers["Content-Length"] = str(len(partial))
    return Response(content=partial, media_type="application/pdf", status_code=206, headers=headers)


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
async def trigger_synthesis(
    run_id: str, analysis_mode: str = "fast", user: User = Depends(get_current_user)
):
    if analysis_mode not in {"fast", "balanced", "deep"}:
        raise HTTPException(status_code=422, detail="analysis_mode must be fast, balanced, or deep")
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
        "dem.synthesize", {"run_id": run_id, "project_id": project_id, "analysis_mode": analysis_mode},
        idempotency_key=f"dem.synthesize:{run_id}",
    )
    
    return {"run_id": run_id, "status": "synthesis_started", "analysis_mode": analysis_mode}


def _calculation_object_key(run_id: str, work_item_id: str) -> str:
    safe = hashlib.sha256(work_item_id.encode("utf-8")).hexdigest()[:24]
    return f"runs/{run_id}/calculations/{safe}.json"


def _apply_saved_calculations(run_id: str, analysis: DrawingPackageAnalysis) -> DrawingPackageAnalysis:
    items = []
    calculated = 0
    for item in analysis.work_items:
        key = f"drawing-intelligence/{_calculation_object_key(run_id, item.work_item_id)}"
        try:
            payload = json.loads(ARTIFACT_STORE.get(key))
            calculation = WorkItemCalculation.model_validate(payload)
        except ArtifactUnavailable:
            calculation = None
        except (ValueError, TypeError, json.JSONDecodeError):
            calculation = None
        if calculation is not None:
            calculated += calculation.status == "complete"
            items.append(item.model_copy(update={
                "calculation": calculation,
                "calculation_readiness": "calculated" if calculation.status == "complete" else item.calculation_readiness,
                "maturity": "calculated" if calculation.status == "complete" else item.maturity,
            }, deep=True))
        else:
            items.append(item)
    metrics = dict(analysis.metrics)
    metrics["final_quantities_calculated"] = calculated
    return analysis.model_copy(update={"work_items": items, "metrics": metrics}, deep=True)


@router.get("/{run_id}/intelligence")
async def get_package_intelligence(
    run_id: str, view: str = "summary", user: User = Depends(get_current_user)
):
    if view not in {"summary", "human", "full"}:
        raise HTTPException(status_code=422, detail="view must be summary, human, or full")
    db_client = DemDbClient()
    run = await db_client.get_run(run_id)
    project_id = run.get("project_id")
    if not project_id:
        raise HTTPException(status_code=404, detail="run has no project scope")
    try:
        await db_client.authorize_actor_for_project(user.uid, project_id)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 403:
            raise HTTPException(status_code=403, detail="not a member of this project")
        raise
    key = f"drawing-intelligence/runs/{run_id}/package-analysis.json"
    try:
        raw = ARTIFACT_STORE.get(key)
        payload = json.loads(raw)
    except ArtifactUnavailable:
        raise HTTPException(status_code=404, detail="package intelligence is not available yet")
    if view == "full":
        return payload
    analysis = _apply_saved_calculations(run_id, DrawingPackageAnalysis.model_validate(payload))
    human = build_human_delivery(analysis)
    ledger_object_key = f"runs/{run_id}/review-ledger.json"
    ledger_key = f"drawing-intelligence/{ledger_object_key}"
    legacy_ledger_key = f"drawing-intelligence-review-ledger/{ledger_key}"
    try:
        ledger = ReviewLedger.model_validate_json(ARTIFACT_STORE.get(ledger_key))
    except ArtifactUnavailable:
        try:
            ledger = ReviewLedger.model_validate_json(ARTIFACT_STORE.get(legacy_ledger_key))
        except ArtifactUnavailable:
            ledger = empty_ledger(run_id, analysis)
    human = apply_ledger_to_human_delivery(human, ledger)
    if view == "human":
        return human
    # Backward-compatible compact shape, now backed by the human projection so
    # noisy audit candidates are no longer presented as work items.
    return {
        "schema_version": human.get("schema_version"),
        "package_id": human.get("package_id"),
        "document_name": human.get("document_name"),
        "metrics": human.get("metrics", {}),
        "phase_status": human.get("phase_status", {}),
        "warnings": human.get("warnings", []),
        "work_items": human.get("work_items", []),
        "work_groups": human.get("work_groups", []),
        "needs_clarification": human.get("needs_clarification", []),
        "suppressed_candidate_count": len(human.get("suppressed_candidates", [])),
        "review_summary": human.get("summary", {}),
        "review_batches": human.get("review_batches", []),
        "accepted_drawing_objects": human.get("accepted_drawing_objects", []),
        "review_task_count": len(human.get("review_queue", [])),
        "review_ledger": human.get("review_ledger", {}),
    }


@router.post("/{run_id}/intelligence/reviews")
async def submit_package_intelligence_review(
    run_id: str, request: ReviewDecisionRequest, user: User = Depends(get_current_user)
):
    db_client = DemDbClient()
    run = await db_client.get_run(run_id)
    project_id = run.get("project_id")
    if not project_id:
        raise HTTPException(status_code=404, detail="run has no project scope")
    try:
        await db_client.authorize_actor_for_project(user.uid, project_id)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 403:
            raise HTTPException(status_code=403, detail="not a member of this project")
        raise
    analysis_key = f"drawing-intelligence/runs/{run_id}/package-analysis.json"
    ledger_object_key = f"runs/{run_id}/review-ledger.json"
    ledger_key = f"drawing-intelligence/{ledger_object_key}"
    legacy_ledger_key = f"drawing-intelligence-review-ledger/{ledger_key}"
    try:
        analysis = DrawingPackageAnalysis.model_validate_json(ARTIFACT_STORE.get(analysis_key))
    except ArtifactUnavailable:
        raise HTTPException(status_code=404, detail="package intelligence is not available yet")
    try:
        ledger = ReviewLedger.model_validate_json(ARTIFACT_STORE.get(ledger_key))
    except ArtifactUnavailable:
        try:
            ledger = ReviewLedger.model_validate_json(ARTIFACT_STORE.get(legacy_ledger_key))
        except ArtifactUnavailable:
            ledger = empty_ledger(run_id, analysis)
    try:
        updated = append_decision(ledger, request, actor_id=user.uid, analysis=analysis)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        status = 409 if "stale review ledger" in str(exc) else 422
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    ARTIFACT_STORE.put(
        "drawing-intelligence",
        updated.model_dump_json(indent=2).encode("utf-8"),
        content_type="application/json",
        object_key=ledger_object_key,
    )
    delivery = apply_ledger_to_human_delivery(build_human_delivery(analysis), updated)
    return {
        "status": "recorded",
        "ledger_version": updated.version,
        "event": updated.events[-1].model_dump(mode="json"),
        "accepted_drawing_objects": delivery.get("accepted_drawing_objects", []),
    }


@router.post("/{run_id}/intelligence/items/{work_item_id}/calculate")
async def calculate_package_work_item(
    run_id: str, work_item_id: str, user: User = Depends(get_current_user)
):
    db_client = DemDbClient()
    run = await db_client.get_run(run_id)
    project_id = run.get("project_id")
    if not project_id:
        raise HTTPException(status_code=404, detail="run has no project scope")
    try:
        await db_client.authorize_actor_for_project(user.uid, project_id)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 403:
            raise HTTPException(status_code=403, detail="not a member of this project")
        raise
    analysis_key = f"drawing-intelligence/runs/{run_id}/package-analysis.json"
    try:
        analysis = DrawingPackageAnalysis.model_validate_json(ARTIFACT_STORE.get(analysis_key))
    except ArtifactUnavailable:
        raise HTTPException(status_code=404, detail="package intelligence is not available yet")
    item = next((value for value in analysis.work_items if value.work_item_id == work_item_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="work item is not available")
    try:
        request_payload = build_calculation_request(
            item, project_id=str(project_id), snapshot_id=analysis.package_id, requested_by=user.uid,
        )
    except CalculationNotReady as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    try:
        response = await CoreEngineCalculationClient.from_env().calculate(request_payload)
    except (RuntimeError, httpx.HTTPError) as exc:
        raise HTTPException(status_code=503, detail=f"Core Engine calculation unavailable: {exc}") from exc
    calculation = calculation_from_response(item, response)
    ARTIFACT_STORE.put(
        "drawing-intelligence", calculation.model_dump_json(indent=2).encode("utf-8"),
        content_type="application/json",
        object_key=_calculation_object_key(run_id, work_item_id),
    )
    return calculation.model_dump(mode="json")


@router.get("/{run_id}/intelligence/prototypes")
async def list_drawing_prototypes(run_id: str, user: User = Depends(get_current_user)):
    run, _ = await _authorized_run_pdf(run_id, user)
    project_id = run.get("project_id")
    object_key = f"runs/{run_id}/prototype-registry.json"
    key = f"drawing-intelligence/{object_key}"
    legacy_key = f"drawing-intelligence-prototype-registry/{key}"
    try:
        registry = PrototypeRegistry.model_validate_json(ARTIFACT_STORE.get(key))
    except ArtifactUnavailable:
        try:
            registry = PrototypeRegistry.model_validate_json(ARTIFACT_STORE.get(legacy_key))
        except ArtifactUnavailable:
            registry = empty_registry(project_id, f"run-{run_id}")
    return registry.model_dump(mode="json")


@router.post("/{run_id}/intelligence/prototypes")
async def create_drawing_prototype(
    run_id: str, request: PrototypeCreateRequest, user: User = Depends(get_current_user)
):
    run, pdf_bytes = await _authorized_run_pdf(run_id, user)
    project_id = run.get("project_id")
    object_key = f"runs/{run_id}/prototype-registry.json"
    key = f"drawing-intelligence/{object_key}"
    legacy_key = f"drawing-intelligence-prototype-registry/{key}"
    try:
        registry = PrototypeRegistry.model_validate_json(ARTIFACT_STORE.get(key))
    except ArtifactUnavailable:
        try:
            registry = PrototypeRegistry.model_validate_json(ARTIFACT_STORE.get(legacy_key))
        except ArtifactUnavailable:
            registry = empty_registry(project_id, f"run-{run_id}")
    same = [version for version in registry.versions if version.name == request.name and version.category == request.category]
    latest_version = max((version.version for version in same), default=0)
    if latest_version != request.expected_latest_version:
        raise HTTPException(
            status_code=409,
            detail=f"stale prototype version: expected {request.expected_latest_version}, current {latest_version}",
        )
    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        samples = []
        for index, sample in enumerate(request.samples):
            if sample.label not in {"positive", "negative"}:
                raise HTTPException(status_code=422, detail="sample label must be positive or negative")
            if sample.bbox.space != "normalized":
                raise HTTPException(status_code=422, detail="prototype bbox must be normalized")
            if sample.page_index >= document.page_count:
                raise HTTPException(status_code=422, detail="prototype sample page is outside the PDF")
            descriptor, _ = descriptor_for_bbox(document[sample.page_index], sample.bbox)
            samples.append(PrototypeSample(
                sample_id=f"sample-{run_id}-{request.expected_latest_version + 1}-{index}",
                page_index=sample.page_index,
                bbox=sample.bbox.model_dump(mode="json"),
                descriptor=descriptor,
                label=sample.label,
            ))
    finally:
        document.close()
    try:
        updated = add_prototype_version(
            registry,
            name=request.name,
            category=request.category,
            source_document_sha256=str(run.get("document_hash") or "").removeprefix("sha256:"),
            samples=samples,
            actor_id=user.uid,
            threshold=request.threshold,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    ARTIFACT_STORE.put(
        "drawing-intelligence",
        updated.model_dump_json(indent=2).encode("utf-8"),
        content_type="application/json",
        object_key=object_key,
    )
    return updated.versions[-1].model_dump(mode="json")


@router.post("/{run_id}/tools/one-click-area")
async def run_one_click_area(
    run_id: str, request: OneClickAreaRequest, user: User = Depends(get_current_user)
):
    _validate_normalized_points([*request.positive_points, *request.negative_points])
    _, pdf_bytes = await _authorized_run_pdf(run_id, user)
    document, page = _open_run_page(pdf_bytes, request.page_index)
    try:
        result = one_click_area(
            page, request.page_index, request.positive_points, request.negative_points
        )
        return {
            **result.model_dump(mode="json"),
            "authority": "measurement_candidate",
            "final_quantity": False,
        }
    finally:
        document.close()


@router.post("/{run_id}/tools/one-click-line")
async def run_one_click_line(
    run_id: str, request: OneClickLineRequest, user: User = Depends(get_current_user)
):
    _validate_normalized_points([request.point])
    _, pdf_bytes = await _authorized_run_pdf(run_id, user)
    document, page = _open_run_page(pdf_bytes, request.page_index)
    try:
        result = one_click_line(page, request.page_index, request.point)
        return {
            **result.model_dump(mode="json"),
            "authority": "measurement_candidate",
            "final_quantity": False,
        }
    finally:
        document.close()


@router.post("/{run_id}/tools/connected-line")
async def run_connected_line(
    run_id: str, request: OneClickLineRequest, user: User = Depends(get_current_user)
):
    _validate_normalized_points([request.point])
    _, pdf_bytes = await _authorized_run_pdf(run_id, user)
    document, page = _open_run_page(pdf_bytes, request.page_index)
    try:
        return trace_connected_line(page, request.page_index, request.point).model_dump(mode="json")
    finally:
        document.close()


@router.post("/{run_id}/tools/find-similar")
async def run_find_similar(
    run_id: str, request: FindSimilarRequest, user: User = Depends(get_current_user)
):
    if any(box.space != "normalized" for box in [*request.positive_bboxes, *request.negative_bboxes]):
        raise HTTPException(status_code=422, detail="reference bboxes must use normalized coordinates")
    _, pdf_bytes = await _authorized_run_pdf(run_id, user)
    document, page = _open_run_page(pdf_bytes, request.page_index)
    try:
        candidates = find_similar_by_examples(
            page,
            request.page_index,
            request.positive_bboxes,
            negative_bboxes=request.negative_bboxes,
            threshold=request.threshold,
        )
        return {
            "page_index": request.page_index,
            "threshold": request.threshold,
            "count_semantics": "candidate_detection_not_verified_physical_count",
            "candidates": [candidate.model_dump(mode="json") for candidate in candidates],
        }
    finally:
        document.close()


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
