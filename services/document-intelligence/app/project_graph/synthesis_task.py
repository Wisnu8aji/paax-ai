import traceback
import httpx
from app.transcription.db_client import DemDbClient
from app.transcription.models import DrawingEvidenceSheet
from app.project_graph.synthesis import synthesize_project_graph


def _node_to_dict(node):
    return {
        "node_id": node.node_id,
        "node_type": node.type,
        "canonical_name": node.canonical_name,
        "normalized_name": node.canonical_name.lower().strip(),
        "discipline": node.discipline,
        "level_id": None,
        "verification_status": node.verification_status,
        "confidence": node.confidence,
        "properties": {k: v.value for k, v in node.properties.items()},
        "search_text": (node.canonical_name + " " + " ".join(node.aliases)).lower(),
    }


def _edge_to_dict(edge):
    return {
        "edge_id": edge.edge_id,
        "source_node_id": edge.source,
        "target_node_id": edge.target,
        "relation": edge.relation,
        "confidence_class": edge.confidence_class,
        "confidence": edge.confidence,
        "properties": {},
    }


def _evidence_items(snapshot):
    seen = {}
    for node in snapshot.nodes:
        for ref in node.source_refs:
            for ev_id in ref.evidence_refs:
                seen[ev_id] = {
                    "evidence_id": ev_id,
                    "document_id": ref.document_id,
                    "page_index": ref.page_index,
                    "sheet_id": ref.sheet_id,
                    "kind": "text",
                    "raw_text": ev_id,
                    "bbox": None,
                    "source_dem_id": None,
                }
    return seen


def _node_evidence_items(snapshot, evidence_ids):
    seen = set()
    items = []
    for node in snapshot.nodes:
        for ref in node.source_refs:
            for ev_id in ref.evidence_refs:
                key = (node.node_id, ev_id)
                if ev_id in evidence_ids and key not in seen:
                    seen.add(key)
                    items.append({"node_id": node.node_id, "evidence_id": ev_id, "role": "primary"})
    return items


async def synthesize_and_post_snapshot_task(run_id: str, project_id: str, run_status: dict, db_client: DemDbClient):
    try:
        sheets = []
        for page in run_status.get("pages", []):
            if page["status"] == "complete" and page.get("result"):
                sheets.append(DrawingEvidenceSheet.model_validate(page["result"]))
        
        if not sheets:
            await db_client.update_run_status(run_id, "synthesis_failed")
            return
            
        result = synthesize_project_graph(sheets)
        snapshot = result.snapshot
        
        evidence_map = _evidence_items(snapshot)
        payload = {
            "snapshot_id": snapshot.snapshot_id,
            "schema_version": snapshot.schema_version,
            "source_manifest_hash": f"run-{run_id}",
            "generation_metadata": {"source": "synthesize_and_post_snapshot_task", "run_id": run_id},
            "nodes": [_node_to_dict(n) for n in snapshot.nodes],
            "edges": [_edge_to_dict(e) for e in snapshot.edges],
            "evidence": list(evidence_map.values()),
            "node_evidence": _node_evidence_items(snapshot, set(evidence_map)),
            "edge_evidence": [],
            "aliases": [],
            "communities": [],
        }

        async with await db_client._client() as client:
            headers = db_client._headers()
            headers["X-User-Id"] = "service-account"
            r = await client.post(
                f"/projects/{project_id}/project-graph/snapshots",
                json=payload,
                headers=headers,
            )
            r.raise_for_status()
            
        await db_client.update_run_status(run_id, "synthesis_complete")
    except Exception as e:
        print(f"Synthesis failed: {e}")
        traceback.print_exc()
        await db_client.update_run_status(run_id, "synthesis_failed")
