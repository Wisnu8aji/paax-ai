from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import Any

from .dem_adapter import iter_observations, normalize_dem_bbox
from .text_index import normalize_text


@dataclass(frozen=True)
class EvidenceRepairStats:
    observations: int
    originally_linked: int
    repaired: int
    unresolved: int


def _iou(a, b) -> float:
    x0=max(a.x0,b.x0); y0=max(a.y0,b.y0); x1=min(a.x1,b.x1); y1=min(a.y1,b.y1)
    intersection=max(0.0,x1-x0)*max(0.0,y1-y0)
    union=a.area+b.area-intersection
    return intersection/union if union else 0.0


def _center_distance(a, b) -> float:
    ax,ay=a.center; bx,by=b.center
    return ((ax-bx)**2+(ay-by)**2)**0.5


def repair_dem_evidence_refs(dem_page: dict[str, Any]) -> tuple[dict[str, Any], EvidenceRepairStats]:
    """Link observations to evidence already present on the same DEM page.

    The operation is conservative: a link is added only when there is one
    clear best candidate based on exact/contained text and/or spatial overlap.
    It never fabricates an evidence object and records the repair metadata in
    the in-memory copy used by package intelligence.
    """
    page=deepcopy(dem_page)
    source=page.get("source",{})
    evidence_rows=[]
    for item in page.get("evidence",[]) or []:
        if not isinstance(item,dict) or not item.get("evidence_id"):
            continue
        raw=normalize_text(str(item.get("raw") or ""))
        box=normalize_dem_bbox(item.get("bbox"),source)
        evidence_rows.append((str(item["evidence_id"]),raw,box))

    total=linked=repaired=0
    for _,_,row in iter_observations(page):
        total+=1
        refs=row.get("evidence_refs") or []
        if refs:
            linked+=1
            continue
        raw=normalize_text(str(row.get("raw") or row.get("normalized") or ""))
        box=normalize_dem_bbox(row.get("bbox"),source)
        candidates=[]
        for evidence_id,evidence_raw,evidence_box in evidence_rows:
            text_score=0.0
            if raw and evidence_raw:
                if raw==evidence_raw:
                    text_score=1.0
                elif len(raw)>=5 and (raw in evidence_raw or evidence_raw in raw):
                    text_score=0.82
            spatial_score=0.0
            if box is not None and evidence_box is not None:
                overlap=_iou(box,evidence_box)
                distance=_center_distance(box,evidence_box)
                spatial_score=max(overlap, max(0.0,1.0-distance/0.08)*0.8)
            score=text_score*0.67+spatial_score*0.33
            if text_score==1.0 and spatial_score==0.0:
                score=0.9
            if score>=0.74:
                candidates.append((score,evidence_id))
        candidates.sort(reverse=True)
        if candidates and (len(candidates)==1 or candidates[0][0]-candidates[1][0]>=0.08):
            row["evidence_refs"]=[candidates[0][1]]
            row.setdefault("audit_metadata",{})["evidence_ref_repair"]={
                "method":"existing_evidence_text_spatial_match",
                "score":round(candidates[0][0],6),
            }
            repaired+=1
    page.setdefault("generation",{}).setdefault("paax_postprocess",{})["evidence_ref_repair"]={
        "observations":total,
        "originally_linked":linked,
        "repaired":repaired,
        "unresolved":total-linked-repaired,
    }
    return page,EvidenceRepairStats(total,linked,repaired,total-linked-repaired)


def bridge_dem_refs_to_native_tokens(
    dem_page: dict[str, Any], native_tokens: list[Any]
) -> tuple[dict[str, Any], EvidenceRepairStats]:
    """Bridge unreferenced DEM observations to deterministic native-PDF text.

    This is not evidence fabrication: every emitted reference is the ID of a
    text token extracted from the original PDF. Phrase observations may link to
    all token IDs on one native visual line. Ambiguous matches remain empty.
    """
    from .models import BBox
    from .text_index import tokens_by_visual_line

    page = deepcopy(dem_page)
    source = page.get("source", {})
    candidates: list[tuple[list[str], str, BBox]] = []
    for token in native_tokens:
        if getattr(token, "source", None) != "native_pdf":
            continue
        candidates.append(([token.token_id], token.normalized, token.bbox))
    for line in tokens_by_visual_line([token for token in native_tokens if getattr(token, "source", None) == "native_pdf"]):
        if not line:
            continue
        raw = normalize_text(" ".join(token.text for token in line))
        try:
            box = BBox(
                x0=min(token.bbox.x0 for token in line),
                y0=min(token.bbox.y0 for token in line),
                x1=max(token.bbox.x1 for token in line),
                y1=max(token.bbox.y1 for token in line),
                space="normalized",
            )
        except ValueError:
            continue
        candidates.append(([token.token_id for token in line], raw, box))

    total = linked = repaired = 0
    for _, _, row in iter_observations(page):
        total += 1
        if row.get("evidence_refs"):
            linked += 1
            continue
        raw = normalize_text(str(row.get("raw") or row.get("normalized") or ""))
        box = normalize_dem_bbox(row.get("bbox"), source)
        if not raw or box is None:
            continue
        scored: list[tuple[float, list[str]]] = []
        for refs, candidate_raw, candidate_box in candidates:
            text_score = 0.0
            if raw == candidate_raw:
                text_score = 1.0
            elif min(len(raw), len(candidate_raw)) >= 4 and (raw in candidate_raw or candidate_raw in raw):
                text_score = 0.82
            if not text_score:
                continue
            overlap = _iou(box, candidate_box)
            distance = _center_distance(box, candidate_box)
            spatial = max(overlap, max(0.0, 1.0 - distance / 0.06) * 0.8)
            score = text_score * 0.64 + spatial * 0.36
            # Exact unique text is useful even when old DEM bbox is coarse.
            if text_score == 1.0 and spatial == 0.0:
                score = 0.86
            if score >= 0.76:
                scored.append((score, refs))
        scored.sort(key=lambda item: item[0], reverse=True)
        if not scored:
            continue
        if len(scored) > 1 and scored[0][0] - scored[1][0] < 0.08 and scored[0][1] != scored[1][1]:
            continue
        row["evidence_refs"] = [f"native:{ref}" for ref in scored[0][1]]
        row.setdefault("audit_metadata", {})["evidence_ref_repair"] = {
            "method": "native_pdf_text_spatial_bridge",
            "score": round(scored[0][0], 6),
        }
        repaired += 1
    page.setdefault("generation", {}).setdefault("paax_postprocess", {})["native_evidence_bridge"] = {
        "observations": total,
        "originally_linked": linked,
        "repaired": repaired,
        "unresolved": total - linked - repaired,
    }
    return page, EvidenceRepairStats(total, linked, repaired, total - linked - repaired)
