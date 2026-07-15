from __future__ import annotations

import re
import unicodedata


STANDARD_DISCIPLINES = frozenset(
    {"architecture", "structure", "mep", "site", "general"}
)
UNRESOLVED_DISCIPLINE = "unresolved"


def _discipline_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold().strip()
    return " ".join(re.findall(r"[a-z0-9]+", normalized))


_DISCIPLINE_ALIASES = {
    "architecture": "architecture",
    "architectural": "architecture",
    "arsitektur": "architecture",
    "interior design": "architecture",
    "structure": "structure",
    "structural": "structure",
    "struktur": "structure",
    "sipil": "structure",
    "mep": "mep",
    "mep electrical": "mep",
    "electrical": "mep",
    "elektrikal": "mep",
    "elektrikal penangkal petir": "mep",
    "mechanical": "mep",
    "mekanikal": "mep",
    "plumbing": "mep",
    "site": "site",
    "civil site": "site",
    "infrastructure": "site",
    "infrastruktur": "site",
    "landscape": "site",
    "lanskap": "site",
    "general": "general",
    "arsitektur mep": "general",
}


def normalize_discipline(value: str) -> str:
    """Map a source discipline spelling to the bounded PCKM vocabulary."""
    if not isinstance(value, str):
        return UNRESOLVED_DISCIPLINE
    return _DISCIPLINE_ALIASES.get(_discipline_key(value), UNRESOLVED_DISCIPLINE)


_CODE_PATTERN = re.compile(r"[A-Z]{1,4}\s*[-._/]?\s*\d+[A-Z]?")
_PARENTHESIZED_CODE_PATTERN = re.compile(
    rf"\(\s*({_CODE_PATTERN.pattern})\s*\)"
)


def _compact_code(value: str) -> str:
    return re.sub(r"[-._/\s]+", "", value.upper())


def normalize_element_code(value: str) -> str:
    """Canonicalize code separators while preserving non-code labels."""
    if not isinstance(value, str):
        return ""

    normalized = unicodedata.normalize("NFKC", value).strip().upper()
    if not normalized:
        return ""

    parenthesized = _PARENTHESIZED_CODE_PATTERN.findall(normalized)
    if parenthesized:
        return _compact_code(parenthesized[-1])

    candidate = re.sub(r"^TYPE\s*:\s*", "", normalized).strip()
    if _CODE_PATTERN.fullmatch(candidate):
        return _compact_code(candidate)

    return " ".join(normalized.split())
