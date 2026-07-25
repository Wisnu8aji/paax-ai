from __future__ import annotations

import hashlib
import json
import math
import threading
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, model_validator

MeasurementKind = Literal["distance", "polyline", "perimeter", "area", "count", "volume"]
MeasurementStatus = Literal["draft", "candidate", "review_required", "human_verified", "engine_verified", "rejected", "stale"]


class ScaleCalibration(BaseModel):
    calibration_id: str
    page_index: int
    view_zone_id: str
    ratio_denominator: Decimal = Field(gt=0)
    drawing_unit: str = "mm"
    source: Literal["detected", "known_distance", "manual"]
    verified_by: str | None = None
    status: Literal["candidate", "verified"] = "candidate"


class TakeoffMeasurement(BaseModel):
    measurement_id: str
    project_id: str
    source_document_hash: str
    page_index: int
    view_zone_id: str
    kind: MeasurementKind
    points: list[tuple[float, float]]
    count: int = Field(default=1, ge=0)
    depth_m: Decimal | None = None
    scale_calibration_id: str | None = None
    value: Decimal | None = None
    unit: str | None = None
    group_id: str = "default"
    color: str | None = None
    visible: bool = True
    z_order: int = 0
    status: MeasurementStatus = "draft"
    evidence_refs: list[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @model_validator(mode="after")
    def validate_geometry(self) -> "TakeoffMeasurement":
        min_points = 0 if self.kind == "count" else 2
        if self.kind in {"area", "perimeter", "volume"}:
            min_points = 3
        if len(self.points) < min_points:
            raise ValueError(f"{self.kind} requires at least {min_points} points")
        return self


class TakeoffOperation(BaseModel):
    operation_id: str
    action: Literal["create", "update", "delete", "undo", "redo", "calibrate", "link"]
    actor_id: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    before: dict | None = None
    after: dict | None = None


class TakeoffDocument(BaseModel):
    takeoff_document_id: str
    project_id: str
    source_document_hash: str
    source_filename: str
    page_count: int
    measurements: list[TakeoffMeasurement] = Field(default_factory=list)
    calibrations: list[ScaleCalibration] = Field(default_factory=list)
    operations: list[TakeoffOperation] = Field(default_factory=list)
    redo_stack: list[TakeoffOperation] = Field(default_factory=list)
    revision: int = 0


class TakeoffWorkspaceRepository:
    """Small deterministic portable repository.

    It enforces one takeoff document per (project, source hash), writes atomically,
    and keeps an operation ledger. Production deployments can map the same contract
    to PostgreSQL without changing domain behavior.
    """

    _lock = threading.RLock()

    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def open_or_create(self, project_id: str, source_hash: str, filename: str, page_count: int) -> TakeoffDocument:
        key = self._key(project_id, source_hash)
        with self._lock:
            data = self._load()
            if key not in data:
                data[key] = TakeoffDocument(
                    takeoff_document_id=f"takeoff-{hashlib.sha1(key.encode()).hexdigest()[:16]}",
                    project_id=project_id, source_document_hash=source_hash,
                    source_filename=filename, page_count=page_count,
                ).model_dump(mode="json")
                self._save(data)
            return TakeoffDocument.model_validate(data[key])

    def list_documents(self, project_id: str | None = None) -> list[TakeoffDocument]:
        with self._lock:
            documents = [TakeoffDocument.model_validate(value) for value in self._load().values()]
        if project_id is not None:
            documents = [document for document in documents if document.project_id == project_id]
        return sorted(documents, key=lambda document: document.takeoff_document_id)

    def get(self, takeoff_document_id: str) -> TakeoffDocument | None:
        with self._lock:
            for value in self._load().values():
                document = TakeoffDocument.model_validate(value)
                if document.takeoff_document_id == takeoff_document_id:
                    return document
        return None

    def save(self, document: TakeoffDocument, expected_revision: int | None = None) -> TakeoffDocument:
        key = self._key(document.project_id, document.source_document_hash)
        with self._lock:
            data = self._load()
            current = TakeoffDocument.model_validate(data[key]) if key in data else None
            if expected_revision is not None and current and current.revision != expected_revision:
                raise RuntimeError(f"stale takeoff document revision: expected {expected_revision}, actual {current.revision}")
            document.revision = (current.revision if current else -1) + 1
            data[key] = document.model_dump(mode="json")
            self._save(data)
            return document

    def add_measurement(self, document: TakeoffDocument, measurement: TakeoffMeasurement, actor_id: str) -> TakeoffDocument:
        if measurement.project_id != document.project_id or measurement.source_document_hash != document.source_document_hash:
            raise ValueError("measurement scope does not match takeoff document")
        before = document.model_dump(mode="json")
        measurement.z_order = max([m.z_order for m in document.measurements], default=-1) + 1
        document.measurements.append(measurement)
        document.operations.append(TakeoffOperation(
            operation_id=f"op-{hashlib.sha1((measurement.measurement_id + str(len(document.operations))).encode()).hexdigest()[:14]}",
            action="create", actor_id=actor_id, before=before, after=document.model_dump(mode="json"),
        ))
        document.redo_stack.clear()
        return document

    def add_calibration(self, document: TakeoffDocument, calibration: ScaleCalibration, actor_id: str) -> TakeoffDocument:
        if calibration.page_index >= document.page_count:
            raise ValueError("calibration page is outside takeoff document")
        before = document.model_dump(mode="json")
        document.calibrations = [item for item in document.calibrations if item.calibration_id != calibration.calibration_id]
        document.calibrations.append(calibration)
        document.operations.append(TakeoffOperation(
            operation_id=f"op-cal-{hashlib.sha1((calibration.calibration_id + str(len(document.operations))).encode()).hexdigest()[:14]}",
            action="calibrate", actor_id=actor_id, before=before, after=document.model_dump(mode="json"),
        ))
        document.redo_stack.clear()
        return document

    def update_measurement(self, document: TakeoffDocument, measurement: TakeoffMeasurement, actor_id: str) -> TakeoffDocument:
        before = document.model_dump(mode="json")
        for index, current in enumerate(document.measurements):
            if current.measurement_id == measurement.measurement_id:
                if measurement.project_id != document.project_id or measurement.source_document_hash != document.source_document_hash:
                    raise ValueError("measurement scope does not match takeoff document")
                measurement.z_order = current.z_order
                document.measurements[index] = measurement
                break
        else:
            raise KeyError(f"measurement not found: {measurement.measurement_id}")
        document.operations.append(TakeoffOperation(
            operation_id=f"op-upd-{hashlib.sha1((measurement.measurement_id + str(len(document.operations))).encode()).hexdigest()[:14]}",
            action="update", actor_id=actor_id, before=before, after=document.model_dump(mode="json"),
        ))
        document.redo_stack.clear()
        return document

    def delete_measurement(self, document: TakeoffDocument, measurement_id: str, actor_id: str) -> TakeoffDocument:
        before = document.model_dump(mode="json")
        remaining = [measurement for measurement in document.measurements if measurement.measurement_id != measurement_id]
        if len(remaining) == len(document.measurements):
            raise KeyError(f"measurement not found: {measurement_id}")
        document.measurements = remaining
        document.operations.append(TakeoffOperation(
            operation_id=f"op-del-{hashlib.sha1((measurement_id + str(len(document.operations))).encode()).hexdigest()[:14]}",
            action="delete", actor_id=actor_id, before=before, after=document.model_dump(mode="json"),
        ))
        document.redo_stack.clear()
        return document

    def undo(self, document: TakeoffDocument, actor_id: str) -> TakeoffDocument:
        action = next((op for op in reversed(document.operations) if op.action in {"create", "update", "delete", "calibrate"}), None)
        if not action or not action.before:
            return document
        restored = TakeoffDocument.model_validate(action.before)
        restored.redo_stack = document.redo_stack + [action]
        restored.operations = document.operations + [TakeoffOperation(
            operation_id=f"op-undo-{len(document.operations)}", action="undo", actor_id=actor_id,
            before=document.model_dump(mode="json"), after=restored.model_dump(mode="json"),
        )]
        return restored

    def _load(self) -> dict:
        if not self.path.exists():
            return {}
        return json.loads(self.path.read_text(encoding="utf-8"))

    def _save(self, data: dict) -> None:
        temp = self.path.with_suffix(self.path.suffix + ".tmp")
        temp.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
        temp.replace(self.path)

    @staticmethod
    def _key(project_id: str, source_hash: str) -> str:
        return f"{project_id}:{source_hash}"


def calculate_measurement(measurement: TakeoffMeasurement, calibration: ScaleCalibration | None,
                          page_width_pt: float, page_height_pt: float) -> TakeoffMeasurement:
    if measurement.kind == "count":
        measurement.value = Decimal(measurement.count)
        measurement.unit = "unit"
        return measurement
    if not calibration or calibration.status != "verified":
        measurement.status = "review_required"
        return measurement
    # PDF points are 1/72 inch. Drawing scale 1:n gives real metres.
    n = calibration.ratio_denominator
    def real_distance(a: tuple[float, float], b: tuple[float, float]) -> Decimal:
        dx_pt = Decimal(str((b[0] - a[0]) * page_width_pt))
        dy_pt = Decimal(str((b[1] - a[1]) * page_height_pt))
        length_pt = Decimal(str(math.sqrt(float(dx_pt * dx_pt + dy_pt * dy_pt))))
        metres = length_pt / Decimal(72) * Decimal("0.0254") * n
        return metres

    if measurement.kind in {"distance", "polyline"}:
        value = sum((real_distance(a, b) for a, b in zip(measurement.points, measurement.points[1:])), Decimal(0))
        measurement.value = value.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
        measurement.unit = "m"
    else:
        # Shoelace in normalized coordinates, convert each axis using page dimensions and scale.
        pts = measurement.points
        area_norm = abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1]
                            for i in range(len(pts)))) / 2
        width_m = Decimal(str(page_width_pt)) / Decimal(72) * Decimal("0.0254") * n
        height_m = Decimal(str(page_height_pt)) / Decimal(72) * Decimal("0.0254") * n
        area = Decimal(str(area_norm)) * width_m * height_m
        if measurement.kind == "perimeter":
            perimeter = sum((real_distance(a, b) for a, b in zip(pts, pts[1:] + pts[:1])), Decimal(0))
            measurement.value = perimeter.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
            measurement.unit = "m"
        elif measurement.kind == "area":
            measurement.value = area.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
            measurement.unit = "m2"
        elif measurement.kind == "volume":
            if measurement.depth_m is None:
                measurement.status = "review_required"
                return measurement
            measurement.value = (area * measurement.depth_m).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
            measurement.unit = "m3"
    return measurement
