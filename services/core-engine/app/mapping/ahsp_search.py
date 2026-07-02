from __future__ import annotations

import re
from typing import Dict

from app.rab.models import AHSPItem

from .models import AhspCandidate, AhspMapRequest, AhspMapResult, AhspSearchRequest, AhspSearchResult


STOP = {"pekerjaan", "dan", "yang", "dengan", "untuk"}


def _tokens(text: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", text.lower()) if t and t not in STOP}


def _included_from_name(name: str) -> set[str]:
    m = re.search(r"termasuk\s+(.+)$", name.lower())
    if not m:
        return set()
    return _tokens(m.group(1))


def search_ahsp(req: AhspSearchRequest, ahsp_index: Dict[str, AHSPItem]) -> AhspSearchResult:
    q = _tokens(req.query)
    candidates: list[AhspCandidate] = []
    for item in ahsp_index.values():
        t = _tokens(item.name)
        overlap = len(q & t)
        union = len(q | t) or 1
        unit_ok = req.unit is None or item.unit == req.unit
        score = overlap / union + (0.25 if unit_ok else 0.0)
        candidates.append(AhspCandidate(
            ahsp_code=item.code,
            name=item.name,
            unit=item.unit,
            score=round(score + 1e-12, 4),
            unit_ok=unit_ok,
            reason=f"token_overlap={overlap}/{union}; unit_ok={unit_ok}",
        ))
    candidates.sort(key=lambda c: (-c.score, c.ahsp_code))
    return AhspSearchResult(candidates=candidates[: req.top_k])


def map_workitem_to_ahsp(req: AhspMapRequest, ahsp_index: Dict[str, AHSPItem]) -> AhspMapResult:
    search = search_ahsp(
        AhspSearchRequest(query=req.workitem.uraian, unit=req.workitem.unit, top_k=req.top_k),
        ahsp_index,
    )
    warnings: list[str] = []
    if search.candidates:
        top = ahsp_index[search.candidates[0].ahsp_code]
        included = _included_from_name(top.name)
        for sibling in req.sibling_work_types:
            if sibling.lower() in included:
                warnings.append(
                    f"RULE-AHSP-05: AHSP {top.code} sudah termasuk {sibling}; cek anti double-count."
                )
    return AhspMapResult(work_id=req.workitem.work_id, candidates=search.candidates, warnings=warnings)
