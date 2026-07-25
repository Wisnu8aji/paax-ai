"""Portable PAAX runtime with an idempotent PLHUT bootstrap.

Unlike the legacy live-test harness, this module NEVER deletes the database.
It creates or repairs the bundled PLHUT project, DEM pages, and PCKM snapshot
only when the corresponding artifact is absent. User reviews, calculations,
chat history, and additional projects survive every restart.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sys
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "services" / "document-intelligence"))
sys.path.insert(0, str(REPO_ROOT / "services" / "db" / "src"))

from fixture_paths import resolve_plhut_fixture_dir  # noqa: E402

PORTABLE_ACTOR_ID = os.environ.setdefault("PAAX_PORTABLE_ACTOR_ID", "paax-web")
MANIFEST_PATH = REPO_ROOT / "fixtures" / "plhut" / "project-manifest.json"
DATA_DIR = Path(os.environ.get("PAAX_PORTABLE_DATA_DIR", REPO_ROOT / "data" / "portable"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_FILE = Path(os.environ.get("PAAX_PORTABLE_DB_FILE", DATA_DIR / "paax-portable.db"))
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{DB_FILE}")
os.environ.setdefault("INTERNAL_SERVICE_KEY", "live-test-key")
os.environ.setdefault(
    "INTERNAL_SERVICE_SCOPES",
    "dem:read,dem:write,dem:delete,project_graph:synthesize,dem:authorize-actor",
)

from app.project_graph.synthesis import synthesize_project_graph  # noqa: E402
from app.transcription.models import DrawingEvidenceSheet  # noqa: E402
from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from paax_db import models  # noqa: E402
from paax_db.database import Base, get_db  # noqa: E402
from paax_db.main import app  # noqa: E402
from paax_db.project_graph_repository import build_and_activate_snapshot  # noqa: E402

import uvicorn  # noqa: E402

FIXTURE_DIR = resolve_plhut_fixture_dir(REPO_ROOT)

engine = create_async_engine(
    f"sqlite+aiosqlite:///{DB_FILE}",
    connect_args={"check_same_thread": False},
)
Session = async_sessionmaker(engine, expire_on_commit=False)


async def _override_get_db():
    async with Session() as session:
        yield session


app.dependency_overrides[get_db] = _override_get_db
app.state.repo_root = REPO_ROOT
app.state.portable_manifest_path = MANIFEST_PATH


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


def _load_manifest() -> dict:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    source = REPO_ROOT / manifest["source_document"]["path"]
    if not source.exists():
        raise RuntimeError(f"Bundled PLHUT source PDF missing: {source}")
    actual_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    if actual_hash != manifest["source_document"]["sha256"]:
        raise RuntimeError("Bundled PLHUT PDF checksum does not match project manifest")
    return manifest


async def bootstrap_plhut() -> dict:
    manifest = _load_manifest()
    project_id = manifest["project_id"]
    run_id = uuid.uuid5(uuid.NAMESPACE_URL, "PAAX-PLHUT-88PG-PORTABLE-V2")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sheets = [
        DrawingEvidenceSheet.model_validate_json(path.read_text(encoding="utf-8"))
        for path in sorted(FIXTURE_DIR.glob("page-*.json"))
    ]
    if len(sheets) != manifest["expected"]["dem_pages"]:
        raise RuntimeError(f"Expected 88 PLHUT DEM pages, found {len(sheets)}")

    result = {"project_created": False, "dem_repaired": 0, "snapshot_created": False}
    async with Session() as session:
        project = await session.get(models.Project, project_id)
        if project is None:
            project = models.Project(
                id=project_id,
                owner_id=PORTABLE_ACTOR_ID,
                name=manifest["name"],
                status="active",
                description=manifest["description"],
                location="Surakarta",
                type="Gedung Pelayanan Publik",
                progress=0,
                warnings=0,
                health=100,
                last_activity="Portable baseline siap",
            )
            session.add(project)
            result["project_created"] = True
        member = await session.get(models.ProjectMember, {"project_id": project_id, "user_id": PORTABLE_ACTOR_ID})
        if member is None:
            session.add(models.ProjectMember(project_id=project_id, user_id=PORTABLE_ACTOR_ID, role="owner"))

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
                artifact_key="portable://plhut-88pages",
            )
            session.add(run)
            await session.flush()

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
        await session.commit()

    async with Session() as session:
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
                    "source": "portable_project_bootstrap",
                    "run_id": str(run_id),
                    "project_manifest": str(MANIFEST_PATH.relative_to(REPO_ROOT)),
                },
                nodes=[_node_to_dict(n) for n in snapshot.nodes],
                edges=[_edge_to_dict(e) for e in snapshot.edges],
                evidence=list(evidence_map.values()),
                node_evidence=_node_evidence_items(snapshot, set(evidence_map)),
                edge_evidence=[], aliases=[], communities=[], summary_views=[],
            )
            await session.commit()
            result["snapshot_created"] = True
            result["graph_nodes"] = len(snapshot.nodes)
            result["graph_edges"] = len(snapshot.edges)

    async with Session() as session:
        result["project_count"] = int((await session.execute(select(func.count()).select_from(models.Project))).scalar_one())
        result["dem_page_count"] = int((await session.execute(select(func.count()).select_from(models.DemPage).join(
            models.DemRun, models.DemPage.run_id == models.DemRun.id
        ).where(models.DemRun.project_id == project_id))).scalar_one())
    return result


async def main() -> None:
    status = await bootstrap_plhut()
    print("PLHUT PORTABLE BOOTSTRAP:", json.dumps(status, ensure_ascii=False))
    print(f"Persistent DB: {DB_FILE}")
    config = uvicorn.Config(app=app, host="127.0.0.1", port=8001, log_level="info")
    await uvicorn.Server(config).serve()


if __name__ == "__main__":
    asyncio.run(main())
