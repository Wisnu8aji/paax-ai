"""paax_db.reference_bootstrap — Idempotent PLHUT bootstrap production service."""
from __future__ import annotations

import hashlib
import json
import uuid
from pathlib import Path
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from paax_db import models
from paax_db.project_graph_repository import build_and_activate_snapshot

# Add document-intelligence to path to import schemas and synthesis logic
_doc_intel_path = Path(__file__).resolve().parents[4] / "services" / "document-intelligence"
if str(_doc_intel_path) not in sys.path:
    sys.path.append(str(_doc_intel_path))

from app.transcription.models import DrawingEvidenceSheet
from app.project_graph.synthesis import synthesize_project_graph


def _node_to_dict(n):
    return {
        "node_id": n.node_id,
        "type": n.type,
        "class_id": n.class_id,
        "label": n.label,
        "properties": n.properties,
        "context_refs": n.context_refs,
        "semantic_hash": n.semantic_hash,
    }

def _edge_to_dict(e):
    return {
        "edge_id": e.edge_id,
        "source_id": e.source_id,
        "target_id": e.target_id,
        "relation_type": e.relation_type,
        "properties": e.properties,
        "context_refs": e.context_refs,
        "semantic_hash": e.semantic_hash,
    }

def _evidence_items(snapshot):
    ev = {}
    for node in snapshot.nodes:
        for ref in node.context_refs:
            key = f"{ref.source_artifact}::{ref.document_id}::{ref.page_index}::{ref.zone_id}"
            if key not in ev:
                ev[key] = {
                    "evidence_id": f"ev-{len(ev)+1}",
                    "document_id": ref.document_id,
                    "page_index": ref.page_index,
                    "source_artifact": ref.source_artifact,
                    "zone_id": ref.zone_id,
                    "sheet_id": ref.sheet_id,
                    "bbox": ref.bbox,
                    "caption": "",
                }
    for edge in snapshot.edges:
        for ref in edge.context_refs:
            key = f"{ref.source_artifact}::{ref.document_id}::{ref.page_index}::{ref.zone_id}"
            if key not in ev:
                ev[key] = {
                    "evidence_id": f"ev-{len(ev)+1}",
                    "document_id": ref.document_id,
                    "page_index": ref.page_index,
                    "source_artifact": ref.source_artifact,
                    "zone_id": ref.zone_id,
                    "sheet_id": ref.sheet_id,
                    "bbox": ref.bbox,
                    "caption": "",
                }
    return ev

def _node_evidence_items(snapshot, ev_keys):
    links = []
    ev_map = {k: f"ev-{i+1}" for i, k in enumerate(ev_keys)}
    for node in snapshot.nodes:
        for ref in node.context_refs:
            key = f"{ref.source_artifact}::{ref.document_id}::{ref.page_index}::{ref.zone_id}"
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
    
    project_id = manifest["project_id"]
    fixture_version = manifest["fixture_version"]
    run_id = uuid.uuid5(uuid.NAMESPACE_URL, f"PAAX-REFERENCE-{reference_key.upper()}-{fixture_version}")
    fixture_hash = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    
    existing_ledger = await session.get(models.BootstrapLedger, {"reference_key": reference_key, "fixture_version": fixture_version})
    if existing_ledger and existing_ledger.fixture_hash == fixture_hash:
        return existing_ledger.result

    sheets = [
        DrawingEvidenceSheet.model_validate_json(path.read_text(encoding="utf-8"))
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
        snapshot = synthesize_project_graph(sheets).snapshot
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
