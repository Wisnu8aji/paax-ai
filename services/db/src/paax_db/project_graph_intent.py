"""Deterministic intent parsing and validation for project graph queries."""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import ProjectGraphAlias, ProjectGraphNode
from .schemas import (
    EdgeRelationEnum,
    GraphQueryPlan,
    QueryEntity,
    QueryIntentEnum,
)


_VOCABULARY_CACHE: dict[str, "_Vocabulary"] = {}

_DISCIPLINE_ALIASES = {
    "struktur": "structure",
    "structure": "structure",
    "arsitektur": "architecture",
    "arsitektural": "architecture",
    "architecture": "architecture",
    "mep": "mep",
    "me": "mep",
    "mekanikal": "mep",
    "elektrikal": "mep",
    "plumbing": "mep",
    "sanitasi": "mep",
    "listrik": "mep",
}
_VALID_DISCIPLINES = frozenset({"structure", "architecture", "mep", "site", "general"})

_MATERIAL_TERMS = frozenset({"material", "semen", "besi", "beton", "bertulang"})
_CALCULATION_SIGNAL_TERMS = frozenset(
    {
        "volume",
        "m3",
        "m³",
        "kubikasi",
        "biaya",
        "harga",
        "rab",
        "anggaran",
        "butuh",
        "kebutuhan",
    }
)
_CALCULATION_TERMS = _CALCULATION_SIGNAL_TERMS | _MATERIAL_TERMS
_CONFLICT_TERMS = frozenset({"konflik", "bentrok", "tidak sesuai", "beda ukuran"})
_MISSING_TERMS = frozenset({"data kurang", "tidak ada data", "belum lengkap", "hilang"})
_NUMERIC_WORDS = frozenset({"dimensi", "ukuran", "tinggi", "lebar", "tebal", "elevasi", "peil"})
_STOP_WORDS = frozenset(
    {
        "ada",
        "apa",
        "saja",
        "dan",
        "di",
        "dari",
        "dengan",
        "gambar",
        "lantai",
        "berapa",
        "yang",
        "untuk",
        "pada",
        "mana",
        "sbg",
        "sebagai",
        "apa saja",
    }
)

_ELEMENT_RELATIONS = [
    EdgeRelationEnum.INSTANCE_OF,
    EdgeRelationEnum.LOCATED_ON,
    EdgeRelationEnum.LOCATED_IN,
    EdgeRelationEnum.DEFINED_BY,
    EdgeRelationEnum.DEPICTED_IN,
    EdgeRelationEnum.HAS_DIMENSION,
    EdgeRelationEnum.USES_MATERIAL,
    EdgeRelationEnum.HAS_EVIDENCE,
]
_CONFLICT_RELATIONS = [EdgeRelationEnum.CONFLICTS_WITH, EdgeRelationEnum.HAS_EVIDENCE]

_LEVEL_PATTERN = re.compile(r"\b(?:lantai|lt)\s*[.\-]?\s*(\d+)\b", re.IGNORECASE)
_GENERIC_LEVEL_WORD_PATTERN = re.compile(r"\b(?:atap|dasar|basement)\b", re.IGNORECASE)
_TOKEN_PATTERN = re.compile(r"[^\W_]+(?:[.\-][^\W_]+)?", re.UNICODE)
_ENTITY_TOKEN_MIN_LENGTH = 4
_MAX_ENTITY_TOKEN_MATCHES = 5
_MAX_ENTITY_TYPES_PER_TOKEN = 8
_GENERIC_LEVEL_TOKENS = frozenset({"atap", "dasar", "basement"})


@dataclass(frozen=True)
class _Vocabulary:
    levels: dict[str, str]
    elements: dict[str, str]
    disciplines: frozenset[str]


def _normalize(value: str) -> str:
    return " ".join(value.casefold().split())


def _phrase_pattern(phrase: str) -> re.Pattern[str]:
    return re.compile(rf"(?<![\w]){re.escape(_normalize(phrase))}(?![\w])", re.IGNORECASE)


async def _load_vocabulary(
    session: AsyncSession, *, project_id: str, snapshot_id: str
) -> _Vocabulary:
    cached = _VOCABULARY_CACHE.get(snapshot_id)
    if cached is not None:
        return cached

    nodes = (
        await session.execute(
            select(
                ProjectGraphNode.node_id,
                ProjectGraphNode.node_type,
                ProjectGraphNode.canonical_name,
                ProjectGraphNode.normalized_name,
                ProjectGraphNode.discipline,
            ).where(
                ProjectGraphNode.project_id == project_id,
                ProjectGraphNode.snapshot_id == snapshot_id,
                ProjectGraphNode.node_type.in_(["level", "element_type", "discipline"]),
            )
        )
    ).all()

    levels: dict[str, str] = {}
    elements: dict[str, str] = {}
    disciplines = set(_VALID_DISCIPLINES)
    node_types: dict[str, str] = {}
    canonical_names: dict[str, str] = {}
    for node_id, node_type, canonical_name, normalized_name, discipline in nodes:
        node_types[node_id] = node_type
        canonical_names[node_id] = canonical_name
        normalized_canonical = _normalize(canonical_name)
        normalized_stored = _normalize(normalized_name)
        if node_type == "level":
            levels[normalized_canonical] = canonical_name
            levels[normalized_stored] = canonical_name
        elif node_type == "element_type":
            elements[normalized_canonical] = canonical_name
            elements[normalized_stored] = canonical_name
        elif node_type == "discipline":
            discipline_name = _normalize(canonical_name)
            if discipline_name in _VALID_DISCIPLINES:
                disciplines.add(discipline_name)
        if discipline in _VALID_DISCIPLINES:
            disciplines.add(discipline)

    aliases = (
        await session.execute(
            select(ProjectGraphAlias.alias_normalized, ProjectGraphAlias.alias_raw, ProjectGraphAlias.node_id).where(
                ProjectGraphAlias.project_id == project_id,
                ProjectGraphAlias.snapshot_id == snapshot_id,
            )
        )
    ).all()
    for alias_normalized, alias_raw, node_id in aliases:
        canonical_name = canonical_names.get(node_id)
        node_type = node_types.get(node_id)
        if canonical_name is None or node_type not in {"level", "element_type"}:
            continue
        target = levels if node_type == "level" else elements
        target[_normalize(alias_normalized)] = canonical_name
        target[_normalize(alias_raw)] = canonical_name

    vocabulary = _Vocabulary(levels=levels, elements=elements, disciplines=frozenset(disciplines))
    _VOCABULARY_CACHE[snapshot_id] = vocabulary
    return vocabulary


def _find_vocab_matches(query: str, vocabulary: dict[str, str]) -> list[tuple[int, int, str]]:
    matches: list[tuple[int, int, str]] = []
    for phrase, canonical_name in vocabulary.items():
        for match in _phrase_pattern(phrase).finditer(query):
            matches.append((match.start(), match.end(), canonical_name))
    matches.sort(key=lambda item: (item[0], -(item[1] - item[0]), item[2]))
    selected: list[tuple[int, int, str]] = []
    for match in matches:
        if any(match[0] < current[1] and current[0] < match[1] for current in selected):
            continue
        selected.append(match)
    return selected


def _generic_level_matches(query: str) -> list[tuple[int, int, str]]:
    matches = [
        (match.start(), match.end(), f"Lantai {match.group(1)}")
        for match in _LEVEL_PATTERN.finditer(query)
    ]
    matches.extend(
        (match.start(), match.end(), match.group(0).title())
        for match in _GENERIC_LEVEL_WORD_PATTERN.finditer(query)
    )
    return matches


def _choose_level(query: str, vocabulary: _Vocabulary, notes: list[str]) -> tuple[str | None, set[str]]:
    direct_matches = _find_vocab_matches(query, vocabulary.levels)
    generic_matches = _generic_level_matches(query)
    recognized_terms: set[str] = set()
    selected = direct_matches[0] if direct_matches else None
    if selected is not None:
        recognized_terms.update(_normalize(query[selected[0] : selected[1]]).split())

    for start, end, generic_name in generic_matches:
        if any(start < direct[1] and direct[0] < end for direct in direct_matches):
            continue
        normalized_generic = _normalize(generic_name)
        recognized_terms.update(_normalize(query[start:end]).replace(".", " ").replace("-", " ").split())
        canonical = vocabulary.levels.get(normalized_generic)
        if canonical is None:
            notes.append(f"level tak dikenal: {generic_name}")
            if selected is None:
                selected = (start, end, "")
        elif selected is None:
            selected = (start, end, canonical)

    if selected is None:
        return None, recognized_terms
    if selected[2]:
        return selected[2], recognized_terms
    return None, recognized_terms


def _find_discipline(query: str, vocabulary: _Vocabulary) -> tuple[str | None, set[str]]:
    matches: list[tuple[int, int, str]] = []
    for term, discipline in _DISCIPLINE_ALIASES.items():
        if discipline not in vocabulary.disciplines:
            continue
        for match in _phrase_pattern(term).finditer(query):
            matches.append((match.start(), match.end(), discipline))
    matches.sort(key=lambda item: (item[0], -(item[1] - item[0]), item[2]))
    if not matches:
        return None, set()
    selected = matches[0]
    return selected[2], set(_normalize(query[selected[0] : selected[1]]).split())


def _find_entities(query: str, vocabulary: _Vocabulary) -> tuple[list[QueryEntity], set[str]]:
    matches = _find_vocab_matches(query, vocabulary.elements)
    entities: list[QueryEntity] = []
    recognized_terms: set[str] = set()
    seen: set[tuple[str, str]] = set()
    for start, end, canonical_name in matches:
        entity_key = ("element_type", canonical_name)
        if entity_key in seen:
            continue
        seen.add(entity_key)
        entities.append(QueryEntity(type="element_type", value=canonical_name))
        recognized_terms.update(_normalize(query[start:end]).split())

    excluded_tokens = (
        set(_STOP_WORDS)
        | set(_DISCIPLINE_ALIASES)
        | set(_VALID_DISCIPLINES)
        | _GENERIC_LEVEL_TOKENS
    )
    excluded_tokens.update(vocabulary.disciplines)
    excluded_tokens.update(
        _normalize(raw_token)
        for phrase in vocabulary.levels
        for raw_token in _TOKEN_PATTERN.findall(phrase)
    )
    token_to_entities: dict[str, set[str]] = {}
    for phrase, canonical_name in vocabulary.elements.items():
        for raw_token in _TOKEN_PATTERN.findall(phrase):
            token = _normalize(raw_token)
            token_to_entities.setdefault(token, set()).add(canonical_name)

    token_match_count = 0
    for raw_token in _TOKEN_PATTERN.findall(query):
        token = _normalize(raw_token)
        if (
            len(token) < _ENTITY_TOKEN_MIN_LENGTH
            or token.isdigit()
            or token in excluded_tokens
        ):
            continue
        candidate_names = token_to_entities.get(token, set())
        if not candidate_names or len(candidate_names) > _MAX_ENTITY_TYPES_PER_TOKEN:
            continue
        added_for_token = False
        for canonical_name in sorted(candidate_names):
            entity_key = ("element_type", canonical_name)
            if entity_key in seen:
                continue
            if token_match_count >= _MAX_ENTITY_TOKEN_MATCHES or len(entities) >= _MAX_ENTITY_TOKEN_MATCHES:
                break
            seen.add(entity_key)
            entities.append(QueryEntity(type="element_type", value=canonical_name))
            token_match_count += 1
            added_for_token = True
        if added_for_token:
            recognized_terms.add(token)
    return entities, recognized_terms


def _contains_term(query: str, terms: Iterable[str]) -> bool:
    return any(_phrase_pattern(term).search(query) for term in terms)


def has_calculation_signal(query: str) -> bool:
    """Return whether a query explicitly asks for a calculated quantity.

    Material words are lookup targets, not calculation signals by themselves.
    Keeping this predicate deterministic lets retrieval fail closed even when
    parsing itself raises before producing a plan.
    """
    return _contains_term(_normalize(query), _CALCULATION_SIGNAL_TERMS)


def _is_numeric_fact(query: str) -> bool:
    if _phrase_pattern("dimensi").search(query):
        return True
    return bool(re.search(r"\bberapa\s+(?:dimensi|ukuran|tinggi|lebar|tebal|elevasi|peil)\b", query))


def _unrecognized_terms(
    query: str, *, recognized_terms: set[str], intent_terms: set[str]
) -> list[str]:
    known = set(_STOP_WORDS) | recognized_terms | intent_terms
    output: list[str] = []
    for token in _TOKEN_PATTERN.findall(query):
        normalized = _normalize(token).replace(".", " ").replace("-", " ")
        if not normalized or normalized in known or normalized.isdigit():
            continue
        if normalized in {"m3", "m³"} or normalized in _CALCULATION_TERMS:
            continue
        if normalized not in output:
            output.append(normalized)
    return output


async def parse_query_plan(
    session: AsyncSession, *, project_id: str, snapshot_id: str, query: str
) -> tuple[GraphQueryPlan, list[str]]:
    """Parse a natural-language query into a validated graph traversal plan."""
    normalized_query = _normalize(query)
    vocabulary = await _load_vocabulary(session, project_id=project_id, snapshot_id=snapshot_id)
    notes: list[str] = []

    level, level_terms = _choose_level(normalized_query, vocabulary, notes)
    discipline, discipline_terms = _find_discipline(normalized_query, vocabulary)
    entities, entity_terms = _find_entities(normalized_query, vocabulary)

    intent_terms: set[str] = set()
    if _contains_term(normalized_query, _CONFLICT_TERMS):
        intent = QueryIntentEnum.CONFLICT_LOOKUP
        intent_terms.update({term for term in _CONFLICT_TERMS if _phrase_pattern(term).search(normalized_query)})
    elif has_calculation_signal(normalized_query):
        intent = QueryIntentEnum.CALCULATION_REQUIRED
        for term in _CALCULATION_TERMS:
            if _phrase_pattern(term).search(normalized_query):
                intent_terms.update(term.split())
    elif _is_numeric_fact(normalized_query):
        intent = QueryIntentEnum.NUMERIC_STORED_FACT
        intent_terms.update(_NUMERIC_WORDS)
        intent_terms.add("dimensi")
    elif _contains_term(normalized_query, _MISSING_TERMS):
        intent = QueryIntentEnum.MISSING_DATA
        intent_terms.update({term for term in _MISSING_TERMS if _phrase_pattern(term).search(normalized_query)})
    elif entities:
        intent = QueryIntentEnum.ELEMENT_LOOKUP
    else:
        intent = QueryIntentEnum.LIST_FILTER
        intent_terms.update({"apa", "saja", "di", "mana"})

    relations: list[EdgeRelationEnum]
    if intent in {QueryIntentEnum.ELEMENT_LOOKUP, QueryIntentEnum.LIST_FILTER}:
        relations = list(_ELEMENT_RELATIONS)
    elif intent == QueryIntentEnum.CONFLICT_LOOKUP:
        relations = list(_CONFLICT_RELATIONS)
    else:
        relations = []

    recognized_terms = level_terms | discipline_terms | entity_terms
    unrecognized = _unrecognized_terms(
        normalized_query,
        recognized_terms=recognized_terms,
        intent_terms=intent_terms,
    )
    if unrecognized:
        notes.append(f"unrecognized_terms: {', '.join(unrecognized)}")

    plan = GraphQueryPlan(
        intent=intent,
        project_id=project_id,
        entities=entities,
        filters={"level": level, "discipline": discipline},
        relations=relations,
    )
    return plan, notes
