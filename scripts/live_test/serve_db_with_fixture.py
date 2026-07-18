"""
Live test harness: serve DB with 88-page PLHUT fixture.

Pola dari services/db/tests/run_pckm_benchmark.py — setup engine, load fixture,
seed snapshot, run uvicorn di :8001.

Run:  PYTHONUTF8=1 python scripts/live_test/serve_db_with_fixture.py
"""
from __future__ import annotations

import asyncio
import sys
import os
from pathlib import Path

# Setup paths — REPO_ROOT dihitung dari lokasi file ini
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "services" / "document-intelligence"))
sys.path.insert(0, str(REPO_ROOT / "services" / "db" / "src"))

os.environ.setdefault("INTERNAL_SERVICE_KEY", "live-test-key")

from app.transcription.models import DrawingEvidenceSheet  # noqa: E402
from app.project_graph.synthesis import synthesize_project_graph  # noqa: E402

from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from paax_db.database import Base, get_db  # noqa: E402
from paax_db.main import app  # noqa: E402

import uvicorn  # noqa: E402

# ─── Setup ─────────────────────────────────────────────────────────────────

FIXTURE_DIR = REPO_ROOT / "report" / "report_drawing_intelligence" / "dem_extraction_88pages" / "pages"
DB_FILE = Path(__file__).resolve().parent / "live_test.db"

# File-based SQLite (aiosqlite, tidak perlu StaticPool)
engine = create_async_engine(
    f"sqlite+aiosqlite:///{DB_FILE}",
    connect_args={"check_same_thread": False},
)
Session = async_sessionmaker(engine, expire_on_commit=False)


async def _override_get_db():
    async with Session() as session:
        yield session


app.dependency_overrides[get_db] = _override_get_db


def _node_to_dict(node):
    """Konversi node snapshot ke dict payload (dari run_pckm_benchmark.py)."""
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
    """Konversi edge snapshot ke dict payload (dari run_pckm_benchmark.py)."""
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
    """Ekstrak evidence dari snapshot (dari run_pckm_benchmark.py)."""
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
    """Mapping node-evidence (dari run_pckm_benchmark.py)."""
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


async def load_fixture() -> None:
    """Load 88-page PLHUT fixture ke DB."""
    # Hapus DB lama jika ada
    if DB_FILE.exists():
        DB_FILE.unlink()
        print(f"Deleted old DB: {DB_FILE}")

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    print("Database schema created")

    # Load fixture sheets
    print(f"Loading fixture from: {FIXTURE_DIR}")
    sheets = [
        DrawingEvidenceSheet.model_validate_json(p.read_text(encoding="utf-8"))
        for p in sorted(FIXTURE_DIR.glob("page-*.json"))
    ]
    print(f"Loaded {len(sheets)} fixture sheets")

    # Synthesize graph
    snapshot = synthesize_project_graph(sheets).snapshot
    print(f"Synthesized snapshot: {len(snapshot.nodes)} nodes, {len(snapshot.edges)} edges")

    # Build payload
    evidence_map = _evidence_items(snapshot)
    payload = {
        "snapshot_id": snapshot.snapshot_id,
        "schema_version": snapshot.schema_version,
        "source_manifest_hash": "live-test-baseline",
        "generation_metadata": {"source": "serve_db_with_fixture.py"},
        "nodes": [_node_to_dict(n) for n in snapshot.nodes],
        "edges": [_edge_to_dict(e) for e in snapshot.edges],
        "evidence": list(evidence_map.values()),
        "node_evidence": _node_evidence_items(snapshot, set(evidence_map)),
        "edge_evidence": [],
        "aliases": [],
        "communities": [],
    }

    # Seed DB via API
    # X-User-Id="paax-web" -- HARUS sama dgn identitas yang disuntik proxy server
    # apps/web/src/app/api/db-projects/[...path]/route.ts, supaya proyek ini
    # kelihatan di GET /projects saat dipanggil browser lewat proxy itu (owner_id
    # difilter ketat oleh services/db, lihat main.py create_project/list_projects).
    headers = {"X-Internal-Key": "live-test-key", "X-User-Id": "paax-web"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://live-test") as client:
        # POST /projects
        r = await client.post(
            "/projects",
            json={"id": "PLHUT-SURAKARTA", "owner_id": "paax-web", "name": "PLHUT Surakarta"},
            headers=headers,
        )
        assert r.status_code == 200, f"POST /projects failed: {r.status_code} {r.text}"
        print(f"Created project: {r.status_code}")

        # POST /projects/.../snapshots
        r = await client.post(
            "/projects/PLHUT-SURAKARTA/project-graph/snapshots",
            json=payload,
            headers=headers,
        )
        assert r.status_code == 200, f"POST snapshots failed: {r.status_code} {r.text[:400]}"
        print(f"Seeded snapshot: {r.status_code}")


async def main() -> None:
    """Load fixture, then start uvicorn."""
    await load_fixture()
    print("\nFIXTURE LOADED — starting uvicorn :8001")
    print("Test with: scripts/live_test/ask_retrieve.sh 'posisi kolom K1'")
    print()

    # Start uvicorn (blocking)
    config = uvicorn.Config(app=app, host="127.0.0.1", port=8001, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


if __name__ == "__main__":
    asyncio.run(main())
