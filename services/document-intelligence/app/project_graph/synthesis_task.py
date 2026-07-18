import traceback
import hashlib
import uuid
from app.transcription.db_client import DemDbClient
from app.transcription.models import DrawingEvidenceSheet
from app.project_graph.synthesis import synthesize_project_graph


def _node_to_dict(node, level_map):
    properties = {}
    for k, v in node.properties.items():
        properties[k] = {
            "value": v.value,
            "value_source": v.value_source,
            "evidence_refs": v.evidence_refs,
        }
    return {
        "node_id": node.node_id,
        "node_type": node.type,
        "canonical_name": node.canonical_name,
        "normalized_name": node.canonical_name.lower().strip(),
        "discipline": node.discipline,
        "level_id": level_map.get(node.node_id),
        "verification_status": node.verification_status,
        "confidence": node.confidence,
        "properties": properties,
        "search_text": (node.canonical_name + " " + " ".join(node.aliases)).lower(),
    }


def _edge_to_dict(edge):
    props = {}
    if edge.resolver:
        props["resolver"] = {
            "method": edge.resolver.method,
            "model": edge.resolver.model,
        }
    return {
        "edge_id": edge.edge_id,
        "source_node_id": edge.source,
        "target_node_id": edge.target,
        "relation": edge.relation,
        "confidence_class": edge.confidence_class,
        "confidence": edge.confidence,
        "properties": props,
    }


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


def _edge_evidence_items(snapshot, evidence_ids):
    seen = set()
    items = []
    for edge in snapshot.edges:
        for ev_id in edge.evidence_refs:
            key = (edge.edge_id, ev_id)
            if ev_id in evidence_ids and key not in seen:
                seen.add(key)
                items.append({"edge_id": edge.edge_id, "evidence_id": ev_id, "role": "primary"})
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
        
        # Build dem_page_id map
        dem_page_map = {}
        for page in run_status.get("pages", []):
            p_idx = page.get("page_index") if isinstance(page, dict) else getattr(page, "page_index", None)
            p_id = page.get("id") if isinstance(page, dict) else getattr(page, "id", None)
            if p_idx is not None and p_id is not None:
                dem_page_map[p_idx] = str(p_id)

        # 1. Map all evidence items
        evidence_list = []
        seen_ids = set()
        for sheet in sheets:
            for ev in sheet.evidence:
                if ev.evidence_id in seen_ids:
                    continue
                seen_ids.add(ev.evidence_id)
                
                dem_page_id = dem_page_map.get(sheet.source.page_index)
                bbox = list(ev.bbox) if ev.bbox else None
                extractor = {
                    "provider": sheet.generation.provider,
                    "model": sheet.generation.model_alias,
                    "version": "1.0",
                    "prompt_version": sheet.generation.prompt_version
                }
                
                evidence_list.append({
                    "evidence_id": ev.evidence_id,
                    "project_id": sheet.project_id,
                    "document_id": sheet.document_id,
                    "revision_id": getattr(sheet, "revision_id", None),
                    "run_id": sheet.run_id,
                    "dem_page_id": dem_page_id,
                    "page_index": sheet.source.page_index,
                    "sheet_id": sheet.sheet_identity.sheet_number.value,
                    "view_id": None,
                    "zone_id": None,
                    "modality": "ocr",
                    "kind": ev.kind,
                    "raw_content": ev.raw,
                    "raw_text": ev.raw,
                    "normalized_content": ev.raw.lower().strip() if ev.raw else "",
                    "bbox": bbox,
                    "bbox_source": bbox,
                    "bbox_normalized": bbox,
                    "polygon_source": [],
                    "polygon_normalized": [],
                    "confidence": float(ev.confidence),
                    "extractor": extractor,
                    "artifact_hash": sheet.source.document_hash,
                    "source_dem_id": dem_page_id,
                })

        # 2. Collect all referenced evidence IDs
        referenced_evidence_ids = set()
        ref_meta = {}
        for node in snapshot.nodes:
            for ref in node.source_refs:
                referenced_evidence_ids.update(ref.evidence_refs)
                for ev_id in ref.evidence_refs:
                    ref_meta[ev_id] = {
                        "document_id": ref.document_id,
                        "page_index": ref.page_index,
                        "sheet_id": ref.sheet_id,
                    }
            for prop in node.properties.values():
                referenced_evidence_ids.update(prop.evidence_refs)
        for edge in snapshot.edges:
            referenced_evidence_ids.update(edge.evidence_refs)

        # 3. Add fallbacks for missing referenced evidence items
        for ev_id in referenced_evidence_ids:
            if ev_id not in seen_ids:
                seen_ids.add(ev_id)
                meta = ref_meta.get(ev_id, {})
                doc_id = meta.get("document_id", sheets[0].document_id if sheets else "")
                page_idx = meta.get("page_index", sheets[0].source.page_index if sheets else 0)
                sheet_id = meta.get("sheet_id", sheets[0].sheet_identity.sheet_number.value if sheets else "")
                dem_page_id = dem_page_map.get(page_idx)

                evidence_list.append({
                    "evidence_id": ev_id,
                    "project_id": project_id,
                    "document_id": doc_id,
                    "revision_id": None,
                    "run_id": run_id,
                    "dem_page_id": dem_page_id,
                    "page_index": page_idx,
                    "sheet_id": sheet_id,
                    "view_id": None,
                    "zone_id": None,
                    "modality": "ocr",
                    "kind": "text",
                    "raw_content": ev_id,
                    "raw_text": ev_id,
                    "normalized_content": ev_id.lower().strip(),
                    "bbox": None,
                    "bbox_source": None,
                    "bbox_normalized": None,
                    "polygon_source": [],
                    "polygon_normalized": [],
                    "confidence": 0.5,
                    "extractor": {
                        "provider": "fallback",
                        "model": "unknown",
                        "version": "1.0",
                        "prompt_version": "unknown"
                    },
                    "artifact_hash": sheets[0].source.document_hash if sheets else "",
                    "source_dem_id": dem_page_id,
                })

        # 4. Level mapping
        level_map = {}
        for node in snapshot.nodes:
            if node.type == "level":
                level_map[node.node_id] = node.node_id
        for edge in snapshot.edges:
            if edge.relation == "LOCATED_ON" and edge.target in level_map:
                level_map[edge.source] = edge.target

        # 5. Aliases mapping
        seen_aliases = set()
        aliases_payload = []
        for node in snapshot.nodes:
            for alias_raw in node.aliases:
                alias_norm = alias_raw.lower().strip()
                if not alias_norm:
                    continue
                key = (alias_norm, alias_raw, node.node_id)
                if key not in seen_aliases:
                    seen_aliases.add(key)
                    aliases_payload.append({
                        "alias_normalized": alias_norm,
                        "alias_raw": alias_raw,
                        "node_id": node.node_id,
                        "alias_type": "synonym",
                        "confidence": float(node.confidence),
                    })

        # 6. Communities mapping
        communities_payload = []
        for comm in result.communities:
            communities_payload.append({
                "community_id": comm.community_id,
                "community_type": "connected_component",
                "name": comm.label,
                "summary": f"Connected component containing {len(comm.node_ids)} nodes and {len(comm.edge_ids)} edges.",
                "member_count": len(comm.node_ids)
            })

        # 7. Content-based source manifest hash
        doc_hashes = sorted({sheet.source.document_hash for sheet in sheets})
        combined_hash = hashlib.sha256("|".join(doc_hashes).encode("utf-8")).hexdigest()
        source_manifest_hash = f"sha256:{combined_hash}"

        payload = {
            "snapshot_id": snapshot.snapshot_id,
            "schema_version": snapshot.schema_version,
            "source_manifest_hash": source_manifest_hash,
            "generation_metadata": {"source": "synthesize_and_post_snapshot_task", "run_id": run_id},
            "nodes": [_node_to_dict(n, level_map) for n in snapshot.nodes],
            "edges": [_edge_to_dict(e) for e in snapshot.edges],
            "evidence": evidence_list,
            "node_evidence": _node_evidence_items(snapshot, seen_ids),
            "edge_evidence": _edge_evidence_items(snapshot, seen_ids),
            "aliases": aliases_payload,
            "communities": communities_payload,
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
