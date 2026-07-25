from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from .models import DrawingPackageAnalysis


ReviewAction = Literal[
    "accept", "reject", "edit", "reopen", "resolve_conflict", "request_reupload"
]


class ReviewDecisionRequest(BaseModel):
    work_item_id: str
    action: ReviewAction
    expected_version: int = Field(default=0, ge=0)
    reason: str = Field(min_length=3, max_length=1000)
    corrected_category: str | None = None
    corrected_code: str | None = None
    corrected_label: str | None = None
    corrected_level: str | None = None
    verified_physical_count: int | None = Field(default=None, ge=0)
    conflict_id: str | None = None
    selected_source_value_id: str | None = None
    corrected_width: float | None = Field(default=None, gt=0)
    corrected_depth: float | None = Field(default=None, gt=0)
    corrected_dimension_unit: str = "mm"
    corrected_height: float | None = Field(default=None, gt=0)
    corrected_height_unit: str = "mm"
    corrected_elevation: float | None = None
    corrected_elevation_unit: str = "m"
    reupload_page_indices: list[int] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_action_payload(self) -> "ReviewDecisionRequest":
        edit_values = (
            self.corrected_category, self.corrected_code,
            self.corrected_label, self.corrected_level,
        )
        if self.action == "edit" and not any(value is not None for value in edit_values):
            raise ValueError("edit requires at least one corrected field")
        if self.action not in {"accept", "resolve_conflict"} and self.verified_physical_count is not None:
            raise ValueError("verified_physical_count is only allowed with accept or resolve_conflict")
        if self.action == "resolve_conflict":
            if not self.conflict_id:
                raise ValueError("resolve_conflict requires conflict_id")
            has_manual = any(value is not None for value in (
                self.corrected_width, self.corrected_depth,
                self.corrected_height, self.corrected_elevation,
                self.verified_physical_count,
            ))
            if not self.selected_source_value_id and not has_manual:
                raise ValueError("resolve_conflict requires a selected source or corrected value")
            if (self.corrected_width is None) != (self.corrected_depth is None):
                raise ValueError("corrected dimensions require both width and depth")
        if self.action == "request_reupload" and not self.reupload_page_indices:
            raise ValueError("request_reupload requires at least one page index")
        return self


class ReviewEvent(BaseModel):
    event_id: str
    version: int = Field(ge=1)
    work_item_id: str
    action: ReviewAction
    actor_id: str
    created_at: str
    reason: str
    changes: dict[str, Any] = Field(default_factory=dict)
    source_analysis_sha256: str


class ReviewLedger(BaseModel):
    schema_version: str = "paax.drawing-intelligence.review-ledger.v2"
    run_id: str
    package_id: str
    source_analysis_sha256: str
    version: int = Field(default=0, ge=0)
    events: list[ReviewEvent] = Field(default_factory=list)


def empty_ledger(run_id: str, analysis: DrawingPackageAnalysis) -> ReviewLedger:
    return ReviewLedger(
        run_id=run_id,
        package_id=analysis.package_id,
        source_analysis_sha256=analysis.document_sha256,
    )


def append_decision(
    ledger: ReviewLedger,
    request: ReviewDecisionRequest,
    *,
    actor_id: str,
    analysis: DrawingPackageAnalysis,
) -> ReviewLedger:
    if request.expected_version != ledger.version:
        raise ValueError(
            f"stale review ledger: expected version {request.expected_version}, current version {ledger.version}"
        )
    if ledger.package_id != analysis.package_id or ledger.source_analysis_sha256 != analysis.document_sha256:
        raise ValueError("review ledger does not match the current Drawing Intelligence analysis")
    item = next((item for item in analysis.work_items if item.work_item_id == request.work_item_id), None)
    if item is None:
        raise KeyError(f"work item not found: {request.work_item_id}")
    if request.conflict_id and request.conflict_id not in {value.conflict_id for value in analysis.conflicts}:
        raise KeyError(f"conflict not found: {request.conflict_id}")

    changes = {
        key: value for key, value in {
            "category": request.corrected_category,
            "code": request.corrected_code,
            "label": request.corrected_label,
            "level": request.corrected_level,
            "verified_physical_count": request.verified_physical_count,
            "conflict_id": request.conflict_id,
            "selected_source_value_id": request.selected_source_value_id,
            "corrected_width": request.corrected_width,
            "corrected_depth": request.corrected_depth,
            "corrected_dimension_unit": request.corrected_dimension_unit if request.corrected_width is not None else None,
            "corrected_height": request.corrected_height,
            "corrected_height_unit": request.corrected_height_unit if request.corrected_height is not None else None,
            "corrected_elevation": request.corrected_elevation,
            "corrected_elevation_unit": request.corrected_elevation_unit if request.corrected_elevation is not None else None,
            "reupload_page_indices": request.reupload_page_indices or None,
        }.items() if value is not None
    }
    version = ledger.version + 1
    fingerprint = json.dumps(
        {
            "run_id": ledger.run_id,
            "version": version,
            "work_item_id": request.work_item_id,
            "action": request.action,
            "actor_id": actor_id,
            "reason": request.reason,
            "changes": changes,
        },
        sort_keys=True,
        ensure_ascii=False,
    ).encode("utf-8")
    event = ReviewEvent(
        event_id=f"review-{hashlib.sha256(fingerprint).hexdigest()[:16]}",
        version=version,
        work_item_id=request.work_item_id,
        action=request.action,
        actor_id=actor_id,
        created_at=datetime.now(timezone.utc).isoformat(),
        reason=request.reason,
        changes=changes,
        source_analysis_sha256=analysis.document_sha256,
    )
    return ledger.model_copy(update={"version": version, "events": [*ledger.events, event]}, deep=True)


def events_by_item(ledger: ReviewLedger) -> dict[str, list[ReviewEvent]]:
    result: dict[str, list[ReviewEvent]] = {}
    for event in sorted(ledger.events, key=lambda value: value.version):
        result.setdefault(event.work_item_id, []).append(event)
    return result


def latest_decisions(ledger: ReviewLedger) -> dict[str, ReviewEvent]:
    return {key: values[-1] for key, values in events_by_item(ledger).items() if values}


def _source_value(conflict: dict[str, Any], value_id: str | None) -> dict[str, Any] | None:
    if not value_id:
        return None
    return next((value for value in conflict.get("source_values", []) if value.get("value_id") == value_id), None)


def _replace_fact(item: dict[str, Any], field: str, value: float, unit: str, event: ReviewEvent) -> None:
    facts = [fact for fact in item.get("measurement_facts", []) if fact.get("field") != field]
    facts.append({
        "measurement_id": f"mf-{item['work_item_id']}-{field}-review-{event.version}",
        "work_item_id": item["work_item_id"],
        "field": field,
        "value": value,
        "unit": unit,
        "source_method": "human_input",
        "verification_status": "human_verified",
        "evidence_refs": [],
        "source_page_indices": [],
        "formula_input": field,
        "review_event_id": event.event_id,
    })
    item["measurement_facts"] = facts


def _resolve_conflict(item: dict[str, Any], event: ReviewEvent) -> None:
    conflict_id = event.changes.get("conflict_id")
    conflict = next((value for value in item.get("conflicts", []) if value.get("conflict_id") == conflict_id), None)
    if conflict is None:
        return
    selected = _source_value(conflict, event.changes.get("selected_source_value_id"))
    field = conflict.get("field")
    chosen_value = selected.get("value") if selected else None
    chosen_unit = selected.get("unit") if selected else None

    if field == "dimensions":
        width = event.changes.get("corrected_width")
        depth = event.changes.get("corrected_depth")
        unit = event.changes.get("corrected_dimension_unit") or chosen_unit or "mm"
        if width is None and isinstance(chosen_value, dict):
            width = chosen_value.get("width")
            depth = chosen_value.get("depth")
        if width is not None and depth is not None:
            item.setdefault("attributes", {})["dimensions"] = {
                "width": width, "depth": depth, "a": width, "b": depth, "unit": unit,
                "source": "review_resolution",
            }
            item["dimensions_text"] = f"{width:g} × {depth:g} {unit}"
            _replace_fact(item, "width", float(width), unit, event)
            _replace_fact(item, "depth", float(depth), unit, event)
    elif field == "height":
        value = event.changes.get("corrected_height", chosen_value)
        unit = event.changes.get("corrected_height_unit") or chosen_unit or "mm"
        if value is not None:
            _replace_fact(item, "height", float(value), unit, event)
    elif field == "elevation":
        value = event.changes.get("corrected_elevation", chosen_value)
        unit = event.changes.get("corrected_elevation_unit") or chosen_unit or "m"
        if value is not None:
            _replace_fact(item, "elevation", float(value), unit, event)
    elif field == "count":
        value = event.changes.get("verified_physical_count", chosen_value)
        if value is not None:
            item["verified_physical_count"] = int(value)
            item["count_authority"] = "human_confirmed"
            item["count_is_final"] = True
            item["count_label"] = f"{int(value)} unit"
            _replace_fact(item, "count", float(value), "unit", event)

    conflict["status"] = "human_resolved"
    conflict["selected_value_id"] = event.changes.get("selected_source_value_id")
    conflict["resolution_note"] = event.reason
    conflict["review_event_id"] = event.event_id
    item["conflict_status"] = "open" if any(value.get("status") == "open" for value in item.get("conflicts", [])) else "none"
    if item["conflict_status"] == "none":
        item["blockers"] = [value for value in item.get("blockers", []) if "rancu" not in value.lower() and "conflict" not in value.lower()]
        item["status"] = "human_confirmed"
        item["status_label"] = "Konflik diselesaikan reviewer"


def apply_ledger_to_human_delivery(payload: dict[str, Any], ledger: ReviewLedger) -> dict[str, Any]:
    """Replay every immutable review event; no decision silently replaces another."""
    result = json.loads(json.dumps(payload))
    by_item = events_by_item(ledger)
    accepted: list[dict[str, Any]] = []
    all_items = [*result.get("work_items", []), *result.get("needs_clarification", [])]

    for item in all_items:
        item_events = by_item.get(item["work_item_id"], [])
        if not item_events:
            continue
        item.setdefault("review_history", [])
        for event in item_events:
            changes = event.changes
            if changes.get("category") is not None:
                item["category"] = changes["category"]
            if changes.get("code") is not None:
                item["code"] = changes["code"]
            if changes.get("label") is not None:
                item["display_name"] = changes["label"]
            if changes.get("level") is not None:
                item["level"] = changes["level"]
            item["review_history"].append(event.model_dump(mode="json"))

            if event.action == "resolve_conflict":
                _resolve_conflict(item, event)
            elif event.action == "request_reupload":
                item["status"] = "reupload_requested"
                item["status_label"] = "Menunggu unggah ulang lembar"
                item["reupload_page_indices"] = changes.get("reupload_page_indices", [])
            elif event.action == "accept":
                item["user_accepted"] = True
                item["status"] = "accepted"
                item["status_label"] = "Diterima reviewer"
                if "verified_physical_count" in changes:
                    item["verified_physical_count"] = changes["verified_physical_count"]
                    item["count_authority"] = "human_confirmed"
                    item["count_is_final"] = True
                    item["count_label"] = f"{changes['verified_physical_count']} unit"
                    _replace_fact(item, "count", float(changes["verified_physical_count"]), "unit", event)
            elif event.action == "reject":
                item["user_accepted"] = False
                item["status"] = "rejected"
                item["status_label"] = "Ditolak reviewer"
            elif event.action == "reopen":
                item["user_accepted"] = False
                item["status"] = "siap_ditinjau"
                item["status_label"] = "Dibuka kembali untuk ditinjau"
            elif event.action == "edit":
                item["status"] = "terklasifikasi"
                item["status_label"] = "Dikoreksi reviewer"

        latest = item_events[-1]
        item["review"] = latest.model_dump(mode="json")
        if item.get("user_accepted"):
            accepted.append({
                "drawing_object_id": f"accepted-{item['work_item_id']}",
                "source_work_item_id": item["work_item_id"],
                "category": item.get("category"),
                "code": item.get("code"),
                "display_name": item.get("display_name"),
                "level": item.get("level"),
                "verified_physical_count": item.get("verified_physical_count"),
                "count_is_final": item.get("count_is_final", False),
                "source_sheets": item.get("source_sheets", []),
                "evidence_refs": item.get("evidence_refs", []),
                "review_event_id": latest.event_id,
                "reviewer": latest.actor_id,
                "reviewed_at": latest.created_at,
            })

    result["accepted_drawing_objects"] = accepted
    latest = latest_decisions(ledger)
    result["review_ledger"] = {
        "version": ledger.version,
        "event_count": len(ledger.events),
        "latest_events": [event.model_dump(mode="json") for event in latest.values()],
        "all_events": [event.model_dump(mode="json") for event in ledger.events],
    }
    result.setdefault("summary", {})["accepted_drawing_objects"] = len(accepted)
    result.setdefault("summary", {})["open_conflicts"] = sum(
        item.get("conflict_status") == "open" for item in all_items
    )
    return result
