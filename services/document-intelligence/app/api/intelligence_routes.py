from __future__ import annotations

import json
import os
from pathlib import Path

import fitz
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.drawing_intelligence.models import BBox, DrawingPackageAnalysis, InteractiveMeasurement
from app.drawing_intelligence.ingestion import DrawingInputError, detect_input_kind
from app.drawing_intelligence.pipeline import analyze_drawing_package
from app.drawing_intelligence.delivery import build_user_delivery
from app.drawing_intelligence.human_delivery import build_human_delivery
from app.drawing_intelligence.vector_geometry import find_similar_by_examples, find_similar_vectors, one_click_area, one_click_line
from app.drawing_intelligence.topology import trace_connected_line
from app.security import MAX_UPLOAD_BYTES, sanitise_filename, validate_pdf_magic


router = APIRouter(prefix="/drawings/intelligence", tags=["Drawing Intelligence Tools"])


async def _read_drawing(file: UploadFile) -> tuple[str, bytes]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")
    safe_name = sanitise_filename(file.filename)
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds configured upload limit")
    if detect_input_kind(safe_name, content) == "unknown":
        raise HTTPException(status_code=422, detail="unsupported drawing format; accepted: PDF, DWG, DXF, PNG, JPG, TIFF")
    return safe_name, content


async def _read_pdf(file: UploadFile) -> tuple[str, bytes]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")
    safe_name = sanitise_filename(file.filename)
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds configured upload limit")
    if not validate_pdf_magic(content):
        raise HTTPException(status_code=400, detail="Only valid PDF files are supported")
    return safe_name, content


def _dem_fixture_dir() -> Path | None:
    value = os.environ.get("DI_DEM_FIXTURE_DIR", "").strip()
    if not value:
        return None
    path = Path(value)
    return path if path.is_dir() else None


@router.post("/analyze", response_model=DrawingPackageAnalysis)
async def analyze_package(
    file: UploadFile = File(...),
    mode: str = Form("balanced"),
    max_pages: int | None = Form(None),
):
    if mode not in {"fast", "balanced", "deep"}:
        raise HTTPException(status_code=422, detail="mode must be fast, balanced, or deep")
    safe_name, content = await _read_drawing(file)
    try:
        return analyze_drawing_package(
            content,
            document_name=safe_name,
            dem_folder=_dem_fixture_dir(),
            mode=mode,  # type: ignore[arg-type]
            max_pages=max_pages,
        )
    except fitz.FileDataError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid PDF: {exc}") from exc


@router.post("/analyze-summary")
async def analyze_package_summary(
    file: UploadFile = File(...),
    mode: str = Form("balanced"),
    max_pages: int | None = Form(None),
):
    if mode not in {"fast", "balanced", "deep"}:
        raise HTTPException(status_code=422, detail="mode must be fast, balanced, or deep")
    safe_name, content = await _read_drawing(file)
    try:
        analysis = analyze_drawing_package(
            content,
            document_name=safe_name,
            dem_folder=_dem_fixture_dir(),
            mode=mode,
            max_pages=max_pages,
        )
    except (fitz.FileDataError, DrawingInputError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return build_user_delivery(analysis)


@router.post("/analyze-human")
async def analyze_package_human(
    file: UploadFile = File(...),
    mode: str = Form("balanced"),
    max_pages: int | None = Form(None),
):
    """Return the civil-engineer/layperson projection, not the raw analysis graph."""
    if mode not in {"fast", "balanced", "deep"}:
        raise HTTPException(status_code=422, detail="mode must be fast, balanced, or deep")
    safe_name, content = await _read_drawing(file)
    try:
        analysis = analyze_drawing_package(
            content, document_name=safe_name, dem_folder=_dem_fixture_dir(),
            mode=mode, max_pages=max_pages,
        )
    except (fitz.FileDataError, DrawingInputError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return build_human_delivery(analysis)


@router.post("/one-click-area", response_model=InteractiveMeasurement)
async def create_one_click_area(
    file: UploadFile = File(...),
    page_index: int = Form(...),
    positive_points_json: str = Form(...),
    negative_points_json: str = Form("[]"),
):
    _, content = await _read_pdf(file)
    positive = _parse_points(positive_points_json)
    negative = _parse_points(negative_points_json)
    document = fitz.open(stream=content, filetype="pdf")
    try:
        if page_index < 0 or page_index >= len(document):
            raise HTTPException(status_code=422, detail="page_index is outside the PDF")
        return one_click_area(document[page_index], page_index, positive, negative)
    finally:
        document.close()


@router.post("/one-click-line", response_model=InteractiveMeasurement)
async def create_one_click_line(
    file: UploadFile = File(...),
    page_index: int = Form(...),
    point_json: str = Form(...),
):
    _, content = await _read_pdf(file)
    points = _parse_points(point_json, single_allowed=True)
    if len(points) != 1:
        raise HTTPException(status_code=422, detail="point_json must contain exactly one normalized point")
    document = fitz.open(stream=content, filetype="pdf")
    try:
        if page_index < 0 or page_index >= len(document):
            raise HTTPException(status_code=422, detail="page_index is outside the PDF")
        return one_click_line(document[page_index], page_index, points[0])
    finally:
        document.close()


@router.post("/connected-line")
async def create_connected_line(
    file: UploadFile = File(...),
    page_index: int = Form(...),
    point_json: str = Form(...),
    tolerance_pt: float = Form(1.5),
):
    _, content = await _read_pdf(file)
    points = _parse_points(point_json, single_allowed=True)
    if len(points) != 1:
        raise HTTPException(status_code=422, detail="point_json must contain exactly one normalized point")
    document = fitz.open(stream=content, filetype="pdf")
    try:
        if page_index < 0 or page_index >= len(document):
            raise HTTPException(status_code=422, detail="page_index is outside the PDF")
        return trace_connected_line(document[page_index], page_index, points[0], tolerance_pt=tolerance_pt)
    finally:
        document.close()


@router.post("/find-similar-by-example")
async def find_similar_by_example(
    file: UploadFile = File(...),
    page_index: int = Form(...),
    positive_bboxes_json: str = Form(...),
    negative_bboxes_json: str = Form("[]"),
    threshold: float = Form(0.78),
):
    _, content = await _read_pdf(file)
    positive = _parse_bboxes(positive_bboxes_json)
    negative = _parse_bboxes(negative_bboxes_json)
    if not 0 <= threshold <= 1:
        raise HTTPException(status_code=422, detail="threshold must be between 0 and 1")
    document = fitz.open(stream=content, filetype="pdf")
    try:
        if page_index < 0 or page_index >= len(document):
            raise HTTPException(status_code=422, detail="page_index is outside the PDF")
        candidates = find_similar_by_examples(
            document[page_index], page_index, positive,
            negative_bboxes=negative, threshold=threshold,
        )
        return {
            "page_index": page_index,
            "threshold": threshold,
            "count_semantics": "candidate_detection_not_verified_physical_count",
            "candidates": [candidate.model_dump(mode="json") for candidate in candidates],
        }
    finally:
        document.close()


@router.post("/find-similar")
async def find_similar(
    file: UploadFile = File(...),
    page_index: int = Form(...),
    reference_bbox_json: str = Form(...),
    threshold: float = Form(0.78),
):
    _, content = await _read_pdf(file)
    try:
        values = json.loads(reference_bbox_json)
        box = BBox(x0=values[0], y0=values[1], x1=values[2], y1=values[3], space="normalized")
    except (ValueError, TypeError, IndexError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail="reference_bbox_json must be [x0,y0,x1,y1] in 0..1") from exc
    if not 0 <= threshold <= 1:
        raise HTTPException(status_code=422, detail="threshold must be between 0 and 1")
    document = fitz.open(stream=content, filetype="pdf")
    try:
        if page_index < 0 or page_index >= len(document):
            raise HTTPException(status_code=422, detail="page_index is outside the PDF")
        candidates = find_similar_vectors(document[page_index], page_index, box, threshold=threshold)
        return {"page_index": page_index, "threshold": threshold, "candidates": [c.model_dump(mode="json") for c in candidates]}
    finally:
        document.close()


def _parse_points(value: str, *, single_allowed: bool = False) -> list[tuple[float, float]]:
    try:
        raw = json.loads(value)
        if single_allowed and isinstance(raw, list) and len(raw) == 2 and all(isinstance(v, (int, float)) for v in raw):
            raw = [raw]
        points = [(float(item[0]), float(item[1])) for item in raw]
    except (ValueError, TypeError, IndexError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail="points must be JSON arrays of normalized [x,y]") from exc
    if any(not (0 <= x <= 1 and 0 <= y <= 1) for x, y in points):
        raise HTTPException(status_code=422, detail="all points must be normalized to 0..1")
    return points


def _parse_bboxes(value: str) -> list[BBox]:
    try:
        raw = json.loads(value)
        return [BBox(x0=float(v[0]), y0=float(v[1]), x1=float(v[2]), y1=float(v[3]), space="normalized") for v in raw]
    except (ValueError, TypeError, IndexError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail="bboxes must be JSON arrays of [x0,y0,x1,y1] in 0..1") from exc
