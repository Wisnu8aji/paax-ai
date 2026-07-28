from __future__ import annotations

from collections import Counter, defaultdict
from statistics import mean
from typing import Any

from .candidate_inventory import build_candidate_inventory
from .models import DrawingPackageAnalysis, WorkItemCandidate
from .taxonomy import (
    dimensions_text,
    humanize_missing_information,
    is_user_presentable,
    level_display_name,
    presentability_reasons,
    resolve_user_category,
    suppression_reasons,
    taxonomy_for,
)


def _page_lookup(analysis: DrawingPackageAnalysis) -> dict[int, dict[str, Any]]:
    result: dict[int, dict[str, Any]] = {}
    for page in analysis.pages:
        semantic = page.semantics
        result[page.profile.page_index] = {
            "page_index": page.profile.page_index,
            "page_number": page.profile.page_index + 1,
            "sheet_number": semantic.sheet_number if semantic else None,
            "title": semantic.title if semantic else None,
            "discipline": semantic.discipline if semantic else "unknown",
            "drawing_type": semantic.drawing_type if semantic else "unknown",
            "level": semantic.level if semantic else None,
            "readiness": page.quality.readiness,
        }
    return result


def _candidate_confidences(analysis: DrawingPackageAnalysis) -> dict[str, float]:
    return {
        candidate.candidate_id: candidate.confidence
        for page in analysis.pages
        for candidate in page.detections
    }


def _occurrence_map(analysis: DrawingPackageAnalysis) -> dict[tuple[str, str, str], list[dict[str, Any]]]:
    page_lookup = _page_lookup(analysis)
    result: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    detection_by_match = {
        candidate.candidate_id.removeprefix("candidate-"): candidate
        for page in analysis.pages for candidate in page.detections
    }
    for match in analysis.cross_references:
        candidate = detection_by_match.get(match.match_id)
        category = candidate.category if candidate else "unknown"
        sheet = page_lookup.get(match.occurrence_page_index, {})
        level = str(sheet.get("level") or "unknown")
        result[(category, match.canonical_key, level)].append({
            "page_index": match.occurrence_page_index,
            "page_number": match.occurrence_page_index + 1,
            "sheet_number": sheet.get("sheet_number"),
            "sheet_title": sheet.get("title"),
            "bbox": match.occurrence_bbox.model_dump(mode="json"),
            "confidence": round(match.confidence, 4),
            "evidence_refs": match.evidence_refs,
            "definition_page_index": match.definition_page_index,
        })
    return result


def _readiness_score(item: WorkItemCandidate, *, confidence: float, presentable: bool) -> int:
    score = 0
    if item.category != "unknown":
        score += 20
    if item.code:
        score += 10
    if item.attributes.get("definition_entry_id"):
        score += 20
    if item.evidence_refs:
        score += 15
    if item.attributes.get("level") not in {None, "unknown"}:
        score += 10
    if dimensions_text(item.attributes):
        score += 15
    if item.source_candidate_ids:
        score += 10
    score = round(score * max(0.45, min(1.0, confidence)))
    if not presentable:
        score = min(score, 34)
    return max(0, min(100, score))


def _status(score: int, blockers: list[str]) -> tuple[str, str]:
    severe = any(
        text in blockers for text in (
            "Definisi tipe belum ditemukan pada legenda atau tabel.",
            "Ukuran elemen belum ditemukan atau belum dapat dipastikan.",
        )
    )
    if score >= 80 and not severe:
        return "siap_ditinjau", "Siap ditinjau"
    if score >= 60:
        return "terklasifikasi", "Sudah terklasifikasi"
    if score >= 35:
        return "terdeteksi", "Terdeteksi, data belum lengkap"
    return "perlu_klarifikasi", "Perlu klarifikasi"


def _known_facts(item: WorkItemCandidate, source_sheets: list[dict[str, Any]]) -> list[str]:
    taxonomy = taxonomy_for(item.category)
    level = item.attributes.get("level")
    values = [f"Jenis elemen: {taxonomy.technical_name}."]
    if item.code:
        values.append(f"Kode pada gambar: {item.code}.")
    if level and level != "unknown":
        values.append(f"Lokasi level: {level}.")
    dimension = dimensions_text(item.attributes)
    if dimension:
        values.append(f"Ukuran tertulis: {dimension}.")
    if item.verified_physical_count is not None and item.count_authority in {"engine_confirmed", "human_confirmed"}:
        authority = "terkonfirmasi sistem" if item.count_authority == "engine_confirmed" else "dikonfirmasi reviewer"
        values.append(f"Jumlah elemen fisik: {item.verified_physical_count} unit ({authority}).")
    else:
        values.append(
            f"Sistem menemukan {item.occurrence_count_observed} kandidat pada gambar; jumlah fisik masih menunggu penyelesaian constraint."
        )
    titles = [sheet.get("sheet_title") or sheet.get("sheet_number") for sheet in source_sheets]
    titles = [str(value) for value in titles if value]
    if titles:
        values.append(f"Sumber utama: {', '.join(dict.fromkeys(titles))}.")
    return values


def _recommended_actions(blockers: list[str], presentable_reasons: list[str]) -> list[str]:
    actions: list[str] = []
    combined = " ".join([*blockers, *presentable_reasons]).lower()
    if "definisi" in combined or "category_unknown" in combined:
        actions.append("Pilih definisi yang benar dari legenda, tabel, atau detail terkait.")
    if "ukuran" in combined:
        actions.append("Konfirmasi ukuran dari tabel/detail sebelum menerima item.")
    if "level" in combined:
        actions.append("Pilih lantai atau level yang benar.")
    if "jumlah" in combined or "physical" in combined:
        actions.append("Periksa overlay pada lembar sumber lalu verifikasi jumlah objek fisik.")
    if "evidence_missing" in combined:
        actions.append("Tautkan item ke bukti pada gambar atau kirim halaman untuk diproses ulang.")
    if "label_looks_like_note_or_title_block" in combined or "code_not_valid" in combined:
        actions.append("Tandai sebagai bukan item pekerjaan bila teks berasal dari catatan atau title block.")
    if not actions:
        actions.append("Buka lembar sumber dan tinjau kandidat sebelum menerima hasil.")
    return list(dict.fromkeys(actions))


def _review_batch_key(task: dict[str, Any]) -> tuple[str, str, str]:
    reason = str(task.get("reason") or "").lower()
    if "legend" in reason or "schedule" in reason or "definition" in reason:
        issue = "definition_missing"
    elif "dimension" in reason or "ukuran" in reason:
        issue = "dimension_missing"
    elif "physical" in reason or "jumlah" in reason or "instance count" in reason:
        issue = "physical_count_verification"
    elif task.get("task_type") == "classification":
        issue = "page_quality"
    elif task.get("task_type") == "zone":
        issue = "zone_boundary"
    else:
        issue = str(task.get("task_type") or "other")
    return str(task.get("severity") or "review"), issue, str(task.get("task_type") or "other")


def _build_review_batches(review_tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    labels = {
        "definition_missing": ("Lengkapi definisi tipe", "Pilih definisi dari legenda, tabel, atau detail terkait."),
        "dimension_missing": ("Konfirmasi ukuran elemen", "Buka tabel/detail dan pastikan ukuran tertulis yang benar."),
        "physical_count_verification": ("Verifikasi jumlah objek fisik", "Periksa overlay dan tandai kandidat yang benar-benar merupakan objek fisik."),
        "page_quality": ("Tinjau kualitas pembacaan lembar", "Periksa identitas lembar, evidence, dan bagian yang belum terbaca."),
        "zone_boundary": ("Tinjau batas zona gambar", "Pastikan legenda, tabel, catatan, dan area gambar dipisahkan dengan benar."),
        "work_item": ("Tinjau item pekerjaan", "Periksa klasifikasi dan bukti sumber item."),
        "other": ("Tinjau hasil Drawing Intelligence", "Periksa bukti sumber dan selesaikan masalah yang ditandai."),
    }
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for task in review_tasks:
        grouped[_review_batch_key(task)].append(task)
    result = []
    severity_rank = {"blocking": 0, "review": 1, "info": 2}
    for (severity, issue, task_type), tasks in grouped.items():
        title, action = labels.get(issue, labels.get(task_type, labels["other"]))
        pages = sorted({int(task["page_index"]) for task in tasks})
        result.append({
            "batch_id": f"batch-{severity}-{issue}",
            "severity": severity,
            "issue": issue,
            "title": title,
            "task_count": len(tasks),
            "page_indices": pages,
            "page_numbers": [index + 1 for index in pages],
            "recommended_action": action,
            "task_ids": [str(task["task_id"]) for task in tasks],
            "sample_titles": [str(task["title"]) for task in tasks[:5]],
        })
    result.sort(key=lambda row: (severity_rank.get(row["severity"], 9), -row["task_count"], row["title"]))
    return result


def build_human_delivery(analysis: DrawingPackageAnalysis) -> dict[str, Any]:
    """Produce a UI-oriented view while preserving the full analysis separately.

    The payload intentionally hides noisy audit candidates from the main work
    list, but keeps them under ``needs_clarification`` so no source observation
    is destroyed or silently discarded.
    """
    pages = _page_lookup(analysis)
    occurrences = _occurrence_map(analysis)
    conflicts_by_item: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for conflict in analysis.conflicts:
        rendered_conflict = conflict.model_dump(mode="json")
        rendered_conflict["affected_pages"] = [
            pages[index] for index in conflict.affected_page_indices if index in pages
        ]
        conflicts_by_item[conflict.work_item_id].append(rendered_conflict)
    confidences = _candidate_confidences(analysis)
    user_items: list[dict[str, Any]] = []
    clarification: list[dict[str, Any]] = []
    suppressed: list[dict[str, Any]] = []

    for item in analysis.work_items:
        resolved_category = resolve_user_category(item.category, item.code, item.label, item.attributes)
        taxonomy = taxonomy_for(resolved_category)
        level = str(item.attributes.get("level") or "unknown")
        key = (item.category, item.code or "", level)
        item_occurrences = occurrences.get(key, [])
        source_pages = sorted({
            *item.page_indices, *item.count_source_page_indices, *item.definition_source_page_indices,
            *(row["page_index"] for row in item_occurrences),
        })
        source_sheets = [pages[index] for index in source_pages if index in pages]
        candidate_values = [
            confidences[candidate_id]
            for candidate_id in item.source_candidate_ids
            if candidate_id in confidences
        ]
        confidence = mean(candidate_values) if candidate_values else 0.0
        reasons = presentability_reasons(
            category=resolved_category,
            code=item.code,
            label=item.label,
            evidence_refs=item.evidence_refs,
            attributes=item.attributes,
        )
        presentable = is_user_presentable(
            category=resolved_category,
            code=item.code,
            label=item.label,
            evidence_refs=item.evidence_refs,
            attributes=item.attributes,
        )
        blockers = humanize_missing_information(item.missing_information)
        score = _readiness_score(item, confidence=confidence, presentable=presentable)
        status, status_label = _status(score, blockers)
        if item.conflict_ids:
            status, status_label = "data_rancu", "Data rancu—perlu keputusan"
        elif item.calculation is not None and item.calculation.status == "complete":
            status, status_label = "calculated", "Volume terhitung Core Engine"
        elif item.calculation_readiness == "ready":
            status, status_label = "ready_for_calculation", "Siap dihitung Core Engine"
        elif item.count_authority == "engine_confirmed":
            status, status_label = "system_confirmed", "Terkonfirmasi sistem"
        elif item.count_authority == "human_confirmed":
            status, status_label = "human_confirmed", "Dikonfirmasi reviewer"
        dimensions = dimensions_text(item.attributes)
        rendered = {
            "work_item_id": item.work_item_id,
            "category": resolved_category,
            "source_category": item.category,
            "discipline": taxonomy.discipline,
            "code": item.code,
            "technical_name": taxonomy.technical_name,
            "plain_name": taxonomy.plain_name,
            "plain_description": taxonomy.plain_description,
            "display_name": f"{taxonomy.technical_name} {item.code}".strip() if item.code else taxonomy.technical_name,
            "level": None if level == "unknown" else level,
            "level_label": level_display_name(level),
            "status": status,
            "status_label": status_label,
            "maturity": item.maturity,
            "readiness_score": score,
            "confidence": round(confidence, 4),
            "confidence_percent": round(confidence * 100),
            "observed_label_count": item.occurrence_count_observed,
            "verified_physical_count": item.verified_physical_count,
            "count_authority": item.count_authority,
            "count_label": (
                f"{item.verified_physical_count} unit"
                if item.verified_physical_count is not None and item.count_authority in {"engine_confirmed", "human_confirmed"}
                else f"{item.occurrence_count_observed} kandidat terdeteksi"
            ),
            "count_is_final": item.verified_physical_count is not None and item.count_authority in {"engine_confirmed", "human_confirmed"},
            "dimensions_text": dimensions,
            "geometry_kind": taxonomy.geometry_kind,
            "known_facts": _known_facts(item, source_sheets),
            "blockers": blockers,
            "recommended_actions": _recommended_actions(blockers, reasons),
            "source_sheets": source_sheets,
            "occurrences": item_occurrences,
            "evidence_count": len(set(item.evidence_refs)),
            "evidence_refs": item.evidence_refs,
            "review_task_ids": item.review_task_ids,
            "attributes": item.attributes,
            "conflicts": conflicts_by_item.get(item.work_item_id, []),
            "conflict_status": "open" if any(c.get("status") == "open" for c in conflicts_by_item.get(item.work_item_id, [])) else "none",
            "measurement_facts": [fact.model_dump(mode="json") for fact in item.measurement_facts],
            "calculation_readiness": item.calculation_readiness,
            "calculation": item.calculation.model_dump(mode="json") if item.calculation else None,
            "user_accepted": item.user_accepted,
            "presentation_quality_reasons": reasons,
        }
        suppress = suppression_reasons(
            category=resolved_category, code=item.code,
            attributes=item.attributes, source_sheets=source_sheets,
        )
        rendered["suppression_reasons"] = suppress
        if presentable:
            user_items.append(rendered)
        elif suppress:
            suppressed.append(rendered)
        else:
            clarification.append(rendered)

    user_items.sort(key=lambda row: (
        row["discipline"], row["level"] or "ZZZ", row["technical_name"], row["code"] or ""
    ))
    clarification.sort(key=lambda row: (row["readiness_score"], row["display_name"]), reverse=True)
    suppressed.sort(key=lambda row: (row["display_name"], row["work_item_id"]))

    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for item in user_items:
        groups[(item["discipline"], item["level"] or "Belum diketahui")].append(item)
    work_groups = []
    for (discipline, level), items in sorted(groups.items()):
        category_counts = Counter(item["technical_name"] for item in items)
        work_groups.append({
            "group_id": f"{discipline}:{level}",
            "discipline": discipline,
            "level": None if level == "Belum diketahui" else level,
            "level_label": level_display_name(None if level == "Belum diketahui" else level),
            "item_count": len(items),
            "observed_label_count": sum(item["observed_label_count"] for item in items),
            "confirmed_physical_count": sum(item.get("verified_physical_count") or 0 for item in items),
            "average_readiness_score": round(mean(item["readiness_score"] for item in items)) if items else 0,
            "category_summary": dict(category_counts),
            "items": items,
        })

    clarification_task_ids = {
        task_id for item in clarification for task_id in item.get("review_task_ids", [])
    }
    # A presentable item enters the user decision queue only when the user must
    # choose between competing facts or the engine cannot establish identity,
    # level, or an authoritative count source. Missing optional dimensions and
    # enrichment attributes remain auditable, but do not become dozens of
    # repetitive user approvals.
    decision_task_ids = set(clarification_task_ids)
    item_by_task: dict[str, dict[str, Any]] = {}
    for item in [*user_items, *clarification]:
        for task_id in item.get("review_task_ids", []):
            item_by_task[task_id] = item
        blockers_text = " ".join(str(value).casefold() for value in item.get("blockers", []))
        requires_decision = (
            item.get("conflict_status") == "open"
            or item.get("count_authority") in {"conflicting"}
            or any(key in blockers_text for key in (
                "authoritative_count_source", "classification", "revision", "level",
                "data rancu", "conflict",
            ))
        )
        if requires_decision:
            decision_task_ids.update(item.get("review_task_ids", []))

    review_priority = sorted(
        [
            {
                **task.model_dump(mode="json"),
                "page_number": task.page_index + 1,
                "priority_score": 100 if task.severity == "blocking" else 60 if task.severity == "review" else 20,
            }
            for task in analysis.review_queue
            if task.status == "open"
            and task.task_type == "work_item"
            and task.task_id in decision_task_ids
        ],
        key=lambda task: (-task["priority_score"], task["page_index"], task["task_id"]),
    )

    review_batches = _build_review_batches(review_priority)
    technical_audit = [
        {
            **task.model_dump(mode="json"),
            "page_number": task.page_index + 1,
            "audit_scope": "technical_enrichment" if task.task_type == "work_item" else "technical_pipeline",
        }
        for task in analysis.review_queue
        if task.status == "open"
        and (task.task_type != "work_item" or task.task_id not in decision_task_ids)
    ]

    return {
        "schema_version": "paax.drawing-intelligence.human-delivery.v2",
        "package_id": analysis.package_id,
        "document_name": analysis.document_name,
        "document_sha256": analysis.document_sha256,
        "page_count": analysis.page_count,
        "source_manifest": analysis.source_manifest.model_dump(mode="json") if analysis.source_manifest else None,
        "summary": {
            "recognized_work_items": len(user_items),
            "needs_clarification": len(clarification),
            "suppressed_audit_candidates": len(suppressed),
            "open_review_tasks": len(review_priority),
            "review_batches": len(review_batches),
            "accepted_drawing_objects": sum(bool(item["user_accepted"]) for item in user_items),
            "system_confirmed_work_items": sum(item.get("count_authority") == "engine_confirmed" for item in user_items),
            "confirmed_physical_elements": sum(item.get("verified_physical_count") or 0 for item in user_items),
            "open_conflicts": sum(item.get("conflict_status") == "open" for item in [*user_items, *clarification]),
            "disciplines": dict(Counter(item["discipline"] for item in user_items)),
            "levels": dict(Counter(item["level_label"] for item in user_items)),
            "average_readiness_score": round(mean(item["readiness_score"] for item in user_items)) if user_items else 0,
        },
        "safety": {
            "physical_counts_auto_accepted": analysis.metrics.get("physical_counts_auto_accepted", 0),
            "final_quantities_calculated": bool(analysis.metrics.get("final_quantities_calculated", 0)),
            "message": (
                "Jumlah fisik dapat dikonfirmasi sistem hanya pada count-source yang lolos seluruh constraint. "
                "Perbedaan antarlembar tetap ditandai sebagai Data rancu dan memerlukan keputusan reviewer."
            ),
        },
        "candidate_inventory": [row.model_dump(mode="json") for row in build_candidate_inventory(analysis)],
        "work_groups": work_groups,
        "work_items": user_items,
        "needs_clarification": clarification,
        "suppressed_candidates": suppressed,
        "review_queue": review_priority,
        "review_batches": review_batches,
        "technical_audit_queue": technical_audit,
        "conflicts": [conflict.model_dump(mode="json") for conflict in analysis.conflicts],
        "accepted_drawing_objects": [item for item in user_items if item["user_accepted"]],
        "source_sheets": list(pages.values()),
        "metrics": analysis.metrics,
        "phase_status": analysis.phase_status,
        "warnings": analysis.warnings,
    }
