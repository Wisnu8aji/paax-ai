import os
import traceback
import hashlib
import uuid
from pydantic import ValidationError

from app.perception.bbox_canonicalize import BboxQuarantined, canonicalize_bbox
from app.transcription.db_client import DemDbClient
from app.transcription.models import DrawingEvidenceSheet
from app.transcription.typed_observations import TypedValidationMode, adapt_dem_observations
from app.project_graph.synthesis import synthesize_project_graph

# Target 5 (final remediation wave): explicit mode boundary for the typed-DEM
# v2 evidence-by-status contract. Defaults to "legacy_compatibility" so
# already-accepted production sheets are not regressed by this change --
# this default is the CONSERVATIVE choice for existing data, not a
# statement that compatibility mode is the intended long-term posture. Set
# DEM_TYPED_VALIDATION_MODE=strict to require every sheet synthesized to
# satisfy the v2 contract; failing sheets are then quarantined (their
# affected nodes/edges are excluded from retrieval eligibility) instead of
# only being recorded as an audit note.
def _typed_validation_mode() -> TypedValidationMode:
    value = os.environ.get("DEM_TYPED_VALIDATION_MODE", "legacy_compatibility").strip().lower()
    return "strict" if value == "strict" else "legacy_compatibility"


def _typed_observation_audit(sheets, *, mode: TypedValidationMode | None = None):
    """Validate every sheet's observations against the typed-DEM-v2 contract.

    In "legacy_compatibility" mode (the default), a validation failure is
    recorded here as an audit signal only -- synthesis proceeds unaffected,
    preserving today's behavior for sheets captured before the v2 contract
    existed. In "strict" mode, sheets are still recorded here, but the
    caller (synthesize_and_post_snapshot_task) uses failed_sheet_keys below
    to quarantine any node/edge backed only by a failing sheet's evidence,
    exactly like the missing-evidence-id quarantine a few lines below this
    call site."""
    if mode is None:
        mode = _typed_validation_mode()
    passed = 0
    failed: list[dict] = []
    failed_sheet_keys: set[tuple[str, int]] = set()
    for sheet in sheets:
        try:
            adapt_dem_observations(sheet.observations, mode="strict")
            passed += 1
        except ValidationError as exc:
            failed.append({
                "page_index": sheet.source.page_index,
                "sheet_id": sheet.sheet_identity.sheet_number.value,
                "errors": exc.errors(include_url=False, include_context=False),
            })
            failed_sheet_keys.add((sheet.sheet_identity.sheet_number.value, sheet.source.page_index))
    return {
        "mode": mode,
        "sheets_passed": passed,
        "sheets_failed": len(failed),
        "failures": failed,
        "failed_sheet_keys": sorted(failed_sheet_keys),
    }


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
        # Persist the full versioned resolver payload, not a hand-picked
        # subset -- candidate/rejection/score-breakdown/constraint data is
        # exactly what a human reviewer needs to trust or contest an
        # inferred edge, and a manual field list silently drops new
        # EdgeResolver fields whenever the model grows (see P1-5).
        props["resolver"] = edge.resolver.model_dump(exclude_none=True)
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

        # Resolve the project's currently-effective sheet revisions so evidence
        # can be tagged with a real revision_id instead of guessing/omitting it.
        # (document_id, sheet_id) is the same key active_sheet_revision uses in
        # services/db; sheet_id is not a separate DEM concept yet, so the sheet
        # number text already used as sheet_id below (see evidence_list) is the
        # matching key here too.
        active_revisions = await db_client.get_active_sheet_revisions(project_id)
        revision_by_sheet: dict[tuple[str, str], str] = {
            (rev["document_id"], rev["sheet_id"]): rev["revision_id"] for rev in active_revisions
        }
        effective_sheet_revision_ids = sorted({rev["revision_id"] for rev in active_revisions})

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
        seen_ids_by_page: dict[str, int] = {}
        for sheet in sheets:
            for ev in sheet.evidence:
                if ev.evidence_id in seen_ids:
                    owning_page = seen_ids_by_page.get(ev.evidence_id)
                    if owning_page is not None and owning_page != sheet.source.page_index:
                        # Evidence ids are namespaced per-page at extraction time
                        # (see evidence_namespacing.py). Seeing the same id again
                        # from a *different* page means the namespacing was
                        # bypassed or two runs collided -- this must never
                        # silently first-wins-drop the second page's evidence.
                        raise ValueError(
                            f"duplicate evidence_id '{ev.evidence_id}' across pages "
                            f"{owning_page} and {sheet.source.page_index} in run {run_id}"
                        )
                    continue
                seen_ids.add(ev.evidence_id)
                seen_ids_by_page[ev.evidence_id] = sheet.source.page_index

                dem_page_id = dem_page_map.get(sheet.source.page_index)
                bbox = list(ev.bbox) if ev.bbox else None
                extractor = {
                    "provider": sheet.generation.provider,
                    "model": sheet.generation.model_alias,
                    "version": "1.0",
                    "prompt_version": sheet.generation.prompt_version
                }

                # bbox_space is a stated fact (EvidenceItem.bbox_space, default
                # "normalized" matching the current real provider contract),
                # never guessed from whether page_transform happens to be
                # present -- that guess is exactly the bug a prior audit found
                # (an already-normalized bbox re-transformed as if it were a
                # PDF-point coordinate, corrupting every evidence citation).
                # An unrecognized/unsupported space is quarantined (bbox_
                # normalized left None) rather than silently trusted -- Target
                # 5 excludes quarantined evidence from authoritative retrieval.
                bbox_normalized = None
                bbox_quarantine_reason = None
                coordinate_schema_version = None
                transform_version = None
                if bbox:
                    try:
                        canonical = canonicalize_bbox(
                            tuple(bbox), bbox_space=ev.bbox_space,
                            source_width=sheet.source.width_px, source_height=sheet.source.height_px,
                            page_transform=sheet.source.page_transform,
                        )
                        bbox_normalized = list(canonical.bbox_normalized)
                        coordinate_schema_version = canonical.coordinate_schema_version
                        transform_version = canonical.transform_version
                    except BboxQuarantined as exc:
                        bbox_quarantine_reason = str(exc)

                sheet_id = sheet.sheet_identity.sheet_number.value
                evidence_list.append({
                    "evidence_id": ev.evidence_id,
                    "project_id": sheet.project_id,
                    "document_id": sheet.document_id,
                    "revision_id": revision_by_sheet.get((sheet.document_id, sheet_id)),
                    "run_id": sheet.run_id,
                    "dem_page_id": dem_page_id,
                    "page_index": sheet.source.page_index,
                    "sheet_id": sheet_id,
                    "view_id": None,
                    "zone_id": None,
                    "modality": "ocr",
                    "kind": ev.kind,
                    "raw_content": ev.raw,
                    "raw_text": ev.raw,
                    "normalized_content": ev.raw.lower().strip() if ev.raw else "",
                    "bbox": bbox,
                    "bbox_source": bbox,
                    "bbox_normalized": bbox_normalized,
                    "bbox_space": ev.bbox_space,
                    "bbox_quarantine_reason": bbox_quarantine_reason,
                    "coordinate_schema_version": coordinate_schema_version,
                    "transform_version": transform_version,
                    "polygon_source": [],
                    "polygon_normalized": [],
                    "confidence": float(ev.confidence),
                    "extractor": extractor,
                    "source_document_hash": sheet.source.document_hash,
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

        # 3. Missing referenced evidence must never be fabricated. A node/edge/
        # property citing an evidence_id that was never produced by any sheet
        # is a real integrity gap, not something a synthetic "fallback" evidence
        # row can paper over -- that would make a dangling reference look
        # structurally valid without any source backing it. Quarantine instead:
        # collect the missing ids so callers can downgrade affected facts to
        # review, and never add them to evidence_list/seen_ids.
        missing_evidence_ids = {ev_id for ev_id in referenced_evidence_ids if ev_id not in seen_ids}
        if missing_evidence_ids:
            print(f"Synthesis quarantine: {len(missing_evidence_ids)} referenced evidence id(s) have no source evidence: {sorted(missing_evidence_ids)}")
            for node in snapshot.nodes:
                node_evidence_refs = {ev_id for ref in node.source_refs for ev_id in ref.evidence_refs}
                node_evidence_refs.update(ev_id for prop in node.properties.values() for ev_id in prop.evidence_refs)
                if node_evidence_refs & missing_evidence_ids:
                    node.verification_status = "ambiguous"
            for edge in snapshot.edges:
                if set(edge.evidence_refs) & missing_evidence_ids:
                    edge.confidence_class = "AMBIGUOUS"

        # 3b. Typed-DEM v2 contract (Target 5, final remediation wave). In
        # "strict" mode a sheet failing the evidence-by-status contract is a
        # real quarantine signal: every node/edge whose evidence traces back
        # to that (sheet_id, page_index) is downgraded exactly like the
        # missing-evidence-id case just above. "legacy_compatibility" (the
        # default) never touches verification_status/confidence_class here --
        # it only records the audit below, preserving today's behavior for
        # sheets captured before the v2 contract existed.
        typed_observation_audit = _typed_observation_audit(sheets)
        if typed_observation_audit["mode"] == "strict" and typed_observation_audit["failed_sheet_keys"]:
            failed_keys = {tuple(key) for key in typed_observation_audit["failed_sheet_keys"]}
            evidence_id_to_sheet_key = {
                item["evidence_id"]: (item["sheet_id"], item["page_index"]) for item in evidence_list
            }
            failed_evidence_ids = {
                ev_id for ev_id, key in evidence_id_to_sheet_key.items() if key in failed_keys
            }
            if failed_evidence_ids:
                print(
                    f"Synthesis quarantine (strict typed-DEM): {len(failed_evidence_ids)} evidence id(s) "
                    f"from {len(failed_keys)} sheet(s) failed the v2 evidence-by-status contract"
                )
                for node in snapshot.nodes:
                    node_evidence_refs = {ev_id for ref in node.source_refs for ev_id in ref.evidence_refs}
                    node_evidence_refs.update(ev_id for prop in node.properties.values() for ev_id in prop.evidence_refs)
                    if node_evidence_refs & failed_evidence_ids:
                        node.verification_status = "ambiguous"
                for edge in snapshot.edges:
                    if set(edge.evidence_refs) & failed_evidence_ids:
                        edge.confidence_class = "AMBIGUOUS"

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
            "generation_metadata": {
                "source": "synthesize_and_post_snapshot_task",
                "run_id": run_id,
                "typed_observation_audit": typed_observation_audit,
            },
            "effective_sheet_revision_ids": effective_sheet_revision_ids,
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
