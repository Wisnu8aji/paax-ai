"""Namespace a page's raw model-given evidence ids so the same local id
(e.g. "ev-001") produced independently by two different pages of the same
run can never collide once merged into one project graph.

Without this, project_graph synthesis' global `seen_ids` set silently drops
the second page's evidence on a collision (first-wins) and any node/edge
that legitimately referenced the second page's "ev-001" gets bound to the
first page's evidence instead -- wrong evidence, wrong location, no error.

Applied once, right after the vision model's raw output is parsed and
validated (page_loop.py), before any other code sees the evidence ids, so
every consumer (DB persistence, project_graph synthesis, review UI) only
ever sees already-unique ids.
"""
from __future__ import annotations

from app.transcription.models import DemModelOutput


def namespace_evidence_ids(model_output: DemModelOutput, *, run_id: str, page_index: int) -> DemModelOutput:
    """Return a copy of model_output with every evidence_id/evidence_refs
    entry rewritten to f"{run_id}:{page_index}:{local_id}"."""
    local_ids = {item.evidence_id for item in model_output.evidence}
    if not local_ids:
        return model_output

    def rewrite(local_id: str) -> str:
        return f"{run_id}:{page_index}:{local_id}" if local_id in local_ids else local_id

    payload = model_output.model_dump(mode="json")
    _rewrite_tree(payload, rewrite)
    return DemModelOutput.model_validate(payload)


def _rewrite_tree(node: object, rewrite) -> None:
    if isinstance(node, dict):
        for key, value in node.items():
            if key in ("evidence_id", "evidence_refs", "missing_evidence_refs"):
                node[key] = _rewrite_value(value, rewrite)
            else:
                _rewrite_tree(value, rewrite)
    elif isinstance(node, list):
        for item in node:
            _rewrite_tree(item, rewrite)


def _rewrite_value(value: object, rewrite) -> object:
    if isinstance(value, str):
        return rewrite(value)
    if isinstance(value, list):
        return [rewrite(item) if isinstance(item, str) else item for item in value]
    return value
