from __future__ import annotations

"""Compile written dimensions into typed, evidence-backed element facts."""

from collections import defaultdict
from .models import DrawingConflict, ElementMeasurementFact, VocabularyEntry, WorkItemCandidate


def compile_definition_measurements(
    *, work_items: list[WorkItemCandidate], vocabulary: list[VocabularyEntry], conflicts: list[DrawingConflict],
) -> list[WorkItemCandidate]:
    by_key_category: dict[tuple[str, str], list[VocabularyEntry]] = defaultdict(list)
    for entry in vocabulary:
        by_key_category[(entry.canonical_key, entry.category)].append(entry)
    open_conflict_fields = defaultdict(set)
    for conflict in conflicts:
        if conflict.status == "open":
            open_conflict_fields[conflict.work_item_id].add(conflict.field)

    result = []
    for item in work_items:
        facts = list(item.measurement_facts)
        if "dimensions" not in open_conflict_fields.get(item.work_item_id, set()):
            dimensions = item.attributes.get("dimensions")
            if isinstance(dimensions, dict):
                width = dimensions.get("width", dimensions.get("a"))
                depth = dimensions.get("depth", dimensions.get("b"))
                unit = str(dimensions.get("unit") or "mm")
                definitions = by_key_category.get((item.code or "", item.category), [])
                refs = sorted({ref for entry in definitions for ref in entry.evidence_refs})
                pages = sorted({entry.page_index for entry in definitions})
                if width is not None and depth is not None and refs:
                    facts.extend([
                        ElementMeasurementFact(
                            measurement_id=f"mf-{item.work_item_id}-width", work_item_id=item.work_item_id,
                            field="width", value=float(width), unit=unit, source_method="written_dimension",
                            verification_status="engine_verified", evidence_refs=refs,
                            source_page_indices=pages, formula_input="width",
                        ),
                        ElementMeasurementFact(
                            measurement_id=f"mf-{item.work_item_id}-depth", work_item_id=item.work_item_id,
                            field="depth", value=float(depth), unit=unit, source_method="written_dimension",
                            verification_status="engine_verified", evidence_refs=refs,
                            source_page_indices=pages, formula_input="depth",
                        ),
                    ])
        # deterministic de-duplication by field; human facts can supersede later.
        unique = {}
        for fact in facts:
            unique[fact.field] = fact
        result.append(item.model_copy(update={"measurement_facts": list(unique.values())}, deep=True))
    return result
