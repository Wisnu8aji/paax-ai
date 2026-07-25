from __future__ import annotations

import re
import unicodedata

import fitz

from .coordinates import normalized_bbox
from .models import PlanZone, TextToken


_SPACE = re.compile(r"\s+")


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).upper().strip()
    value = value.replace("×", "X")
    value = _SPACE.sub(" ", value)
    return value


def _zone_for(box, zones: list[PlanZone]) -> str | None:
    cx, cy = box.center
    matches = [zone for zone in zones if zone.bbox.contains(cx, cy)]
    if not matches:
        return None
    matches.sort(key=lambda z: (z.type == "drawing", -z.confidence, z.bbox.area))
    return matches[0].zone_id


def extract_native_tokens(page: fitz.Page, page_index: int, zones: list[PlanZone] | None = None) -> list[TextToken]:
    zones = zones or []
    tokens: list[TextToken] = []
    words = page.get_text("words", sort=True)
    for idx, word in enumerate(words):
        x0, y0, x1, y1, text, block_no, line_no, word_no = word[:8]
        if not str(text).strip():
            continue
        box = normalized_bbox((x0, y0, x1, y1), page.rect)
        tokens.append(
            TextToken(
                token_id=f"p{page_index}-w{idx:05d}",
                page_index=page_index,
                text=str(text),
                normalized=normalize_text(str(text)),
                bbox=box,
                block_no=int(block_no),
                line_no=int(line_no),
                word_no=int(word_no),
                zone_id=_zone_for(box, zones),
                source="native_pdf",
                confidence=1.0,
            )
        )
    return tokens


def tokens_by_visual_line(tokens: list[TextToken]) -> list[list[TextToken]]:
    groups: dict[tuple[int, int], list[TextToken]] = {}
    for token in tokens:
        groups.setdefault((token.block_no, token.line_no), []).append(token)
    result = []
    for key in sorted(groups):
        result.append(sorted(groups[key], key=lambda t: t.word_no))
    return result
