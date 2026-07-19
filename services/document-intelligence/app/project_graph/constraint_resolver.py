from __future__ import annotations
import math
from typing import Any, Sequence, Optional, Literal
from pydantic import BaseModel, Field

# 12.3 Resolution states
ResolutionState = Literal[
    "proposed",
    "validated",
    "accepted",
    "ambiguous",
    "conflicting",
    "rejected",
    "human_verified"
]

class ScoredCandidate(BaseModel):
    candidate_id: str
    target_node_id: str
    score: float
    confidence_calibration: dict[str, float] = Field(default_factory=dict)
    passed_constraints: list[str] = Field(default_factory=list)
    failed_constraints: list[str] = Field(default_factory=list)
    score_breakdown: dict[str, float] = Field(default_factory=dict)

def calculate_distance(
    bbox1: tuple[float, float, float, float],
    bbox2: tuple[float, float, float, float],
    transform: Any = None
) -> float:
    # Compute center coordinates
    cx1 = (bbox1[0] + bbox1[2]) / 2.0
    cy1 = (bbox1[1] + bbox1[3]) / 2.0
    cx2 = (bbox2[0] + bbox2[2]) / 2.0
    cy2 = (bbox2[1] + bbox2[3]) / 2.0
    
    if transform is not None:
        try:
            norm_elem1 = transform.pdf_to_normalized_bbox(bbox1)
            norm_elem2 = transform.pdf_to_normalized_bbox(bbox2)
            cx1 = (norm_elem1[0] + norm_elem1[2]) / 2.0
            cy1 = (norm_elem1[1] + norm_elem1[3]) / 2.0
            cx2 = (norm_elem2[0] + norm_elem2[2]) / 2.0
            cy2 = (norm_elem2[1] + norm_elem2[3]) / 2.0
        except Exception:
            pass
            
    return math.sqrt((cx1 - cx2) ** 2 + (cy1 - cy2) ** 2)

def check_boundary_crossing(
    bbox1: tuple[float, float, float, float],
    bbox2: tuple[float, float, float, float],
    views: list[Any] | None = None,
    table_bboxes: list[tuple[float, float, float, float]] | None = None
) -> bool:
    cx1 = (bbox1[0] + bbox1[2]) / 2.0
    cy1 = (bbox1[1] + bbox1[3]) / 2.0
    cx2 = (bbox2[0] + bbox2[2]) / 2.0
    cy2 = (bbox2[1] + bbox2[3]) / 2.0
    
    # View Boundary Crossing
    if views:
        view1 = None
        view2 = None
        for v in views:
            v_bbox = getattr(v, "bbox", None) or (v.get("bbox") if isinstance(v, dict) else None)
            if v_bbox:
                vx0, vy0, vx1, vy1 = v_bbox
                if vx0 <= cx1 <= vx1 and vy0 <= cy1 <= vy1:
                    view1 = v
                if vx0 <= cx2 <= vx1 and vy0 <= cy2 <= vy1:
                    view2 = v
        if view1 is not None or view2 is not None:
            if view1 != view2:
                return True
                
    # Table crossing
    if table_bboxes:
        from app.perception.binding import _crosses_table
        if _crosses_table((cx1, cy1), (cx2, cy2), table_bboxes):
            return True
            
    return False

def check_same_view(
    bbox1: tuple[float, float, float, float],
    bbox2: tuple[float, float, float, float],
    views: list[Any] | None = None
) -> bool:
    cx1 = (bbox1[0] + bbox1[2]) / 2.0
    cy1 = (bbox1[1] + bbox1[3]) / 2.0
    cx2 = (bbox2[0] + bbox2[2]) / 2.0
    cy2 = (bbox2[1] + bbox2[3]) / 2.0
    
    if not views:
        return True
        
    view1 = None
    view2 = None
    for v in views:
        v_bbox = getattr(v, "bbox", None) or (v.get("bbox") if isinstance(v, dict) else None)
        if v_bbox:
            vx0, vy0, vx1, vy1 = v_bbox
            if vx0 <= cx1 <= vx1 and vy0 <= cy1 <= vy1:
                view1 = v
            if vx0 <= cx2 <= vx1 and vy0 <= cy2 <= vy1:
                view2 = v
                
    return view1 == view2 and view1 is not None

def check_table_row_alignment(
    bbox1: tuple[float, float, float, float],
    bbox2: tuple[float, float, float, float],
    tolerance: float = 5.0
) -> bool:
    cy1 = (bbox1[1] + bbox1[3]) / 2.0
    cy2 = (bbox2[1] + bbox2[3]) / 2.0
    return abs(cy1 - cy2) <= tolerance

def score_constraints(
    source_bbox: tuple[float, float, float, float] | None,
    candidate_bbox: tuple[float, float, float, float] | None,
    relation_type: str,
    transform: Any = None,
    views: list[Any] | None = None,
    table_bboxes: list[tuple[float, float, float, float]] | None = None,
    max_distance: float = 120.0,
    discipline_match: bool = True,
    revision_match: bool = True,
    has_leader_line: bool = False,
    typography_match: bool = True,
    legend_match: bool = True,
    schedule_match: bool = True,
    source_confidence: float = 1.0,
    target_confidence: float = 1.0,
) -> tuple[float, dict[str, float], list[str], list[str]]:
    score_breakdown = {}
    passed = []
    failed = []
    
    if source_bbox is None or candidate_bbox is None:
        return 0.0, {}, [], ["geometry_available"]
        
    # Same view constraint
    if check_same_view(source_bbox, candidate_bbox, views):
        score_breakdown["same_view"] = 1.0
        passed.append("same_view")
    else:
        score_breakdown["same_view"] = 0.0
        failed.append("same_view")
        
    # Boundary crossing constraint
    if check_boundary_crossing(source_bbox, candidate_bbox, views, table_bboxes):
        score_breakdown["no_boundary_crossing"] = 0.0
        failed.append("no_boundary_crossing")
    else:
        score_breakdown["no_boundary_crossing"] = 1.0
        passed.append("no_boundary_crossing")
        
    # Distance constraint
    dist = calculate_distance(source_bbox, candidate_bbox, transform)
    if dist > max_distance:
        score_breakdown["distance"] = 0.0
        failed.append("distance")
    else:
        score_breakdown["distance"] = max(0.0, 1.0 - (dist / max_distance))
        passed.append("distance")
        
    # Leader line
    if has_leader_line:
        score_breakdown["leader_line"] = 1.0
        passed.append("leader_line")
    else:
        score_breakdown["leader_line"] = 0.5
        passed.append("leader_line")
        
    # Discipline match
    if discipline_match:
        score_breakdown["discipline"] = 1.0
        passed.append("discipline")
    else:
        score_breakdown["discipline"] = 0.0
        failed.append("discipline")
        
    # Revision match
    if revision_match:
        score_breakdown["revision"] = 1.0
        passed.append("revision")
    else:
        score_breakdown["revision"] = 0.0
        failed.append("revision")
        
    # Typography match
    if typography_match:
        score_breakdown["typography"] = 1.0
        passed.append("typography")
    else:
        score_breakdown["typography"] = 0.5
        passed.append("typography")
        
    # Table row alignment
    if relation_type in {"type_to_schedule_row", "type_to_table"}:
        if check_table_row_alignment(source_bbox, candidate_bbox):
            score_breakdown["table_row_alignment"] = 1.0
            passed.append("table_row_alignment")
        else:
            score_breakdown["table_row_alignment"] = 0.0
            failed.append("table_row_alignment")
            
    # Calculate weighted final score
    weights = {
        "same_view": 0.15,
        "no_boundary_crossing": 0.25,
        "distance": 0.30,
        "leader_line": 0.10,
        "discipline": 0.10,
        "revision": 0.05,
        "typography": 0.05
    }
    if relation_type in {"type_to_schedule_row", "type_to_table"}:
        weights = {
            "same_view": 0.10,
            "no_boundary_crossing": 0.10,
            "distance": 0.10,
            "table_row_alignment": 0.50,
            "discipline": 0.10,
            "revision": 0.05,
            "typography": 0.05
        }
        
    if score_breakdown.get("no_boundary_crossing", 1.0) == 0.0:
        total_score = 0.0
    else:
        total_score = sum(score_breakdown.get(name, 0.5) * weight for name, weight in weights.items())
        
    return total_score, score_breakdown, passed, failed

def resolve_candidates(
    source_bbox: tuple[float, float, float, float] | None,
    candidates: list[dict[str, Any]],
    relation_type: str,
    transform: Any = None,
    views: list[Any] | None = None,
    table_bboxes: list[tuple[float, float, float, float]] | None = None,
    max_distance: float = 120.0,
    discipline_match_func: Any = None,
    revision_match_func: Any = None,
    leader_line_func: Any = None,
    typography_match_func: Any = None,
    legend_match_func: Any = None,
    schedule_match_func: Any = None,
    source_confidence: float = 1.0,
) -> tuple[Optional[dict[str, Any]], ResolutionState, list[ScoredCandidate]]:
    scored: list[ScoredCandidate] = []
    
    for cand in candidates:
        target_bbox = cand.get("bbox")
        target_node_id = cand.get("node_id", "")
        target_confidence = cand.get("confidence", 1.0)
        
        d_match = discipline_match_func(cand) if discipline_match_func else True
        r_match = revision_match_func(cand) if revision_match_func else True
        has_ll = leader_line_func(cand) if leader_line_func else False
        t_match = typography_match_func(cand) if typography_match_func else True
        leg_match = legend_match_func(cand) if legend_match_func else True
        sch_match = schedule_match_func(cand) if schedule_match_func else True
        
        score, breakdown, passed, failed = score_constraints(
            source_bbox=source_bbox,
            candidate_bbox=target_bbox,
            relation_type=relation_type,
            transform=transform,
            views=views,
            table_bboxes=table_bboxes,
            max_distance=max_distance,
            discipline_match=d_match,
            revision_match=r_match,
            has_leader_line=has_ll,
            typography_match=t_match,
            legend_match=leg_match,
            schedule_match=sch_match,
            source_confidence=source_confidence,
            target_confidence=target_confidence
        )
        
        calibrated_score = score
        calibrated_score = round(calibrated_score * min(source_confidence, target_confidence), 4)
        
        calibration = {
            "ocr_score": round(source_confidence, 4),
            "detector_score": round(target_confidence, 4),
            "geometry_score": round(breakdown.get("distance", 1.0), 4),
            "legend_score": 1.0 if leg_match else 0.5,
            "schedule_score": 1.0 if sch_match else 0.5,
            "consistency_score": 1.0 if r_match else 0.5,
            "calibrated_score": calibrated_score
        }
        
        scored.append(ScoredCandidate(
            candidate_id=cand.get("candidate_id", target_node_id),
            target_node_id=target_node_id,
            score=calibrated_score,
            confidence_calibration=calibration,
            passed_constraints=passed,
            failed_constraints=failed,
            score_breakdown=breakdown
        ))
        
    scored.sort(key=lambda c: c.score, reverse=True)
    valid_scored = [c for c in scored if c.score > 0.0]
    
    if not valid_scored:
        return None, "rejected", scored
        
    best = valid_scored[0]
    best_cand_dict = next(c for c in candidates if c.get("node_id", "") == best.target_node_id)
    
    if len(valid_scored) > 1:
        runner_up = valid_scored[1]
        if abs(best.score - runner_up.score) <= 0.05:
            # Tie makes it ambiguous
            return best_cand_dict, "ambiguous", scored
            
    is_human = best_cand_dict.get("status") == "human_verified"
    state: ResolutionState = "human_verified" if is_human else "accepted" if best.score >= 0.7 else "validated" if best.score >= 0.4 else "proposed"
    
    return best_cand_dict, state, scored
