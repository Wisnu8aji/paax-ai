from __future__ import annotations

import json
import os
from decimal import Decimal
from pathlib import Path

import fitz
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.drawing_intelligence.advanced_zones import analyze_hierarchical_zones
from app.drawing_intelligence.benchmark_platform import create_locked_plhut_pack, evaluate_facts
from app.drawing_intelligence.definition_intelligence_v2 import (
    build_definition_candidates, extract_table_cells, resolve_definition,
)
from app.drawing_intelligence.domain_skill_packs import default_skill_packs
from app.drawing_intelligence.native_evidence import build_native_evidence_index
from app.drawing_intelligence.revision_intelligence import (
    EntityLink, EntityLinkRepository, RevisionEntity, compare_revisions,
)
from app.drawing_intelligence.takeoff_workspace import (
    ScaleCalibration, TakeoffDocument, TakeoffMeasurement, TakeoffWorkspaceRepository, calculate_measurement,
)
from app.security import MAX_UPLOAD_BYTES, sanitise_filename, validate_pdf_magic

router = APIRouter(prefix="/drawings/intelligence/v2", tags=["Drawing Intelligence V2"])
_REPO_ROOT = Path(__file__).resolve().parents[4]
_TAKEOFF_STORE = Path(os.environ.get("PAAX_TAKEOFF_STORE", _REPO_ROOT / "data" / "portable" / "takeoff-workspace.json"))
_ENTITY_LINK_STORE = Path(os.environ.get("PAAX_ENTITY_LINK_STORE", _REPO_ROOT / "data" / "portable" / "entity-links.json"))
_takeoff_repository = TakeoffWorkspaceRepository(_TAKEOFF_STORE)
_entity_link_repository = EntityLinkRepository(_ENTITY_LINK_STORE)


async def _read_pdf(file: UploadFile) -> bytes:
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")
    sanitise_filename(file.filename)
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds configured upload limit")
    if not validate_pdf_magic(content):
        raise HTTPException(status_code=400, detail="Only valid PDF files are supported")
    return content


def _page(content: bytes, page_index: int) -> tuple[fitz.Document, fitz.Page]:
    document = fitz.open(stream=content, filetype="pdf")
    if page_index < 0 or page_index >= len(document):
        document.close()
        raise HTTPException(status_code=422, detail="page_index is outside the PDF")
    return document, document[page_index]


@router.post("/hierarchical-zones")
async def hierarchical_zones(file: UploadFile = File(...), page_index: int = Form(...)):
    content = await _read_pdf(file)
    document, page = _page(content, page_index)
    try:
        return analyze_hierarchical_zones(page, page_index)
    finally:
        document.close()


@router.post("/native-evidence")
async def native_evidence(file: UploadFile = File(...), page_index: int = Form(...), bbox_json: str | None = Form(None)):
    content = await _read_pdf(file)
    document, page = _page(content, page_index)
    try:
        index = build_native_evidence_index(page, page_index)
        if not bbox_json:
            return index
        try:
            values = [float(v) for v in json.loads(bbox_json)]
            from app.drawing_intelligence.models import BBox
            bbox = BBox(x0=values[0], y0=values[1], x1=values[2], y1=values[3], space="normalized")
        except (ValueError, TypeError, IndexError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=422, detail="bbox_json must be normalized [x0,y0,x1,y1]") from exc
        return {"page_index": page_index, "records": [r.model_dump(mode="json") for r in index.query(bbox)]}
    finally:
        document.close()


@router.post("/schedule-definitions")
async def schedule_definitions(file: UploadFile = File(...), page_index: int = Form(...), code: str | None = Form(None)):
    content = await _read_pdf(file)
    document, page = _page(content, page_index)
    try:
        cells = extract_table_cells(page, page_index)
        definitions = build_definition_candidates(cells)
        if code:
            return resolve_definition(code, definitions)
        return {"page_index": page_index, "cells": cells, "definitions": definitions}
    finally:
        document.close()


class TakeoffCalculateRequest(BaseModel):
    measurement: TakeoffMeasurement
    calibration: ScaleCalibration | None = None
    page_width_pt: float = Field(gt=0)
    page_height_pt: float = Field(gt=0)


@router.post("/takeoff/calculate")
def takeoff_calculate(request: TakeoffCalculateRequest):
    return calculate_measurement(request.measurement, request.calibration, request.page_width_pt, request.page_height_pt)


class OpenTakeoffDocumentRequest(BaseModel):
    project_id: str
    source_document_hash: str
    source_filename: str
    page_count: int = Field(gt=0)


class SaveMeasurementRequest(BaseModel):
    measurement: TakeoffMeasurement
    actor_id: str
    expected_revision: int


class SaveCalibrationRequest(BaseModel):
    calibration: ScaleCalibration
    actor_id: str
    expected_revision: int


class TakeoffOperationRequest(BaseModel):
    actor_id: str
    expected_revision: int


@router.get("/takeoff/documents")
def list_takeoff_documents(project_id: str | None = None):
    return _takeoff_repository.list_documents(project_id)


@router.post("/takeoff/documents", response_model=TakeoffDocument)
def open_takeoff_document(request: OpenTakeoffDocumentRequest):
    return _takeoff_repository.open_or_create(
        request.project_id, request.source_document_hash, request.source_filename, request.page_count,
    )


@router.get("/takeoff/documents/{takeoff_document_id}", response_model=TakeoffDocument)
def get_takeoff_document(takeoff_document_id: str):
    document = _takeoff_repository.get(takeoff_document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Takeoff document not found")
    return document


def _takeoff_document_or_404(takeoff_document_id: str) -> TakeoffDocument:
    document = _takeoff_repository.get(takeoff_document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Takeoff document not found")
    return document


@router.post("/takeoff/documents/{takeoff_document_id}/measurements", response_model=TakeoffDocument)
def save_takeoff_measurement(takeoff_document_id: str, request: SaveMeasurementRequest):
    document = _takeoff_document_or_404(takeoff_document_id)
    if document.revision != request.expected_revision:
        raise HTTPException(status_code=409, detail=f"stale takeoff document revision: expected {request.expected_revision}, actual {document.revision}")
    try:
        if any(item.measurement_id == request.measurement.measurement_id for item in document.measurements):
            document = _takeoff_repository.update_measurement(document, request.measurement, request.actor_id)
        else:
            document = _takeoff_repository.add_measurement(document, request.measurement, request.actor_id)
        return _takeoff_repository.save(document, expected_revision=request.expected_revision)
    except (ValueError, KeyError, RuntimeError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/takeoff/documents/{takeoff_document_id}/calibrations", response_model=TakeoffDocument)
def save_takeoff_calibration(takeoff_document_id: str, request: SaveCalibrationRequest):
    document = _takeoff_document_or_404(takeoff_document_id)
    if document.revision != request.expected_revision:
        raise HTTPException(status_code=409, detail=f"stale takeoff document revision: expected {request.expected_revision}, actual {document.revision}")
    try:
        document = _takeoff_repository.add_calibration(document, request.calibration, request.actor_id)
        return _takeoff_repository.save(document, expected_revision=request.expected_revision)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/takeoff/documents/{takeoff_document_id}/undo", response_model=TakeoffDocument)
def undo_takeoff_document(takeoff_document_id: str, request: TakeoffOperationRequest):
    document = _takeoff_document_or_404(takeoff_document_id)
    if document.revision != request.expected_revision:
        raise HTTPException(status_code=409, detail=f"stale takeoff document revision: expected {request.expected_revision}, actual {document.revision}")
    document = _takeoff_repository.undo(document, request.actor_id)
    return _takeoff_repository.save(document, expected_revision=request.expected_revision)


@router.post("/entity-links", response_model=EntityLink)
def create_entity_link(link: EntityLink):
    return _entity_link_repository.link(link)


@router.get("/entity-links", response_model=list[EntityLink])
def list_entity_links(project_id: str, source_entity_id: str | None = None):
    return _entity_link_repository.backlinks(project_id, source_entity_id)


class RevisionCompareRequest(BaseModel):
    before: list[RevisionEntity]
    after: list[RevisionEntity]
    descendants: dict[str, list[str]] = Field(default_factory=dict)


@router.post("/revision/compare")
def revision_compare(request: RevisionCompareRequest):
    return compare_revisions(request.before, request.after, request.descendants)


@router.get("/skills")
def engineering_skills():
    return default_skill_packs()


class BenchmarkEvaluationRequest(BaseModel):
    source_hash: str
    predictions: dict[str, object]


@router.post("/benchmark/plhut")
def benchmark_plhut(request: BenchmarkEvaluationRequest):
    pack = create_locked_plhut_pack(request.source_hash)
    return evaluate_facts(pack, request.predictions)
