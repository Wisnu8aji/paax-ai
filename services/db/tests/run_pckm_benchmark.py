"""PCKM Command Room query benchmark runner (v0, baseline).

Runs the ground-truth query battery (report/report_drawing_intelligence/
BENCHMARK_GROUND_TRUTH_SEED_2026-07-16.md) against the REAL retrieve endpoint
with the REAL 88-page PLHUT fixture snapshot, and writes a scorecard.

Deliberately NOT named test_*.py: this is an opt-in benchmark, not part of the
default pytest suite (several checks are expected to FAIL until the roadmap
waves land — the point is to measure them honestly, not to break CI).

Run:  python tests/run_pckm_benchmark.py   (from services/db, PYTHONUTF8=1)
"""
from __future__ import annotations

import asyncio
import sys
import time
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "services" / "document-intelligence"))
sys.path.insert(0, str(REPO_ROOT / "services" / "db" / "src"))

import os
os.environ.setdefault("INTERNAL_SERVICE_KEY", "benchmark-internal-key")

from app.transcription.models import DrawingEvidenceSheet  # noqa: E402
from app.project_graph.synthesis import synthesize_project_graph  # noqa: E402

from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from paax_db.database import Base, get_db  # noqa: E402
from paax_db.main import app  # noqa: E402

FIXTURE_DIR = REPO_ROOT / "report" / "report_drawing_intelligence" / "dem_extraction_88pages" / "pages"
SCORECARD_PATH = REPO_ROOT / "report" / "report_drawing_intelligence" / f"BENCHMARK_SCORECARD_{date.today().isoformat()}.md"

engine = create_async_engine(
    "sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
)
Session = async_sessionmaker(engine, expire_on_commit=False)


async def _override_get_db():
    async with Session() as session:
        yield session


app.dependency_overrides[get_db] = _override_get_db


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


# ─── Checks per ground-truth item ────────────────────────────────────────────
# Each check gets the retrieve JSON body and returns (passed: bool, note: str).

def _types_in(data):
    return {n.get("type") for n in data.get("nodes", [])}


def _names_in(data):
    return [str(n.get("name", "")) for n in data.get("nodes", [])]


def check_gt2_l2_includes_structure(data):
    occs = [n for n in data.get("nodes", []) if n.get("type") == "element_occurrence"]
    struct = [n for n in occs if n.get("discipline") == "structure"]
    return bool(struct), f"occ total={len(occs)}, occ struktur={len(struct)} (wajib >0: K1A/K2/K3/lintel ada di hal.43,48)"


def check_gt4_kolom_l2(data):
    names = " ".join(_names_in(data)).upper()
    hits = [c for c in ("K1A", "K2", "K3") if c in names]
    occs = [n for n in data.get("nodes", []) if n.get("type") == "element_occurrence" and n.get("discipline") == "structure"]
    return len(hits) >= 2 and bool(occs), f"kode kolom terlihat={hits}, occ struktur={len(occs)}"


def check_gt6_k1_dimension(data):
    names = _names_in(data)
    dim = [n for n in names if "400" in n and "400" in n.replace("x", "X")]
    return bool(dim), f"node dimensi 400x400 di hasil: {dim[:2]}"


def check_gt8_struktur_lantai2_nonzero(data):
    return len(data.get("nodes", [])) > 0, f"nodes={len(data.get('nodes', []))} (frasa alami wajib tidak nol & scoped benar)"


def check_gt9_volume_refused(data):
    # Kelas CALCULATION_REQUIRED: jawaban benar = penolakan eksplisit + pengarahan.
    # Endpoint saat ini tidak punya konsep itu; sukses-kosong = FAIL.
    status = data.get("status")
    refused = status not in (None, "success") or bool(data.get("calculation_required"))
    return refused, f"status={status}, tanpa penanda calculation_required -> sukses-kosong menyesatkan"


def check_gt14_conflict_visible(data):
    conflicts = [n for n in data.get("nodes", []) if n.get("type") == "conflict"]
    return bool(conflicts), f"node conflict di hasil={len(conflicts)} (1 konflik nyata hal.81 ada di graf)"


def check_gt16_honest_empty(data):
    return len(data.get("nodes", [])) == 0, f"nodes={len(data.get('nodes', []))} (wajib 0 untuk Lantai 3)"


def check_gt17_main_floor_alias(data):
    names = " ".join(_names_in(data)).upper()
    return "LANTAI 1" in names, f"hasil mengandung Lantai 1? {'ya' if 'LANTAI 1' in names else 'tidak'}"


BATTERY = [
    ("GT2",  "Lantai 2",                     "Elemen di Lantai 2 termasuk STRUKTUR",        check_gt2_l2_includes_structure),
    ("GT4",  "Lantai 2",                     "Kolom L2 (K1A/K2/K3) muncul sbg occurrence",  check_gt4_kolom_l2),
    ("GT6",  "K1",                           "Dimensi K1 400x400 terjangkau dari query K1", check_gt6_k1_dimension),
    ("GT8",  "struktur lantai 2",            "Frasa alami disiplin+lokasi tidak nol",       check_gt8_struktur_lantai2_nonzero),
    ("GT9",  "berapa volume beton lantai 2", "Pertanyaan kalkulasi ditolak/diarahkan",      check_gt9_volume_refused),
    ("GT14", "konflik dimensi",              "Konflik hal.81 terjangkau",                   check_gt14_conflict_visible),
    ("GT16", "Lantai 3",                     "Level tak ada -> nol jujur",                  check_gt16_honest_empty),
    ("GT17", "Main Floor",                   "Alias semantik level dikenali",               check_gt17_main_floor_alias),
]


async def main() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    sheets = [
        DrawingEvidenceSheet.model_validate_json(p.read_text(encoding="utf-8"))
        for p in sorted(FIXTURE_DIR.glob("page-*.json"))
    ]
    snapshot = synthesize_project_graph(sheets).snapshot
    evidence_map = _evidence_items(snapshot)
    payload = {
        "snapshot_id": snapshot.snapshot_id,
        "schema_version": snapshot.schema_version,
        "source_manifest_hash": "benchmark-baseline",
        "generation_metadata": {"source": "run_pckm_benchmark.py"},
        "nodes": [_node_to_dict(n) for n in snapshot.nodes],
        "edges": [_edge_to_dict(e) for e in snapshot.edges],
        "evidence": list(evidence_map.values()),
        "node_evidence": _node_evidence_items(snapshot, set(evidence_map)),
        "edge_evidence": [],
        "aliases": [],
        "communities": [],
    }

    headers = {"X-Internal-Key": "benchmark-internal-key", "X-User-Id": "OWNER-A"}
    rows = []
    passed = 0
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://bench") as client:
        r = await client.post("/projects", json={"id": "PLHUT-BENCH", "owner_id": "x", "name": "PLHUT"}, headers=headers)
        assert r.status_code == 200, r.text
        r = await client.post("/projects/PLHUT-BENCH/project-graph/snapshots", json=payload, headers=headers)
        assert r.status_code == 200, r.text[:400]

        for gt_id, query, expectation, check in BATTERY:
            t0 = time.perf_counter()
            resp = await client.post(
                "/projects/PLHUT-BENCH/project-graph/retrieve",
                json={"query": query, "depth": 2, "traversal_mode": "bfs"},
                headers=headers,
            )
            ms = (time.perf_counter() - t0) * 1000
            ok, note = check(resp.json())
            passed += ok
            rows.append((gt_id, query, expectation, "PASS" if ok else "FAIL", note, f"{ms:.0f}ms"))
            print(f"{gt_id}: {'PASS' if ok else 'FAIL'} — {expectation} — {note}")

    lines = [
        f"# Benchmark Scorecard — {date.today().isoformat()}",
        "",
        f"Runner v0 (baseline). Hasil: **{passed}/{len(BATTERY)} PASS**.",
        "Ground truth: `BENCHMARK_GROUND_TRUTH_SEED_2026-07-16.md`.",
        "",
        "| GT | Query | Ekspektasi | Hasil | Catatan | Latensi |",
        "|---|---|---|---|---|---|",
    ]
    for gt_id, query, expectation, verdict, note, ms in rows:
        lines.append(f"| {gt_id} | `{query}` | {expectation} | **{verdict}** | {note} | {ms} |")
    SCORECARD_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nScorecard: {SCORECARD_PATH}")
    print(f"TOTAL: {passed}/{len(BATTERY)} PASS")


if __name__ == "__main__":
    asyncio.run(main())
