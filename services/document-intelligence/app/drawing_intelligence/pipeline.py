from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

import fitz

from .cross_reference import link_cross_references
from .definition_resolution import resolve_definition_conflicts
from .physical_instances import reconstruct_physical_instances
from .measurement_resolution import compile_definition_measurements
from .spatial_resolution import resolve_element_heights
from .spatial_joiner import join_written_dimensions
from .dedup_count import deduplicate_and_count
from .construction_graph_v3 import build_construction_graph
from .evidence_repair import bridge_dem_refs_to_native_tokens, repair_dem_evidence_refs
from .dem_adapter import (
    assess_dem_quality,
    extract_dem_tables,
    extract_dem_tokens,
    iter_observations,
    load_dem_pages,
)
from .models import DrawingPackageAnalysis, PageIntelligence, ReviewTask
from .ingestion import build_source_manifest, prepare_pdf_bytes
from .raster_fallback import extract_raster_tokens
from .page_profiler import profile_page
from .plan_zones import detect_plan_zones
from .sheet_identity import build_sheet_semantics
from .sheet_views import build_sheet_views
from .text_index import extract_native_tokens
from .vocabulary import build_native_vocabulary, build_project_vocabulary
from .work_items import build_work_items

_PHASES = {
    "01_ingestion": "implemented_with_source_manifest",
    "02_modality_routing": "implemented_with_explainable_quality_profile",
    "03_coordinate_unification": "implemented",
    "04_native_vector_extraction": "implemented",
    "05_page_semantics": "implemented_with_bounded_human_level_scopes",
    "06_plan_zones": "implemented_deterministic_baseline",
    "07_native_text_index": "implemented",
    "08_dem_fusion": "implemented",
    "09_legend_schedule_vocabulary": "implemented_context_ranked_vocabulary_baseline",
    "10_cross_sheet_reference": "implemented_discipline_scoped_cross_sheet_resolution",
    "11_vector_symbol_descriptor": "implemented_with_stroke_topology_baseline",
    "12_project_specific_similarity": "implemented_with_versioned_project_prototypes",
    "13_area_segmentation": "implemented_vector_assisted_baseline",
    "14_line_topology": "implemented_vector_assisted_baseline",
    "15_geometry_reconstruction": "implemented_topology_and_connected_path_baseline",
    "16_work_item_maturation": "implemented_conflict_aware_physical_instance_reconstruction",
    "17_human_review_queue": "implemented_versioned_review_ledger_with_canonical_persistence",
    "18_active_learning": "implemented_offline_versioned_project_memory_with_canonical_persistence",
    "19_frontend_delivery": "implemented_human_frontend_contract_and_review_actions",
    "20_benchmark_observability": "implemented_package_human_conflict_and_physical_count_gates",
}



def analyze_drawing_package(
    pdf_source: str | Path | bytes | bytearray,
    *,
    document_name: str | None = None,
    dem_directory: str | Path | None = None,
    dem_folder: str | Path | None = None,
    dem_pages_data: dict[int, dict[str, Any]] | None = None,
    package_id: str | None = None,
    mode: str = "balanced",
    max_pages: int | None = None,
) -> DrawingPackageAnalysis:
    """Analyze a PDF package without any live AI provider.

    Native PDF geometry/text is the deterministic spine. Existing DEM pages are
    fused as semantic evidence. The function never calculates final quantities
    and never promotes drawing-label observations to physical counts.
    """
    if mode not in {"fast", "balanced", "deep"}:
        raise ValueError("mode must be fast, balanced, or deep")
    if isinstance(pdf_source, (bytes, bytearray)):
        source_bytes = bytes(pdf_source)
        resolved_name = document_name or "uploaded.pdf"
    else:
        pdf_path = Path(pdf_source)
        source_bytes = pdf_path.read_bytes()
        resolved_name = document_name or pdf_path.name
    pdf_bytes, input_kind, ingestion_warnings = prepare_pdf_bytes(source_bytes, resolved_name)
    source_manifest = build_source_manifest(
        source_bytes=source_bytes, processed_pdf_bytes=pdf_bytes,
        filename=resolved_name, input_kind=input_kind,
        lineage_notes=ingestion_warnings,
    )
    document_hash = hashlib.sha256(source_bytes).hexdigest()
    resolved_dem = dem_directory if dem_directory is not None else dem_folder
    raw_dem_pages = (
        {int(index): value for index, value in dem_pages_data.items()}
        if dem_pages_data is not None
        else load_dem_pages(Path(resolved_dem) if resolved_dem else None)
    )
    dem_pages = {}
    evidence_repairs = 0
    native_evidence_repairs = 0
    for index, page_data in raw_dem_pages.items():
        repaired_page, repair_stats = repair_dem_evidence_refs(page_data)
        dem_pages[index] = repaired_page
        evidence_repairs += repair_stats.repaired
    with fitz.open(stream=pdf_bytes, filetype="pdf") as package_document:
        full_page_count = package_document.page_count
    total_pages = full_page_count if max_pages is None else min(full_page_count, max_pages)

    pages: list[PageIntelligence] = []
    semantics_by_page = {}
    zones_by_page = {}
    warnings: list[str] = list(ingestion_warnings)

    for page_index in range(total_pages):
        # Isolate each sheet in its own PyMuPDF document handle. Dense CAD PDF
        # display lists otherwise accumulate across a large drawing set.
        with fitz.open(stream=pdf_bytes, filetype="pdf") as page_document:
            page = page_document[page_index]
            try:
                getter = getattr(page, "get_cdrawings", None)
                drawings = list(getter() if getter is not None else page.get_drawings())
            except Exception:
                drawings = []
            profile = profile_page(page, page_index, vector_path_count=len(drawings))
            native_text = page.get_text("text", sort=True)
            dem_page = dem_pages.get(page_index)
            semantics = build_sheet_semantics(page_index, native_text=native_text, dem_page=dem_page)
            detect_tables = mode == "deep" and (semantics.drawing_type in {"schedule", "legend"} or "TABEL" in (semantics.title or "").upper())
            zones = detect_plan_zones(page, page_index, detect_tables=detect_tables, drawings=drawings)
            native_tokens = extract_native_tokens(page, page_index, zones)
            if dem_page:
                dem_page, native_stats = bridge_dem_refs_to_native_tokens(dem_page, native_tokens)
                dem_pages[page_index] = dem_page
                native_evidence_repairs += native_stats.repaired
            ocr_tokens = []
            if not dem_page and profile.modality == "raster" and len(native_tokens) < 3:
                ocr_tokens, ocr_warnings = extract_raster_tokens(page, page_index, zones)
                warnings.extend(f"page {page_index + 1}: {warning}" for warning in ocr_warnings)
            dem_tokens = extract_dem_tokens(dem_page, zones) if dem_page else []
            tokens = [*native_tokens, *ocr_tokens, *dem_tokens]
            tables = extract_dem_tables(dem_page, zones) if dem_page else []
            quality = assess_dem_quality(dem_page, native_token_count=len(native_tokens), zones=zones)
            pages.append(
                PageIntelligence(
                    profile=profile, semantics=semantics, quality=quality,
                    zones=zones, tokens=tokens, tables=tables,
                )
            )
        semantics_by_page[page_index] = semantics
        zones_by_page[page_index] = zones
        warnings.extend(f"page {page_index + 1}: {warning}" for warning in profile.warnings)
        warnings.extend(f"page {page_index + 1}: {warning}" for warning in semantics.warnings)

    relevant_dem_pages = {index: page for index, page in dem_pages.items() if index < total_pages}
    dem_vocabulary = build_project_vocabulary(relevant_dem_pages, semantics_by_page)
    native_vocabulary = build_native_vocabulary(pages)
    vocab_map = {(entry.canonical_key, entry.category): entry for entry in native_vocabulary}
    for entry in dem_vocabulary:
        key = (entry.canonical_key, entry.category)
        current = vocab_map.get(key)
        if current is None or ("dimensions" in entry.attributes, entry.confidence) >= ("dimensions" in current.attributes, current.confidence):
            vocab_map[key] = entry
    vocabulary = sorted(vocab_map.values(), key=lambda item: (item.canonical_key, item.category, item.page_index))
    with fitz.open(stream=pdf_bytes, filetype="pdf") as reference_document:
        cross_references, detections = link_cross_references(
            document=reference_document,
            dem_pages=relevant_dem_pages,
            semantics=semantics_by_page,
            zones_by_page=zones_by_page,
            vocabulary=vocabulary,
            pages_by_index={page.profile.page_index: page for page in pages},
            include_vector_descriptors=mode != "fast",
        )
    work_items, review_queue = build_work_items(
        matches=cross_references,
        detections=detections,
        vocabulary=vocabulary,
        semantics=semantics_by_page,
    )
    all_vocabulary_candidates = [*native_vocabulary, *dem_vocabulary]
    conflicts, definition_pages = resolve_definition_conflicts(
        work_items=work_items, vocabulary_candidates=all_vocabulary_candidates, pages=pages,
    )
    work_items = [
        item.model_copy(update={
            "definition_source_page_indices": definition_pages.get(item.work_item_id, []),
            "conflict_ids": [
                conflict.conflict_id for conflict in conflicts if conflict.work_item_id == item.work_item_id
            ],
        }, deep=True)
        for item in work_items
    ]
    reconstruction = reconstruct_physical_instances(
        work_items=work_items, matches=cross_references, pages=pages, conflicts=conflicts,
    )
    work_items = compile_definition_measurements(
        work_items=reconstruction.work_items, vocabulary=all_vocabulary_candidates, conflicts=conflicts,
    )
    spatial = resolve_element_heights(
        work_items=work_items, pages=pages, dem_pages=relevant_dem_pages, existing_conflicts=conflicts,
    )
    work_items = spatial.work_items
    conflicts = spatial.conflicts
    # K3 — spatial joiner + inline table parser (written_dimension facts).
    spatial_join = join_written_dimensions(
        work_items=work_items, dem_pages=relevant_dem_pages,
    )
    work_items = spatial_join.work_items
    # K4 — dedup (category, canonical_key, level) + occurrence/verified count.
    dedup_count = deduplicate_and_count(work_items=work_items, dem_pages=relevant_dem_pages)
    work_items = dedup_count.work_items
    active_work_review_ids = {task_id for item in work_items for task_id in item.review_task_ids}
    review_queue = [
        task for task in review_queue
        if task.task_type != "work_item" or task.task_id in active_work_review_ids
    ]
    review_queue.extend(reconstruction.review_tasks)

    detections_by_page: dict[int, list[Any]] = {}
    for detection in detections:
        detections_by_page.setdefault(detection.page_index, []).append(detection)
    for page_intelligence in pages:
        page_intelligence.detections = detections_by_page.get(page_intelligence.profile.page_index, [])
        for zone in page_intelligence.zones:
            if zone.needs_review:
                review_queue.append(
                    ReviewTask(
                        task_id=f"review-zone-{zone.zone_id}",
                        page_index=zone.page_index,
                        task_type="zone",
                        title=f"Review {zone.type} zone on page {zone.page_index + 1}",
                        reason="deterministic zone boundary has low confidence or is unusually broad",
                        evidence_refs=[],
                        severity="review",
                    )
                )
        if page_intelligence.quality.readiness != "ready":
            review_queue.append(
                ReviewTask(
                    task_id=f"review-page-quality-{page_intelligence.profile.page_index}",
                    page_index=page_intelligence.profile.page_index,
                    task_type="classification",
                    title=f"Review page {page_intelligence.profile.page_index + 1} data quality",
                    reason="; ".join(page_intelligence.quality.reasons) or "page quality requires review",
                    severity="blocking" if page_intelligence.quality.readiness == "blocked" else "review",
                )
            )

    modality_counts = Counter(page.profile.modality for page in pages)
    drawing_type_counts = Counter(page.semantics.drawing_type for page in pages if page.semantics)
    discipline_counts = Counter(page.semantics.discipline for page in pages if page.semantics)
    ready_pages = sum(page.quality.readiness == "ready" for page in pages)
    unresolved_evidence_links = sum(
        1
        for page_data in relevant_dem_pages.values()
        for _, _, row in iter_observations(page_data)
        if not row.get("evidence_refs")
    )
    metrics: dict[str, Any] = {
        "page_count_analyzed": total_pages,
        "analyzed_pages": total_pages,
        "analysis_mode": mode,
        "input_kind": input_kind,
        "ai_provider_calls": 0,
        "vector_descriptor_policy": "deferred" if mode == "fast" else "eager",
        "dem_page_count": len(relevant_dem_pages),
        "dem_coverage": len(relevant_dem_pages) / max(total_pages, 1),
        "evidence_refs_repaired": evidence_repairs + native_evidence_repairs,
        "existing_dem_evidence_refs_repaired": evidence_repairs,
        "native_pdf_evidence_refs_bridged": native_evidence_repairs,
        "unresolved_evidence_links": unresolved_evidence_links,
        "modality_counts": dict(modality_counts),
        "drawing_type_counts": dict(drawing_type_counts),
        "discipline_counts": dict(discipline_counts),
        "page_ready_ratio": ready_pages / max(total_pages, 1),
        "vocabulary_entries": len(vocabulary),
        "cross_references": len(cross_references),
        "detection_candidates": len(detections),
        "work_item_candidates": len(work_items),
        "review_tasks": len(review_queue),
        "drawing_conflicts": len(conflicts),
        **reconstruction.metrics,
        **spatial.metrics,
        **spatial_join.metrics,
        **dedup_count.metrics,
        "work_items_ready_for_calculation": sum(item.calculation_readiness == "ready" for item in work_items),
        "physical_counts_auto_accepted": reconstruction.metrics.get("work_items_count_engine_confirmed", 0),
        "final_quantities_calculated": 0,
    }
    if len(relevant_dem_pages) != total_pages:
        warnings.append(f"DEM coverage is {len(relevant_dem_pages)}/{total_pages}; missing pages use native PDF only")

    analysis = DrawingPackageAnalysis(
        package_id=package_id or f"pkg-{document_hash[:12]}",
        document_name=resolved_name,
        document_sha256=document_hash,
        page_count=total_pages,
        source_manifest=source_manifest,
        pages=pages,
        sheet_views=build_sheet_views(pages),
        vocabulary=vocabulary,
        cross_references=cross_references,
        work_items=work_items,
        review_queue=review_queue,
        physical_instances=reconstruction.instances,
        conflicts=conflicts,
        metrics=metrics,
        phase_status=dict(_PHASES),
        warnings=sorted(dict.fromkeys(warnings)),
    )
    graph = build_construction_graph(analysis)
    return analysis.model_copy(update={"construction_graph": graph}, deep=True)


def write_analysis(analysis: DrawingPackageAnalysis, path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(analysis.model_dump_json(indent=2), encoding="utf-8")
    return path
