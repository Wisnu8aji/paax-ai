from __future__ import annotations

from typing import Any

from .models import DrawingPackageAnalysis


def build_user_delivery(analysis: DrawingPackageAnalysis) -> dict[str, Any]:
    """Build a compact, truthful payload for the Drawing Intelligence UI."""
    sheets=[]
    for page in analysis.pages:
        semantic=page.semantics
        sheets.append({
            "page_index":page.profile.page_index,
            "page_number":page.profile.page_index+1,
            "sheet_number":semantic.sheet_number if semantic else None,
            "title":semantic.title if semantic else None,
            "discipline":semantic.discipline if semantic else "unknown",
            "drawing_type":semantic.drawing_type if semantic else "unknown",
            "level":semantic.level if semantic else None,
            "scale_candidates":semantic.scale_candidates if semantic else [],
            "modality":page.profile.modality,
            "source_width_pt":page.profile.width_pt,
            "source_height_pt":page.profile.height_pt,
            "quality":page.quality.model_dump(mode="json"),
            "zones":[zone.model_dump(mode="json") for zone in page.zones],
            "detection_count":len(page.detections),
        })
    work_items=[]
    for item in analysis.work_items:
        work_items.append({
            "work_item_id":item.work_item_id,
            "category":item.category,
            "code":item.code,
            "label":item.label,
            "levels":sorted({str(item.attributes.get("level"))}) if item.attributes.get("level") else [],
            "page_indices":item.page_indices,
            "observed_label_count":item.occurrence_count_observed,
            "count_semantics":"drawing_label_observation",
            "maturity":item.maturity,
            "geometry_kind":item.geometry_kind,
            "evidence_refs":item.evidence_refs,
            "attributes":item.attributes,
            "missing_information":item.missing_information,
            "review_task_ids":item.review_task_ids,
            "user_accepted":item.user_accepted,
        })
    return {
        "schema_version":"paax.drawing-intelligence.delivery.v1",
        "package_id":analysis.package_id,
        "document_name":analysis.document_name,
        "document_sha256":analysis.document_sha256,
        "page_count":analysis.page_count,
        "safety":{
            "physical_counts_auto_accepted":False,
            "final_quantities_calculated":False,
            "count_policy":"observed_label_count is not a verified physical count",
        },
        "metrics":analysis.metrics,
        "sheets":sheets,
        "project_vocabulary":[entry.model_dump(mode="json") for entry in analysis.vocabulary],
        "work_item_candidates":work_items,
        "accepted_work_items":[item for item in work_items if item["user_accepted"]],
        "review_queue":[item.model_dump(mode="json") for item in analysis.review_queue],
        "warnings":analysis.warnings,
    }
