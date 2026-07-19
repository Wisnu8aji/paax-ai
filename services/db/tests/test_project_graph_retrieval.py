from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from paax_db import models, schemas
from paax_db.project_graph_repository import build_and_activate_snapshot
from paax_db.project_graph_retrieval import build_project_vocabulary, retrieve_project_graph
from paax_db.main import app


@pytest.mark.asyncio
async def test_retrieval_scopes_alias_bfs_evidence_budget_and_audit_to_active_project_snapshot():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add_all([
            models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"),
            models.Project(id="PROJECT-B", owner_id="OWNER-B", name="Project B"),
        ])
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-A", snapshot_id="SNAP-A", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="a", generation_metadata={},
            nodes=[
                {"node_id": "J2", "node_type": "element_type", "canonical_name": "Jendela J2", "normalized_name": "jendela j2", "discipline": "architecture", "verification_status": "extracted", "confidence": 0.9, "search_text": "jendela j2 aluminium"},
                {"node_id": "L1", "node_type": "level", "canonical_name": "Lantai 1", "normalized_name": "lantai 1", "discipline": "general", "verification_status": "extracted", "confidence": 0.9},
            ],
            edges=[{"edge_id": "J2-L1", "source_node_id": "J2", "target_node_id": "L1", "relation": "LOCATED_ON", "confidence_class": "EXTRACTED", "confidence": 0.9}],
            evidence=[{"evidence_id": "EV-J2", "document_id": "DOC-A", "page_index": 20, "sheet_id": "A-21", "kind": "text", "raw_text": "Jendela J2 pada lantai 1"}],
            node_evidence=[{"node_id": "J2", "evidence_id": "EV-J2", "role": "source"}], edge_evidence=[],
            aliases=[{"alias_normalized": "j2", "alias_raw": "J2", "node_id": "J2", "alias_type": "drawing_mark", "confidence": 0.9}], communities=[],
        )
        await build_and_activate_snapshot(
            session, project_id="PROJECT-B", snapshot_id="SNAP-B", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="b", generation_metadata={},
            nodes=[{"node_id": "J2", "node_type": "element_type", "canonical_name": "Wrong Project", "normalized_name": "wrong project", "discipline": "architecture", "verification_status": "extracted", "confidence": 0.9}],
            edges=[], evidence=[], node_evidence=[], edge_evidence=[], aliases=[], communities=[],
        )

        result = await retrieve_project_graph(session, project_id="PROJECT-A", query="J2", depth=1, budget_tokens=30)
        logs = (await session.execute(select(models.ProjectGraphQueryLog))).scalars().all()

    assert result.snapshot_id == "SNAP-A"
    assert [node.node_id for node in result.nodes] == ["J2", "L1"]
    assert [edge.edge_id for edge in result.edges] == ["J2-L1"]
    assert [(item.evidence_id, item.sheet_id, item.page_index) for item in result.evidence] == [("EV-J2", "A-21", 20)]
    assert result.context_token_estimate <= 30
    assert len(logs) == 1
    assert (logs[0].project_id, logs[0].snapshot_id, logs[0].outcome) == ("PROJECT-A", "SNAP-A", "success")
    assert logs[0].selected_seed_ids == ["J2"]


@pytest.mark.asyncio
async def test_retrieval_returns_not_ready_without_reading_another_project_snapshot():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add_all([
            models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"),
            models.Project(id="PROJECT-B", owner_id="OWNER-B", name="Project B"),
        ])
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-B", snapshot_id="SNAP-B", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="b", generation_metadata={}, nodes=[], edges=[], evidence=[], node_evidence=[], edge_evidence=[], aliases=[], communities=[],
        )

        result = await retrieve_project_graph(session, project_id="PROJECT-A", query="anything")

    assert result.status == "not_ready"
    assert result.nodes == []


@pytest.mark.asyncio
async def test_retrieval_api_returns_scoped_context_and_not_ready_status():
    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/projects", json={"id": "PROJECT-A", "owner_id": "ignored", "name": "Project A"}, headers=headers)
        response = await client.post("/projects/PROJECT-A/project-graph/retrieve", json={"query": "J2"}, headers=headers)

    assert response.status_code == 200
    assert response.json() == {"status": "not_ready", "snapshot_id": None, "nodes": [], "edges": [], "evidence": [], "context_token_estimate": 0}


@pytest.mark.asyncio
async def test_metrics_api_only_aggregates_query_logs_for_the_requested_project():
    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/projects", json={"id": "PROJECT-A", "owner_id": "ignored", "name": "Project A"}, headers=headers)
        await client.post("/projects/PROJECT-A/project-graph/snapshots", json={"snapshot_id": "SNAP-A", "schema_version": "paax.pckm.graph.v1", "source_manifest_hash": "a", "generation_metadata": {}, "nodes": [], "edges": [], "evidence": [], "node_evidence": [], "edge_evidence": [], "aliases": [], "communities": []}, headers=headers)
        await client.post("/projects/PROJECT-A/project-graph/retrieve", json={"query": "J2"}, headers=headers)
        response = await client.get("/projects/PROJECT-A/project-graph/metrics", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"project_id": "PROJECT-A", "query_count": 1, "success_count": 1, "not_ready_count": 0, "average_context_tokens": 0.0}


@pytest.mark.asyncio
async def test_retrieval_api_enforces_database_backed_per_project_rate_limit(monkeypatch):
    monkeypatch.setenv("PCKM_RETRIEVAL_LIMIT_PER_MINUTE", "1")
    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/projects", json={"id": "PROJECT-A", "owner_id": "ignored", "name": "Project A"}, headers=headers)
        await client.post("/projects/PROJECT-A/project-graph/snapshots", json={"snapshot_id": "SNAP-A", "schema_version": "paax.pckm.graph.v1", "source_manifest_hash": "a", "generation_metadata": {}, "nodes": [], "edges": [], "evidence": [], "node_evidence": [], "edge_evidence": [], "aliases": [], "communities": []}, headers=headers)
        assert (await client.post("/projects/PROJECT-A/project-graph/retrieve", json={"query": "J2"}, headers=headers)).status_code == 200
        response = await client.post("/projects/PROJECT-A/project-graph/retrieve", json={"query": "J2"}, headers=headers)

    assert response.status_code == 429


@pytest.mark.asyncio
async def test_retrieval_supports_dfs_and_shortest_path_within_active_snapshot():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"))
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-A", snapshot_id="SNAP-A", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="a", generation_metadata={},
            nodes=[
                {"node_id": "A", "node_type": "space", "canonical_name": "Start", "normalized_name": "start", "discipline": "architecture", "verification_status": "extracted", "confidence": 1},
                {"node_id": "B", "node_type": "space", "canonical_name": "Middle", "normalized_name": "middle", "discipline": "architecture", "verification_status": "extracted", "confidence": 1},
                {"node_id": "C", "node_type": "space", "canonical_name": "Target", "normalized_name": "target", "discipline": "architecture", "verification_status": "extracted", "confidence": 1},
            ],
            edges=[
                {"edge_id": "A-B", "source_node_id": "A", "target_node_id": "B", "relation": "CONNECTED_TO", "confidence_class": "EXTRACTED", "confidence": 1},
                {"edge_id": "B-C", "source_node_id": "B", "target_node_id": "C", "relation": "CONNECTED_TO", "confidence_class": "EXTRACTED", "confidence": 1},
            ], evidence=[], node_evidence=[], edge_evidence=[], aliases=[], communities=[],
        )
        shortest = await retrieve_project_graph(session, project_id="PROJECT-A", query="Start", traversal_mode="shortest_path", target_node_id="C")
        depth_first = await retrieve_project_graph(session, project_id="PROJECT-A", query="Start", traversal_mode="dfs", depth=2)

    assert [edge.edge_id for edge in shortest.edges] == ["A-B", "B-C"]
    assert {node.node_id for node in shortest.nodes} == {"A", "B", "C"}
    assert {node.node_id for node in depth_first.nodes} == {"A", "B", "C"}


@pytest.mark.asyncio
async def test_retrieval_benchmark_fixture_keeps_expected_seed_and_context_budget():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"))
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-A", snapshot_id="SNAP-A", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="a", generation_metadata={},
            nodes=[{"node_id": "J2", "node_type": "element_type", "canonical_name": "Jendela J2", "normalized_name": "jendela j2", "discipline": "architecture", "verification_status": "extracted", "confidence": 1, "search_text": "jendela aluminium"}],
            edges=[], evidence=[{"evidence_id": "EV-J2", "document_id": "DOC", "page_index": 20, "sheet_id": "A-21", "kind": "text", "raw_text": "J2"}],
            node_evidence=[{"node_id": "J2", "evidence_id": "EV-J2", "role": "source"}], edge_evidence=[], aliases=[{"alias_normalized": "j2", "alias_raw": "J2", "node_id": "J2", "alias_type": "drawing_mark", "confidence": 1}], communities=[],
        )
        result = await retrieve_project_graph(session, project_id="PROJECT-A", query="J2", budget_tokens=100)

    assert [node.node_id for node in result.nodes] == ["J2"]
    assert [item.evidence_id for item in result.evidence] == ["EV-J2"]
    assert result.context_token_estimate <= 100


@pytest.mark.asyncio
async def test_vocabulary_and_seed_scoring_prefer_exact_alias_deterministically():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"))
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-A", snapshot_id="SNAP-A", schema_version="paax.pckm.graph.v1", source_manifest_hash="a", generation_metadata={},
            nodes=[
                {"node_id": "EXACT", "node_type": "element_type", "canonical_name": "J2", "normalized_name": "j2", "discipline": "architecture", "verification_status": "extracted", "confidence": 1},
                {"node_id": "PARTIAL", "node_type": "element_type", "canonical_name": "J20", "normalized_name": "j20", "discipline": "architecture", "verification_status": "extracted", "confidence": 1},
            ], edges=[], evidence=[], node_evidence=[], edge_evidence=[], aliases=[{"alias_normalized": "j2", "alias_raw": "J2", "node_id": "EXACT", "alias_type": "drawing_mark", "confidence": 1}], communities=[],
        )
        vocabulary = await build_project_vocabulary(session, project_id="PROJECT-A", snapshot_id="SNAP-A")
        result = await retrieve_project_graph(session, project_id="PROJECT-A", query="J2", traversal_mode="direct_lookup")

    assert vocabulary == {"j2", "j20"}
    assert [node.node_id for node in result.nodes] == ["EXACT", "PARTIAL"]


@pytest.mark.asyncio
async def test_retrieval_api_uses_snapshot_scoped_shared_cache():
    from .conftest import TestSession

    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"}
    transport = ASGITransport(app=app)
    snapshot = {"snapshot_id": "SNAP-A", "schema_version": "paax.pckm.graph.v1", "source_manifest_hash": "a", "generation_metadata": {}, "nodes": [], "edges": [], "evidence": [], "node_evidence": [], "edge_evidence": [], "aliases": [], "communities": []}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/projects", json={"id": "PROJECT-A", "owner_id": "ignored", "name": "Project A"}, headers=headers)
        await client.post("/projects/PROJECT-A/project-graph/snapshots", json=snapshot, headers=headers)
        first = await client.post("/projects/PROJECT-A/project-graph/retrieve", json={"query": "J2"}, headers=headers)
        second = await client.post("/projects/PROJECT-A/project-graph/retrieve", json={"query": "J2"}, headers=headers)

    async with TestSession() as session:
        cache_rows = (await session.execute(select(models.ProjectGraphRetrievalCache))).scalars().all()
        logs = (await session.execute(select(models.ProjectGraphQueryLog))).scalars().all()
    assert first.json() == second.json()
    assert len(cache_rows) == 1
    assert len(logs) == 1


@pytest.mark.asyncio
async def test_retrieval_budget_pruning_survives_multiple_pop_iterations():
    """Regression test for a bug found via real end-to-end testing against the
    88-page PLHUT synthesis output: the pruning loop's per-iteration evidence
    refetch used to run `for row in await session.execute(select(ProjectGraph
    NodeEvidence)...)` and access `row.evidence_id` directly -- but execute()
    without .scalars() returns Row tuples, not model instances, so this raised
    AttributeError as soon as pruning needed a second pop (never triggered by
    prior small-fixture tests, whose budgets happened to fit after one pop or
    zero pops). This test uses enough nodes/evidence that the loop must pop
    more than once, guaranteeing the buggy line actually executes."""
    from .conftest import TestSession

    node_count = 10
    nodes = [
        {
            "node_id": f"N{i}", "node_type": "element_type", "canonical_name": f"Elemen {i}",
            "normalized_name": f"elemen {i}", "discipline": "architecture",
            "verification_status": "extracted", "confidence": 0.9,
            "search_text": "kata kunci panjang berulang " * 5,
        }
        for i in range(node_count)
    ]
    evidence = [
        {"evidence_id": f"EV{i}", "document_id": "DOC-A", "page_index": i, "sheet_id": f"S-{i}", "kind": "text", "raw_text": "teks bukti panjang berulang " * 5}
        for i in range(node_count)
    ]
    node_evidence = [{"node_id": f"N{i}", "evidence_id": f"EV{i}", "role": "primary"} for i in range(node_count)]
    edges = [{"edge_id": f"E{i}", "source_node_id": "N0", "target_node_id": f"N{i}", "relation": "REFERENCES", "confidence_class": "EXTRACTED", "confidence": 0.9} for i in range(1, node_count)]

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-PRUNE", owner_id="OWNER-A", name="Project Prune"))
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-PRUNE", snapshot_id="SNAP-PRUNE", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="prune", generation_metadata={},
            nodes=nodes, edges=edges, evidence=evidence, node_evidence=node_evidence,
            edge_evidence=[], aliases=[], communities=[],
        )

        # Small budget forces the pruning loop to pop several times, but
        # still leaves at least one node so the assertion below is meaningful.
        result = await retrieve_project_graph(
            session, project_id="PROJECT-PRUNE", query="elemen", depth=2, budget_tokens=100,
        )

    assert result.status == "success"
    # Pruning must have popped at least one node (proves the multi-pop path
    # that contains the regression-tested line actually ran), but not been
    # emptied out entirely.
    assert 0 < len(result.nodes) < node_count
    # Every remaining node's evidence must actually still be attached -- proves
    # the refetch after each pop returned the correct evidence_id set.
    remaining_node_ids = {node.node_id for node in result.nodes}
    for item in result.evidence:
        assert item.evidence_id.replace("EV", "N") in remaining_node_ids
    assert all(
        edge.source_node_id in remaining_node_ids and edge.target_node_id in remaining_node_ids
        for edge in result.edges
    )


async def _seed_intent_retrieval_fixture(session, *, summary_views=()):
    session.add(models.Project(id="PROJECT-V2", owner_id="OWNER-A", name="Project V2"))
    await session.commit()
    await build_and_activate_snapshot(
        session,
        project_id="PROJECT-V2",
        snapshot_id="SNAP-V2",
        schema_version="paax.pckm.graph.v1",
        source_manifest_hash="v2",
        generation_metadata={},
        nodes=[
            {"node_id": "L2", "node_type": "level", "canonical_name": "Lantai 2", "normalized_name": "lantai 2", "discipline": "general", "verification_status": "extracted", "confidence": 1},
            {"node_id": "TYPE-K1", "node_type": "element_type", "canonical_name": "K1", "normalized_name": "k1", "discipline": "structure", "verification_status": "extracted", "confidence": 1},
            {"node_id": "OCC-K1", "node_type": "element_occurrence", "canonical_name": "K1 @ Lantai 2", "normalized_name": "k1 @ lantai 2", "discipline": "structure", "verification_status": "cross_sheet_inferred", "confidence": 1},
            {"node_id": "OCC-W1", "node_type": "element_occurrence", "canonical_name": "Jendela @ Lantai 2", "normalized_name": "jendela @ lantai 2", "discipline": "architecture", "verification_status": "extracted", "confidence": 1},
            {"node_id": "DIM-K1", "node_type": "dimension", "canonical_name": "400x400 mm", "normalized_name": "400x400 mm", "discipline": "structure", "verification_status": "extracted", "confidence": 1, "search_text": "400x400 mm"},
            {"node_id": "CONFLICT-1", "node_type": "conflict", "canonical_name": "Total horizontal atas 20250 != bawah 20000", "normalized_name": "total horizontal atas 20250 != bawah 20000", "discipline": "general", "verification_status": "conflicting", "confidence": 1},
        ],
        edges=[
            {"edge_id": "K1-L2", "source_node_id": "OCC-K1", "target_node_id": "L2", "relation": "LOCATED_ON", "confidence_class": "EXTRACTED", "confidence": 1},
            {"edge_id": "W1-L2", "source_node_id": "OCC-W1", "target_node_id": "L2", "relation": "LOCATED_ON", "confidence_class": "EXTRACTED", "confidence": 1},
            {"edge_id": "K1-TYPE", "source_node_id": "OCC-K1", "target_node_id": "TYPE-K1", "relation": "INSTANCE_OF", "confidence_class": "EXTRACTED", "confidence": 1},
            {"edge_id": "K1-DIM", "source_node_id": "OCC-K1", "target_node_id": "DIM-K1", "relation": "HAS_DIMENSION", "confidence_class": "EXTRACTED", "confidence": 1},
            {"edge_id": "CONFLICT-EV", "source_node_id": "CONFLICT-1", "target_node_id": "DIM-K1", "relation": "HAS_EVIDENCE", "confidence_class": "EXTRACTED", "confidence": 1},
        ],
        evidence=[{"evidence_id": "EV-50", "document_id": "DOC-A", "page_index": 49, "sheet_id": "S-50", "kind": "text", "raw_text": "TABEL KOLOM K1 400x400 mm"}],
        node_evidence=[{"node_id": "DIM-K1", "evidence_id": "EV-50", "role": "source"}],
        edge_evidence=[],
        aliases=[{"alias_normalized": "k1", "alias_raw": "K1", "node_id": "TYPE-K1", "alias_type": "drawing_mark", "confidence": 1}],
        communities=[],
        summary_views=summary_views,
    )


@pytest.mark.asyncio
async def test_retrieval_api_matches_lintel_entities_and_returns_occurrences_with_levels():
    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"}
    snapshot = {
        "snapshot_id": "SNAP-LINTEL",
        "schema_version": "paax.pckm.graph.v1",
        "source_manifest_hash": "lintel",
        "generation_metadata": {"source": "synthetic lintel retrieval fixture"},
        "nodes": [
            {"node_id": "L1", "node_type": "level", "canonical_name": "Lantai 1", "normalized_name": "lantai 1", "discipline": "general", "verification_status": "extracted", "confidence": 1},
            {"node_id": "LT2", "node_type": "level", "canonical_name": "LT-2", "normalized_name": "lt-2", "discipline": "general", "verification_status": "extracted", "confidence": 1},
            {"node_id": "TYPE-LINTEL-15X10", "node_type": "element_type", "canonical_name": "Lintel 15X10", "normalized_name": "lintel 15x10", "discipline": "structure", "verification_status": "extracted", "confidence": 1},
            {"node_id": "TYPE-BALOK-LINTEL", "node_type": "element_type", "canonical_name": "BALOK LINTEL", "normalized_name": "balok lintel", "discipline": "structure", "verification_status": "extracted", "confidence": 1},
            {"node_id": "OCC-LINTEL-L1", "node_type": "element_occurrence", "canonical_name": "Lintel 15X10 @ Lantai 1", "normalized_name": "lintel 15x10 @ lantai 1", "discipline": "structure", "verification_status": "extracted", "confidence": 1},
            {"node_id": "OCC-BALOK-LT2", "node_type": "element_occurrence", "canonical_name": "BALOK LINTEL @ LT-2", "normalized_name": "balok lintel @ lt-2", "discipline": "structure", "verification_status": "extracted", "confidence": 1},
        ],
        "edges": [
            {"edge_id": "OCC-LINTEL-L1-LEVEL", "source_node_id": "OCC-LINTEL-L1", "target_node_id": "L1", "relation": "LOCATED_ON", "confidence_class": "EXTRACTED", "confidence": 1},
            {"edge_id": "OCC-BALOK-LT2-LEVEL", "source_node_id": "OCC-BALOK-LT2", "target_node_id": "LT2", "relation": "LOCATED_ON", "confidence_class": "EXTRACTED", "confidence": 1},
            {"edge_id": "OCC-LINTEL-L1-TYPE", "source_node_id": "OCC-LINTEL-L1", "target_node_id": "TYPE-LINTEL-15X10", "relation": "INSTANCE_OF", "confidence_class": "EXTRACTED", "confidence": 1},
            {"edge_id": "OCC-BALOK-LT2-TYPE", "source_node_id": "OCC-BALOK-LT2", "target_node_id": "TYPE-BALOK-LINTEL", "relation": "INSTANCE_OF", "confidence_class": "EXTRACTED", "confidence": 1},
        ],
        "evidence": [],
        "node_evidence": [],
        "edge_evidence": [],
        "aliases": [],
        "communities": [],
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        project_response = await client.post(
            "/projects", json={"id": "PROJECT-LINTEL", "owner_id": "ignored", "name": "Lintel"}, headers=headers
        )
        assert project_response.status_code == 200, project_response.text
        snapshot_response = await client.post(
            "/projects/PROJECT-LINTEL/project-graph/snapshots", json=snapshot, headers=headers
        )
        assert snapshot_response.status_code == 200, snapshot_response.text
        response = await client.post(
            "/projects/PROJECT-LINTEL/project-graph/retrieve",
            json={"query": "balok lintel di lantai mana saja", "use_intent": True, "depth": 2},
            headers=headers,
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["intent"] == "ELEMENT_LOOKUP"
    assert body["data_status"] == "grounded"
    occurrence_names = {
        node["name"] for node in body["nodes"] if node["type"] == "element_occurrence"
    }
    assert occurrence_names == {"Lintel 15X10 @ Lantai 1", "BALOK LINTEL @ LT-2"}
    level_names = {
        node["name"] for node in body["nodes"] if node["type"] == "level"
    }
    assert level_names == {"Lantai 1", "LT-2"}


@pytest.mark.asyncio
async def test_intent_list_filter_uses_level_summary_and_discipline_scope():
    from .conftest import TestSession

    summary = {
        "schema_version": "paax.pckm.summary-view.v1",
        "project_id": "PROJECT-V2",
        "snapshot_id": "SNAP-V2",
        "view_kind": "LEVEL_OVERVIEW",
        "grain": {"level_id": "L2"},
        "summary": {"level_name": "Lantai 2", "element_type_index": [{"element_type_id": "TYPE-K1", "name": "K1", "occurrence_count": 1}], "discipline_counts": [{"discipline": "structure", "occurrence_count": 1}], "stored_measurement_facts": []},
        "quality": {"confirmed_count": 1, "ambiguous_binding_count": 0, "conflict_count": 0},
        "provenance": {"source_document_ids": ["DOC-A"], "evidence_ids": ["EV-50"], "summary_builder_version": "test"},
    }
    async with TestSession() as session:
        await _seed_intent_retrieval_fixture(session, summary_views=[summary])
        result = await retrieve_project_graph(session, project_id="PROJECT-V2", query="struktur lantai 2", use_intent=True)

    assert result.intent == "LIST_FILTER"
    assert result.data_status == "grounded"
    assert result.summary_view["summary"]["element_type_index"][0]["name"] == "K1"
    assert "occurrence_count = jumlah kelompok konteks tercatat pada gambar, bukan jumlah fisik terpasang" in result.notes
    assert "occurrence_count = jumlah kelompok konteks tercatat pada gambar, bukan jumlah fisik terpasang" in result.summary_view["notes"]
    assert {node.node_id for node in result.nodes} == {"L2", "OCC-K1"}
    assert all(node.discipline in {"general", "structure"} for node in result.nodes)


@pytest.mark.asyncio
async def test_intent_list_filter_falls_back_to_scoped_bfs_when_summary_is_missing():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_intent_retrieval_fixture(session)
        result = await retrieve_project_graph(session, project_id="PROJECT-V2", query="struktur lantai 2", use_intent=True)

    assert result.data_status == "grounded"
    assert result.summary_view is None
    assert {node.node_id for node in result.nodes} == {"L2", "OCC-K1", "TYPE-K1", "DIM-K1"}
    assert all(node.discipline in {"general", "structure"} for node in result.nodes)


@pytest.mark.asyncio
async def test_entity_and_level_summary_path_returns_only_requested_entity():
    from .conftest import TestSession

    summary = {
        "schema_version": "paax.pckm.summary-view.v1",
        "project_id": "PROJECT-V2",
        "snapshot_id": "SNAP-V2",
        "view_kind": "LEVEL_OVERVIEW",
        "grain": {"level_id": "L2"},
        "summary": {
            "level_name": "Lantai 2",
            "element_type_index": [
                {"element_type_id": "TYPE-K1", "name": "K1", "occurrence_count": 1},
                {"element_type_id": "TYPE-W1", "name": "Jendela", "occurrence_count": 1},
            ],
            "discipline_counts": [
                {"discipline": "structure", "occurrence_count": 1},
                {"discipline": "architecture", "occurrence_count": 1},
            ],
            "stored_measurement_facts": [],
        },
        "quality": {"confirmed_count": 2, "ambiguous_binding_count": 0, "conflict_count": 0},
        "provenance": {"source_document_ids": ["DOC-A"], "evidence_ids": ["EV-50"], "summary_builder_version": "test"},
    }
    async with TestSession() as session:
        await _seed_intent_retrieval_fixture(session, summary_views=[summary])
        result = await retrieve_project_graph(session, project_id="PROJECT-V2", query="K1 lantai 2", use_intent=True)

    assert result.data_status == "grounded"
    assert {node.node_id for node in result.nodes} == {"L2", "OCC-K1"}
    assert "OCC-W1" not in {node.node_id for node in result.nodes}
    assert [entry["name"] for entry in result.summary_view["summary"]["element_type_index"]] == ["K1"]
    assert result.summary_view["summary"]["discipline_counts"] == [{"discipline": "structure", "occurrence_count": 1}]
    assert any("entity" in note.lower() and "K1" in note for note in result.summary_view["notes"])


@pytest.mark.asyncio
async def test_entity_and_level_fallback_bfs_returns_only_requested_entity():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_intent_retrieval_fixture(session)
        result = await retrieve_project_graph(session, project_id="PROJECT-V2", query="K1 lantai 2", use_intent=True)

    assert {node.node_id for node in result.nodes} == {"L2", "OCC-K1", "TYPE-K1", "DIM-K1"}
    assert "OCC-W1" not in {node.node_id for node in result.nodes}


@pytest.mark.asyncio
async def test_valid_level_with_zero_matching_discipline_is_empty_not_grounded():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_intent_retrieval_fixture(session)
        result = await retrieve_project_graph(session, project_id="PROJECT-V2", query="mep lantai 2", use_intent=True)

    assert result.nodes == [node for node in result.nodes if node.node_id == "L2"]
    assert result.data_status == "empty"
    assert any("empty" in note.lower() or "tidak ada" in note.lower() for note in result.notes)


@pytest.mark.asyncio
async def test_numeric_stored_fact_keeps_dimension_and_its_evidence():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_intent_retrieval_fixture(session)
        result = await retrieve_project_graph(session, project_id="PROJECT-V2", query="dimensi K1", use_intent=True)

    assert result.intent == "NUMERIC_STORED_FACT"
    assert any(node.canonical_name == "400x400 mm" for node in result.nodes)
    assert {item.evidence_id for item in result.evidence} == {"EV-50"}


@pytest.mark.asyncio
async def test_element_lookup_entity_seed_can_reach_dimension_for_short_benchmark_query():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_intent_retrieval_fixture(session)
        result = await retrieve_project_graph(session, project_id="PROJECT-V2", query="K1", use_intent=True)

    assert result.intent == "ELEMENT_LOOKUP"
    assert any(node.canonical_name == "400x400 mm" for node in result.nodes)


@pytest.mark.asyncio
async def test_conflict_word_wins_when_numeric_word_is_only_part_of_conflict_query():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_intent_retrieval_fixture(session)
        result = await retrieve_project_graph(session, project_id="PROJECT-V2", query="konflik dimensi", use_intent=True)

    assert result.intent == "CONFLICT_LOOKUP"
    assert any(node.node_type == "conflict" for node in result.nodes)


@pytest.mark.asyncio
async def test_missing_information_lookup_always_returns_honest_missing_information_summary():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_intent_retrieval_fixture(session)
        result = await retrieve_project_graph(session, project_id="PROJECT-V2", query="data kurang", use_intent=True)

    assert result.intent == "MISSING_INFORMATION"
    assert result.missing_information


@pytest.mark.asyncio
async def test_calculation_required_refuses_retrieval_and_points_to_core_engine():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_intent_retrieval_fixture(session)
        result = await retrieve_project_graph(session, project_id="PROJECT-V2", query="berapa volume beton lantai 2", use_intent=True)

    assert result.status == "calculation_required"
    assert result.data_status == "calculation_required"
    assert result.nodes == []
    assert "Core Engine" in (result.guidance or "")
    assert result.rab_bridge_available is True


@pytest.mark.asyncio
async def test_calculation_refusal_does_not_seed_graph_search(monkeypatch):
    from .conftest import TestSession
    import paax_db.project_graph_retrieval as retrieval_module

    async def fail_seed(*args, **kwargs):
        raise AssertionError("calculation refusal must not search entity seeds")

    monkeypatch.setattr(retrieval_module, "_entity_seed_nodes", fail_seed)
    async with TestSession() as session:
        await _seed_intent_retrieval_fixture(session)
        result = await retrieve_project_graph(
            session, project_id="PROJECT-V2", query="berapa kebutuhan besi K1", use_intent=True
        )

    assert result.status == "calculation_required"
    assert result.nodes == []
    assert result.guidance and "K1" in result.guidance


@pytest.mark.asyncio
async def test_calculation_parser_error_is_not_ready_without_legacy_fallback(monkeypatch):
    from .conftest import TestSession
    import paax_db.project_graph_retrieval as retrieval_module

    async def fail_parser(*args, **kwargs):
        raise RuntimeError("forced parser failure")

    async def fail_legacy(*args, **kwargs):
        raise AssertionError("calculation parser error must not fall back to legacy retrieval")

    monkeypatch.setattr(retrieval_module, "parse_query_plan", fail_parser)
    monkeypatch.setattr(retrieval_module, "_retrieve_legacy", fail_legacy)
    async with TestSession() as session:
        await _seed_intent_retrieval_fixture(session)
        result = await retrieve_project_graph(
            session, project_id="PROJECT-V2", query="berapa kebutuhan besi K1", use_intent=True
        )

    assert result.status == "not_ready"
    assert result.data_status == "not_ready"
    assert result.intent is None
    assert result.nodes == []
    assert any("parser" in note for note in result.notes)


@pytest.mark.asyncio
async def test_api_keeps_fallback_notes_and_data_status_when_intent_is_none(monkeypatch):
    from .conftest import TestSession
    import paax_db.project_graph_retrieval as retrieval_module

    async def fail_parser(*args, **kwargs):
        raise RuntimeError("forced parser failure")

    monkeypatch.setattr(retrieval_module, "parse_query_plan", fail_parser)
    async with TestSession() as session:
        await _seed_intent_retrieval_fixture(session)

    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/PROJECT-V2/project-graph/retrieve",
            json={"query": "berapa kebutuhan besi K1", "use_intent": True},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["data_status"] == "not_ready"
    assert any("parser" in note for note in body["notes"])


@pytest.mark.asyncio
async def test_conflict_lookup_seeds_conflict_nodes_and_unknown_level_is_honest_empty():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_intent_retrieval_fixture(session)
        conflict = await retrieve_project_graph(session, project_id="PROJECT-V2", query="ada konflik apa", use_intent=True)
        unknown = await retrieve_project_graph(session, project_id="PROJECT-V2", query="Lantai 3 ada apa saja", use_intent=True)

    assert conflict.intent == "CONFLICT_LOOKUP"
    assert any(node.node_type == "conflict" for node in conflict.nodes)
    assert unknown.data_status == "unknown_level"
    assert unknown.nodes == []
    assert any("level tak dikenal" in note for note in unknown.notes)


def test_retrieval_v2_schemas_expose_request_and_response_contract():
    request = schemas.ProjectGraphRetrievalRequest(query="dimensi K1", use_intent=True)
    response = schemas.ProjectGraphRetrievalResponse(
        status="success", intent="NUMERIC_STORED_FACT", applied_filters={"level": None, "discipline": None},
        data_status="grounded", notes=[], summary_view=None, guidance=None,
        rab_bridge_available=None, missing_information=[],
    )

    assert request.use_intent is True
    assert response.intent == "NUMERIC_STORED_FACT"
    assert response.data_status == "grounded"


def test_retrieval_schema_validates_summary_view_structure_and_d11_notes():
    summary = schemas.ProjectGraphSummaryView(
        project_id="PROJECT-V2",
        snapshot_id="SNAP-V2",
        grain={"level_id": "L2"},
        summary={"level_name": "Lantai 2"},
        quality={"confirmed_count": 0, "ambiguous_binding_count": 0, "conflict_count": 0},
        provenance={"summary_builder_version": "test"},
        notes=["occurrence_count = jumlah kelompok konteks tercatat pada gambar, bukan jumlah fisik terpasang"],
    )
    response = schemas.ProjectGraphRetrievalResponse(
        status="success", intent="LIST_FILTER", data_status="empty", summary_view=summary
    )

    assert response.summary_view.summary.level_name == "Lantai 2"
    assert response.summary_view.notes[0].startswith("occurrence_count = jumlah kelompok konteks")


@pytest.mark.asyncio
async def test_retrieval_api_returns_v2_fields_when_intent_mode_is_requested():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_intent_retrieval_fixture(session)

    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/PROJECT-V2/project-graph/retrieve",
            json={"query": "dimensi K1", "use_intent": True},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "NUMERIC_STORED_FACT"
    assert body["data_status"] == "grounded"
    assert any(node["name"] == "400x400 mm" for node in body["nodes"])


@pytest.mark.asyncio
async def test_retrieval_scopes_a_level_named_query_to_that_level_only():
    """Regression test for a real accuracy bug found via manual end-to-end
    testing against the 88-page PLHUT synthesis output: a query like "lantai
    2" used to BFS through EVERY relation from every text-matching node,
    pulling in unrelated "discipline" and "note" nodes alongside genuine
    level/occurrence data (338 mixed nodes on the real fixture). This test
    proves an exact level-name query returns ONLY level/occurrence/type/
    dimension nodes reachable via LOCATED_ON/INSTANCE_OF/HAS_DIMENSION -- not
    an unrelated "discipline" node that merely happens to share a snapshot."""
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-LEVEL", owner_id="OWNER-A", name="Project Level"))
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-LEVEL", snapshot_id="SNAP-LEVEL", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="level", generation_metadata={},
            nodes=[
                {"node_id": "L2", "node_type": "level", "canonical_name": "Lantai 2", "normalized_name": "lantai 2", "discipline": "general", "verification_status": "extracted", "confidence": 0.9},
                {"node_id": "OCC-K1", "node_type": "element_occurrence", "canonical_name": "K1 @ Lantai 2", "normalized_name": "k1 @ lantai 2", "discipline": "structure", "verification_status": "cross_sheet_inferred", "confidence": 0.9},
                {"node_id": "TYPE-K1", "node_type": "element_type", "canonical_name": "K1", "normalized_name": "k1", "discipline": "structure", "verification_status": "extracted", "confidence": 0.9},
                {"node_id": "DIM-400", "node_type": "dimension", "canonical_name": "400x400 mm", "normalized_name": "400x400 mm", "discipline": "structure", "verification_status": "extracted", "confidence": 0.9},
                # Unrelated nodes that legitimately mention "lantai 2" in free text
                # but must NOT be pulled in by a level-scoped query.
                {"node_id": "DISC-ARCH", "node_type": "discipline", "canonical_name": "architecture", "normalized_name": "architecture", "discipline": "architecture", "verification_status": "extracted", "confidence": 0.9, "search_text": "denah lantai 2 arsitektur"},
                {"node_id": "NOTE-1", "node_type": "note", "canonical_name": "Catatan lantai 2 belum final", "normalized_name": "catatan lantai 2 belum final", "discipline": "general", "verification_status": "extracted", "confidence": 0.9},
            ],
            edges=[
                {"edge_id": "OCC-L2", "source_node_id": "OCC-K1", "target_node_id": "L2", "relation": "LOCATED_ON", "confidence_class": "CROSS_SHEET_INFERRED", "confidence": 0.9},
                {"edge_id": "OCC-TYPE", "source_node_id": "OCC-K1", "target_node_id": "TYPE-K1", "relation": "INSTANCE_OF", "confidence_class": "CROSS_SHEET_INFERRED", "confidence": 0.9},
                {"edge_id": "OCC-DIM", "source_node_id": "OCC-K1", "target_node_id": "DIM-400", "relation": "HAS_DIMENSION", "confidence_class": "CROSS_SHEET_INFERRED", "confidence": 0.9},
                # A REFERENCES edge from the note to the level -- must NOT be
                # traversed since it's outside the level-scoped relation set.
                {"edge_id": "NOTE-L2", "source_node_id": "NOTE-1", "target_node_id": "L2", "relation": "REFERENCES", "confidence_class": "EXTRACTED", "confidence": 0.9},
            ],
            evidence=[], node_evidence=[], edge_evidence=[], aliases=[], communities=[],
        )

        result = await retrieve_project_graph(
            session, project_id="PROJECT-LEVEL", query="Lantai 2", depth=2, budget_tokens=2000,
        )

    node_ids = {node.node_id for node in result.nodes}
    assert node_ids == {"L2", "OCC-K1", "TYPE-K1", "DIM-400"}
    assert "DISC-ARCH" not in node_ids
    assert "NOTE-1" not in node_ids


@pytest.mark.asyncio
async def test_retrieval_falls_back_to_text_match_for_a_non_level_query():
    """A query that does not exactly name a level (e.g. a combined phrase
    like "struktur lantai 2", or a plain element name) must NOT trigger
    level-scoping -- it falls through to the existing text-match seed
    scoring unchanged."""
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-NOLVL", owner_id="OWNER-A", name="Project NoLevel"))
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-NOLVL", snapshot_id="SNAP-NOLVL", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="nolvl", generation_metadata={},
            nodes=[
                {"node_id": "L2", "node_type": "level", "canonical_name": "Lantai 2", "normalized_name": "lantai 2", "discipline": "general", "verification_status": "extracted", "confidence": 0.9},
            ],
            edges=[], evidence=[], node_evidence=[], edge_evidence=[], aliases=[], communities=[],
        )

        result = await retrieve_project_graph(
            session, project_id="PROJECT-NOLVL", query="struktur lantai 2", depth=2, budget_tokens=2000,
        )

    assert result.nodes == []


@pytest.mark.asyncio
async def test_retrieval_prefers_level_nodes_with_a_real_located_on_occurrence():
    """Regression test for a real accuracy gap found on the 88-page PLHUT
    fixture: querying "Lantai 2" found 8 same-named level nodes, but only 1
    ever had a LOCATED_ON edge from a real occurrence -- the other 7 were
    inert per-page mention noise from page_patch.py (id prefix NODE-, one per
    page that happens to say "Lantai 2" in a levels observation, e.g. a ramp
    or roof elevation coincidentally normalized to the same text) that never
    get attached to anything via cross_sheet_resolver's _level_node(). Seeding
    from all 8 equally would waste BFS budget on 7 dead ends. This test
    proves the retrieval seeds only the attached one when at least one
    same-named level actually has an occurrence."""
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-LEVELNOISE", owner_id="OWNER-A", name="Project LevelNoise"))
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-LEVELNOISE", snapshot_id="SNAP-LEVELNOISE",
            schema_version="paax.pckm.graph.v1", source_manifest_hash="levelnoise", generation_metadata={},
            nodes=[
                # The one level node an occurrence is actually LOCATED_ON.
                {"node_id": "LEVEL-ATTACHED", "node_type": "level", "canonical_name": "Lantai 2", "normalized_name": "lantai 2", "discipline": "general", "verification_status": "extracted", "confidence": 0.9},
                {"node_id": "OCC-K1", "node_type": "element_occurrence", "canonical_name": "K1 @ Lantai 2", "normalized_name": "k1 @ lantai 2", "discipline": "structure", "verification_status": "cross_sheet_inferred", "confidence": 0.9},
                # Inert per-page mention noise: same name, no occurrence ever
                # points at these via LOCATED_ON (e.g. a ramp level that
                # happens to normalize to the same text as the real floor).
                {"node_id": "NODE-MENTION-1", "node_type": "level", "canonical_name": "Lantai 2", "normalized_name": "lantai 2", "discipline": "general", "verification_status": "extracted", "confidence": 0.9},
                {"node_id": "NODE-MENTION-2", "node_type": "level", "canonical_name": "Lantai 2", "normalized_name": "lantai 2", "discipline": "general", "verification_status": "extracted", "confidence": 0.9},
            ],
            edges=[
                {"edge_id": "OCC-L2", "source_node_id": "OCC-K1", "target_node_id": "LEVEL-ATTACHED", "relation": "LOCATED_ON", "confidence_class": "CROSS_SHEET_INFERRED", "confidence": 0.9},
            ],
            evidence=[], node_evidence=[], edge_evidence=[], aliases=[], communities=[],
        )

        result = await retrieve_project_graph(
            session, project_id="PROJECT-LEVELNOISE", query="Lantai 2", depth=2, budget_tokens=2000,
        )

    node_ids = {node.node_id for node in result.nodes}
    assert node_ids == {"LEVEL-ATTACHED", "OCC-K1"}
    assert "NODE-MENTION-1" not in node_ids
    assert "NODE-MENTION-2" not in node_ids


@pytest.mark.asyncio
async def test_retrieval_falls_back_to_all_name_matches_when_none_are_attached():
    """If every same-named level node is inert (no occurrence located on any
    of them -- e.g. a level that genuinely has no elements bound to it yet),
    surfacing the mention nodes is strictly better than returning nothing."""
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-ALLINERT", owner_id="OWNER-A", name="Project AllInert"))
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-ALLINERT", snapshot_id="SNAP-ALLINERT",
            schema_version="paax.pckm.graph.v1", source_manifest_hash="allinert", generation_metadata={},
            nodes=[
                {"node_id": "NODE-MENTION-1", "node_type": "level", "canonical_name": "Lantai 5", "normalized_name": "lantai 5", "discipline": "general", "verification_status": "extracted", "confidence": 0.9},
            ],
            edges=[], evidence=[], node_evidence=[], edge_evidence=[], aliases=[], communities=[],
        )

        result = await retrieve_project_graph(
            session, project_id="PROJECT-ALLINERT", query="Lantai 5", depth=2, budget_tokens=2000,
        )

    assert {node.node_id for node in result.nodes} == {"NODE-MENTION-1"}


@pytest.mark.asyncio
async def test_context_contract_fields_and_quantity_authority_populated():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-CONTRACT", owner_id="OWNER-A", name="Project Contract"))
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-CONTRACT", snapshot_id="SNAP-CONTRACT",
            schema_version="paax.pckm.graph.v1", source_manifest_hash="contract", generation_metadata={},
            nodes=[
                {"node_id": "DIM-1", "node_type": "dimension", "canonical_name": "300x300", "normalized_name": "300x300", "discipline": "structure", "verification_status": "extracted", "confidence": 0.9, "properties": {"allowed_claims": ["claim1"], "forbidden_claims": ["claim2"]}},
                {"node_id": "CONFLICT-1", "node_type": "conflict", "canonical_name": "Conflict detected", "normalized_name": "conflict detected", "discipline": "general", "verification_status": "conflicting", "confidence": 1.0},
            ],
            edges=[
                {"edge_id": "DIM-CONFLICT", "source_node_id": "CONFLICT-1", "target_node_id": "DIM-1", "relation": "HAS_EVIDENCE", "confidence_class": "EXTRACTED", "confidence": 1.0},
            ],
            evidence=[
                {"evidence_id": "EV-1", "document_id": "DOC-1", "page_index": 1, "sheet_id": "S-1", "kind": "text", "raw_text": "Evidence 1"}
            ],
            node_evidence=[
                {"node_id": "DIM-1", "evidence_id": "EV-1", "role": "source"}
            ],
            edge_evidence=[], aliases=[], communities=[],
        )

        result = await retrieve_project_graph(
            session, project_id="PROJECT-CONTRACT", query="300x300", depth=2, budget_tokens=2000,
        )
        calc_result = await retrieve_project_graph(
            session, project_id="PROJECT-CONTRACT", query="berapa volume beton", use_intent=True
        )

    assert result.status == "success"
    # Verify new context contract fields are correctly populated
    assert len(result.facts) == 2
    fact_ids = {f["node_id"] for f in result.facts}
    assert fact_ids == {"DIM-1", "CONFLICT-1"}
    dim_fact = next(f for f in result.facts if f["node_id"] == "DIM-1")
    assert dim_fact["canonical_name"] == "300x300"
    
    assert len(result.relationships) == 1
    assert result.relationships[0]["edge_id"] == "DIM-CONFLICT"
    assert result.relationships[0]["relation"] == "HAS_EVIDENCE"

    assert len(result.conflicts) == 1
    assert result.conflicts[0]["node_id"] == "CONFLICT-1"

    assert len(result.citations) == 1
    assert result.citations[0]["evidence_id"] == "EV-1"
    assert result.citations[0]["raw_text"] == "Evidence 1"

    assert result.allowed_claims == ["claim1"]
    assert result.forbidden_claims == ["claim2"]
    
    # Since a dimension node is present, quantity_authority must be measurement_fact
    assert result.quantity_authority == "measurement_fact"

    # For intent queries that are calculation-required
    assert calc_result.status == "calculation_required"
    assert calc_result.quantity_authority == "core_engine"
