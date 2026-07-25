"""Authoritative, project-bound engineering context projection.

This module deliberately uses verified Civil Work Items rather than raw graph
occurrence counts. It is pure and independently testable so every AI surface
can consume the same scope and authority rules.
"""
from __future__ import annotations

import re
from decimal import Decimal
from typing import Any, Iterable

_CODE_RE = re.compile(r"\b(?:K(?:P|\d+[A-Z]?)|SL\d+[A-Z]?|G\d+[A-Z]?|B\d+[A-Z]?|RB\d+[A-Z]?)\b", re.IGNORECASE)



def validate_civil_work_items_payload(payload: dict[str, Any], *, expected_project_id: str, expected_source_sha256: str | None = None) -> list[str]:
    """Validate the authoritative fixture before it can feed UI, AI or calculations.

    This protects the portable package from silent hard-coded fixture drift. A
    ready volume item must have complete dimensions, evidence and an exact
    Decimal recomputation that matches its stored result.
    """
    errors: list[str] = []
    if payload.get("project_id") != expected_project_id:
        errors.append("project binding mismatch")
    if expected_source_sha256 and payload.get("source_document_sha256") != expected_source_sha256:
        errors.append("source document checksum binding mismatch")
    items = payload.get("items")
    if not isinstance(items, list):
        return errors + ["items must be a list"]
    seen: set[str] = set()
    for item in items:
        item_id = str(item.get("id") or "")
        if not item_id:
            errors.append("missing work item id")
            continue
        if item_id in seen:
            errors.append(f"{item_id}: duplicate work item id")
        seen.add(item_id)
        if not item.get("source_refs"):
            errors.append(f"{item_id}: missing source_refs")
        if item.get("readiness") != "ready":
            continue
        if item.get("status") not in {"engine_verified", "human_verified"}:
            errors.append(f"{item_id}: ready item is not verified")
        if item.get("source_authority") != "core_engine":
            errors.append(f"{item_id}: ready volume must use core_engine authority")
        dimensions = item.get("dimensions") or {}
        try:
            result = (
                Decimal(str(dimensions["length_m"]))
                * Decimal(str(dimensions["width_m"]))
                * Decimal(str(dimensions["height_m"]))
                * Decimal(str(item["count"]))
            )
            stored = Decimal(str(item["result"]))
            if abs(result - stored) > Decimal("0.000001"):
                errors.append(f"{item_id}: formula drift {result} != {stored}")
        except (KeyError, TypeError, ValueError, ArithmeticError) as exc:
            errors.append(f"{item_id}: invalid calculation inputs ({exc})")
    return errors

def _normalize(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _query_codes(query: str) -> set[str]:
    return {match.upper() for match in _CODE_RE.findall(query.upper())}


def _query_location(query: str) -> str | None:
    text = _normalize(query)
    patterns = (
        (r"\b(?:lantai|lt\.?|level|l)\s*[-:]?\s*1\b", "Lantai 1"),
        (r"\b(?:lantai|lt\.?|level|l)\s*[-:]?\s*2\b", "Lantai 2"),
        (r"\b(?:atap|roof|dak)\b", "Atap"),
        (r"\b(?:substructure|substruktur|fondasi|pondasi)\b", "Substruktur"),
    )
    for pattern, location in patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return location
    return None


def _query_categories(query: str) -> set[str]:
    text = _normalize(query)
    categories: set[str] = set()
    aliases = {
        "column": ("kolom", "column"),
        "beam": ("balok", "beam", "girder"),
        "slab": ("pelat", "slab", "plat"),
        "foundation": ("fondasi", "pondasi", "foundation", "pile cap"),
        "wall": ("dinding", "wall"),
    }
    for category, terms in aliases.items():
        if any(term in text for term in terms):
            categories.add(category)
    return categories


def _item_search_text(item: dict[str, Any]) -> str:
    values: list[str] = [
        item.get("id", ""), item.get("display_name", ""), item.get("technical_code", ""),
        item.get("discipline", ""), item.get("category", ""), item.get("location", ""),
        item.get("wbs_section", ""), item.get("wbs_group", ""),
    ]
    values.extend(item.get("lbs_path") or [])
    return _normalize(" ".join(map(str, values)))


def select_civil_work_items(items: Iterable[dict[str, Any]], query: str, *, limit: int = 12) -> list[dict[str, Any]]:
    """Select items by explicit code/location/category, with conservative fallback."""
    candidates = list(items)
    codes = _query_codes(query)
    location = _query_location(query)
    categories = _query_categories(query)
    query_tokens = {token for token in re.findall(r"[a-z0-9]+", _normalize(query)) if len(token) > 1}

    selected: list[tuple[int, dict[str, Any]]] = []
    for item in candidates:
        code = str(item.get("technical_code") or "").upper()
        item_location = str(item.get("location") or "")
        item_category = str(item.get("category") or "").lower()
        if codes and code not in codes:
            continue
        if location and item_location != location:
            continue
        if categories and item_category not in categories:
            continue
        text = _item_search_text(item)
        overlap = sum(token in text for token in query_tokens)
        score = overlap
        if code and code in codes: score += 12
        if location and item_location == location: score += 8
        if categories and item_category in categories: score += 5
        if item.get("readiness") == "ready": score += 1
        selected.append((score, item))

    # If a generic engineering question contains no explicit selectors, expose a
    # bounded overview rather than inventing a likely scope.
    if not selected and not (codes or location or categories):
        selected = [(sum(token in _item_search_text(item) for token in query_tokens), item) for item in candidates]
    selected.sort(key=lambda pair: (-pair[0], str(pair[1].get("location")), str(pair[1].get("technical_code"))))
    return [item for _, item in selected[:limit]]


def build_engineering_context(project_id: str, payload: dict[str, Any], query: str) -> dict[str, Any]:
    selected = select_civil_work_items(payload.get("items", []), query)
    citations: list[dict[str, Any]] = []
    facts: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    allowed_claims: list[str] = []
    forbidden_claims: list[str] = []

    for item in selected:
        fact = {
            "work_item_id": item.get("id"),
            "item": item.get("display_name"),
            "technical_code": item.get("technical_code"),
            "location": item.get("location"),
            "category": item.get("category"),
            "unit": item.get("unit"),
            "dimensions": item.get("dimensions_display"),
            "count": item.get("count"),
            "formula": item.get("formula"),
            "result": item.get("result_display"),
            "status": item.get("status"),
            "readiness": item.get("readiness"),
            "source_authority": item.get("source_authority"),
            "notes": item.get("notes") or [],
        }
        facts.append(fact)
        for ref in item.get("source_refs") or []:
            citation_id = f"{item.get('id')}:{ref.get('page')}:{ref.get('role')}"
            citations.append({
                "citation_id": citation_id,
                "work_item_id": item.get("id"),
                "page": ref.get("page"),
                "role": ref.get("role"),
                "label": ref.get("label"),
            })
        for conflict in item.get("conflicts") or []:
            conflicts.append({"work_item_id": item.get("id"), **conflict})

        if item.get("readiness") == "ready" and item.get("status") in {"engine_verified", "human_verified"}:
            allowed_claims.extend([
                f"{item.get('display_name')} di {item.get('location')} berjumlah {item.get('count')}.",
                f"Ukuran {item.get('technical_code')} di {item.get('location')} adalah {item.get('dimensions_display')}.",
                f"Hasil terverifikasi {item.get('technical_code')} di {item.get('location')} adalah {item.get('result_display')} dengan formula {item.get('formula')}.",
            ])
        else:
            forbidden_claims.append(
                f"Jangan menyatakan volume final {item.get('technical_code')} di {item.get('location')} sebelum fakta yang hilang ditinjau."
            )

    if not selected:
        forbidden_claims.append("Jangan mengarang quantity atau dimensi karena tidak ada Civil Work Item terverifikasi yang cocok dengan scope query.")

    authorities = {item.get("source_authority") for item in selected}
    if selected and authorities == {"core_engine"} and not conflicts:
        quantity_authority = "core_engine"
    elif selected and authorities <= {"core_engine", "measurement_fact"}:
        quantity_authority = "measurement_fact"
    else:
        quantity_authority = "none"

    return {
        "schema_version": "paax.engineering-context.v1",
        "project_binding": {"project_id": project_id, "source": "civil_work_item_projection"},
        "query": query,
        "matched_item_count": len(selected),
        "facts": facts,
        "citations": citations,
        "conflicts": conflicts,
        "allowed_claims": allowed_claims,
        "forbidden_claims": forbidden_claims,
        "quantity_authority": quantity_authority,
        "abstain_when_unmatched": True,
    }
