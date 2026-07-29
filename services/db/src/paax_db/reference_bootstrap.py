"""paax_db.reference_bootstrap — Idempotent PLHUT bootstrap production service."""
from __future__ import annotations

import hashlib
import json
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from paax_db import models
from paax_db.project_graph_repository import build_and_activate_snapshot

import importlib.util

repo_root = Path(__file__).resolve().parents[4]
DrawingEvidenceSheet = None
synthesize_project_graph = None


import sys

def _get_drawing_evidence_sheet():
    global DrawingEvidenceSheet
    if DrawingEvidenceSheet is not None:
        return DrawingEvidenceSheet
    di_src = repo_root / "services" / "document-intelligence"
    if di_src.is_dir() and str(di_src) not in sys.path:
        sys.path.insert(0, str(di_src))
    try:
        from app.transcription.models import DrawingEvidenceSheet as DES
        DrawingEvidenceSheet = DES
    except Exception:
        DrawingEvidenceSheet = None
    return DrawingEvidenceSheet


def _get_synthesize_project_graph():
    global synthesize_project_graph
    if synthesize_project_graph is not None:
        return synthesize_project_graph
    di_src = repo_root / "services" / "document-intelligence"
    if di_src.is_dir() and str(di_src) not in sys.path:
        sys.path.insert(0, str(di_src))
    try:
        from app.project_graph.synthesis import synthesize_project_graph as SPG
        synthesize_project_graph = SPG
    except Exception:
        synthesize_project_graph = None
    return synthesize_project_graph


def _clean_properties(props):
    if not props:
        return {}
    if hasattr(props, "model_dump"):
        return props.model_dump(mode="json")
    if isinstance(props, dict):
        res = {}
        for k, v in props.items():
            if hasattr(v, "model_dump"):
                res[k] = v.model_dump(mode="json")
            elif isinstance(v, dict):
                res[k] = _clean_properties(v)
            elif isinstance(v, (list, tuple)):
                res[k] = [_clean_properties(x) if hasattr(x, "model_dump") else x for x in v]
            else:
                res[k] = v
        return res
    return {}

def _node_to_dict(n):
    ntype = getattr(n, "type", "element")
    lbl = getattr(n, "label", getattr(n, "class_id", ""))
    return {
        "node_id": getattr(n, "node_id", ""),
        "type": ntype,
        "node_type": getattr(n, "node_type", ntype),
        "class_id": getattr(n, "class_id", ntype),
        "label": lbl,
        "canonical_name": getattr(n, "canonical_name", lbl or ntype),
        "normalized_name": getattr(n, "normalized_name", (lbl or ntype).lower()),
        "discipline": getattr(n, "discipline", "civil"),
        "verification_status": getattr(n, "verification_status", "verified"),
        "confidence": getattr(n, "confidence", 0.95),
        "properties": _clean_properties(getattr(n, "properties", {})),
        "context_refs": getattr(n, "context_refs", getattr(n, "evidence_refs", [])),
        "semantic_hash": getattr(n, "semantic_hash", ""),
    }

def _edge_to_dict(e):
    src = getattr(e, "source", getattr(e, "source_node_id", getattr(e, "source_id", "")))
    tgt = getattr(e, "target", getattr(e, "target_node_id", getattr(e, "target_id", "")))
    rel = getattr(e, "relation", getattr(e, "relation_type", "relates_to"))
    return {
        "edge_id": getattr(e, "edge_id", ""),
        "source_id": src,
        "source_node_id": src,
        "target_id": tgt,
        "target_node_id": tgt,
        "relation_type": rel,
        "relation": rel,
        "confidence_class": getattr(e, "confidence_class", "high"),
        "confidence": getattr(e, "confidence", 0.95),
        "properties": _clean_properties(getattr(e, "properties", {})),
        "context_refs": getattr(e, "context_refs", getattr(e, "evidence_refs", [])),
        "semantic_hash": getattr(e, "semantic_hash", ""),
    }

def _ref_key_and_dict(ref, count):
    if isinstance(ref, str):
        return f"str::{ref}", {
            "evidence_id": f"ev-{count+1}",
            "document_id": ref,
            "page_index": 0,
            "source_artifact": "dem",
            "kind": "dem",
            "raw_text": "",
            "zone_id": "z1",
            "sheet_id": "",
            "bbox": [],
            "caption": "",
        }
    if isinstance(ref, dict):
        sa = ref.get("source_artifact", "dem")
        doc_id = ref.get("document_id", "")
        page_idx = ref.get("page_index", 0)
        zone_id = ref.get("zone_id", "")
        key = f"{sa}::{doc_id}::{page_idx}::{zone_id}"
        return key, {
            "evidence_id": f"ev-{count+1}",
            "document_id": doc_id,
            "page_index": page_idx,
            "source_artifact": sa,
            "kind": ref.get("kind", sa),
            "raw_text": ref.get("raw_text", ref.get("caption", "")),
            "zone_id": zone_id,
            "sheet_id": ref.get("sheet_id", ""),
            "bbox": ref.get("bbox", []),
            "caption": ref.get("caption", ""),
        }
    sa = getattr(ref, "source_artifact", "dem")
    doc_id = getattr(ref, "document_id", "")
    page_idx = getattr(ref, "page_index", 0)
    zone_id = getattr(ref, "zone_id", "")
    key = f"{sa}::{doc_id}::{page_idx}::{zone_id}"
    return key, {
        "evidence_id": f"ev-{count+1}",
        "document_id": doc_id,
        "page_index": page_idx,
        "source_artifact": sa,
        "kind": getattr(ref, "kind", sa),
        "raw_text": getattr(ref, "raw_text", getattr(ref, "caption", "")),
        "zone_id": zone_id,
        "sheet_id": getattr(ref, "sheet_id", ""),
        "bbox": getattr(ref, "bbox", []),
        "caption": getattr(ref, "caption", ""),
    }

def _evidence_items(snapshot):
    ev = {}
    for node in snapshot.nodes:
        refs = getattr(node, "context_refs", getattr(node, "evidence_refs", []))
        for ref in refs:
            key, item = _ref_key_and_dict(ref, len(ev))
            if key not in ev:
                ev[key] = item
    for edge in snapshot.edges:
        refs = getattr(edge, "context_refs", getattr(edge, "evidence_refs", []))
        for ref in refs:
            key, item = _ref_key_and_dict(ref, len(ev))
            if key not in ev:
                ev[key] = item
    return ev

def _node_evidence_items(snapshot, ev_keys):
    links = []
    ev_map = {k: f"ev-{i+1}" for i, k in enumerate(ev_keys)}
    for node in snapshot.nodes:
        refs = getattr(node, "context_refs", getattr(node, "evidence_refs", []))
        for ref in refs:
            key, _ = _ref_key_and_dict(ref, 0)
            if key in ev_map:
                links.append({
                    "node_id": node.node_id,
                    "evidence_id": ev_map[key],
                    "confidence": 0.95,
                    "role": "supporting",
                    "explanation": "",
                })
    return links


def load_manifest(manifest_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    source_pdf = manifest_path.parent / manifest["source_document"]["path"]
    
    if not source_pdf.exists():
        raise RuntimeError(f"Reference source PDF missing: {source_pdf}")
        
    actual_hash = hashlib.sha256(source_pdf.read_bytes()).hexdigest()
    if actual_hash != manifest["source_document"]["sha256"]:
        raise RuntimeError("Reference source PDF checksum does not match project manifest")
        
    return manifest


async def bootstrap_reference_project(
    session: AsyncSession,
    manifest_path: Path,
    actor_id: str,
    reference_key: str = "plhut-surakarta-2024",
    is_default: bool = True,
) -> dict:
    """Bootstrap a reference project idempotently from a manifest.
    
    Returns a ledger of what was repaired/created.
    """
    manifest = load_manifest(manifest_path)
    fixture_dir = manifest_path.parent
    if manifest.get("dem_fixture_dir"):
        rel_dir = manifest["dem_fixture_dir"].split("/")[-1]
        if (fixture_dir / rel_dir).is_dir():
            fixture_dir = fixture_dir / rel_dir
    elif (fixture_dir / "dem-pages").is_dir():
        fixture_dir = fixture_dir / "dem-pages"
    
    project_id = manifest["project_id"]
    fixture_version = manifest["fixture_version"]
    run_id = uuid.uuid5(uuid.NAMESPACE_URL, f"PAAX-REFERENCE-{reference_key.upper()}-{fixture_version}")
    fixture_hash = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    
    existing_ledger = await session.get(models.BootstrapLedger, {"reference_key": reference_key, "fixture_version": fixture_version})
    if existing_ledger and existing_ledger.fixture_hash == fixture_hash:
        return existing_ledger.result

    SheetModel = _get_drawing_evidence_sheet()
    synthesizer = _get_synthesize_project_graph()

    sheets = [
        SheetModel.model_validate_json(path.read_text(encoding="utf-8"))
        for path in sorted(fixture_dir.glob("page-*.json"))
    ]
    if len(sheets) != manifest["expected"]["dem_pages"]:
        raise RuntimeError(f"Expected {manifest['expected']['dem_pages']} reference DEM pages, found {len(sheets)}")

    result = {"project_created": False, "dem_repaired": 0, "snapshot_created": False, "reference_marked": False}
    
    project = await session.get(models.Project, project_id)
    if project is None:
        project = models.Project(
            id=project_id,
            owner_id=actor_id,
            name=manifest["name"],
            status="active",
            description=manifest["description"],
            location=manifest.get("location", ""),
            type=manifest.get("type", ""),
            progress=0,
            warnings=0,
            health=100,
            last_activity="Reference baseline loaded",
        )
        session.add(project)
        result["project_created"] = True
        
    member = await session.get(models.ProjectMember, {"project_id": project_id, "user_id": actor_id})
    if member is None:
        session.add(models.ProjectMember(project_id=project_id, user_id=actor_id, role="owner"))

    ref = await session.get(models.ProjectReference, project_id)
    if ref is None:
        session.add(models.ProjectReference(project_id=project_id, reference_key=reference_key, is_default=is_default))
        result["reference_marked"] = True

    run = await session.get(models.DemRun, run_id)
    if run is None:
        first = sheets[0]
        run = models.DemRun(
            id=run_id,
            project_id=project_id,
            document_id=first.document_id,
            document_hash=first.source.document_hash,
            file_name=first.source.file_name,
            total_pages=len(sheets),
            status="synthesis_complete",
            provider=first.generation.provider,
            prompt_version=first.generation.prompt_version,
            artifact_key=f"reference://{reference_key}",
        )
        session.add(run)

    existing_pages = set((await session.execute(
        select(models.DemPage.page_index).where(models.DemPage.run_id == run_id)
    )).scalars().all())
    
    for sheet in sheets:
        if sheet.source.page_index in existing_pages:
            continue
        session.add(models.DemPage(
            run_id=run_id,
            page_index=sheet.source.page_index,
            status="completed",
            attempt_count=1,
            input_hash=sheet.source.document_hash,
            result=sheet.model_dump(mode="json"),
        ))
        result["dem_repaired"] += 1
        
    await session.flush()

    active_count = int((await session.execute(select(func.count()).select_from(models.ProjectGraphSnapshot).where(
        models.ProjectGraphSnapshot.project_id == project_id,
        models.ProjectGraphSnapshot.status == "active",
    ))).scalar_one())
    
    if active_count == 0:
        snapshot = synthesizer(sheets).snapshot
        evidence_map = _evidence_items(snapshot)
        await build_and_activate_snapshot(
            session,
            project_id=project_id,
            snapshot_id=snapshot.snapshot_id,
            schema_version=snapshot.schema_version,
            source_manifest_hash=manifest["source_document"]["sha256"],
            generation_metadata={
                "source": "reference_bootstrap",
                "run_id": str(run_id),
                "project_manifest": str(manifest_path.relative_to(manifest_path.parents[3])),
            },
            nodes=[_node_to_dict(n) for n in snapshot.nodes],
            edges=[_edge_to_dict(e) for e in snapshot.edges],
            evidence=list(evidence_map.values()),
            node_evidence=_node_evidence_items(snapshot, set(evidence_map)),
            edge_evidence=[], aliases=[], communities=[], summary_views=[],
        )
        result["snapshot_created"] = True
        result["graph_nodes"] = len(snapshot.nodes)
        result["graph_edges"] = len(snapshot.edges)
        
    if not existing_ledger:
        session.add(models.BootstrapLedger(
            reference_key=reference_key,
            fixture_version=fixture_version,
            fixture_hash=fixture_hash,
            result=result,
        ))
        
    return result
