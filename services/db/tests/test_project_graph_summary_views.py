from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from paax_db import models
from paax_db.main import app


@pytest.mark.asyncio
async def test_project_graph_summary_views_api():
    headers = {"X-Internal-Key": "test-internal-key", "X-User-Id": "OWNER-A"}
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create project
        create_project = await client.post(
            "/projects",
            json={"id": "PROJECT-A", "owner_id": "ignored", "name": "Project A"},
            headers=headers,
        )
        assert create_project.status_code == 200

        # 1. Verify GET on empty/no snapshot returns empty list
        get_empty = await client.get(
            "/projects/PROJECT-A/project-graph/summary-views",
            headers=headers,
        )
        assert get_empty.status_code == 200
        assert get_empty.json() == []

        # 2. Create Snapshot 1 with summary views
        payload1 = {
            "snapshot_id": "SNAPSHOT-A1",
            "schema_version": "paax.pckm.graph.v1",
            "source_manifest_hash": "manifest-a1",
            "generation_metadata": {"run_id": "RUN-A1"},
            "nodes": [],
            "edges": [],
            "evidence": [],
            "node_evidence": [],
            "edge_evidence": [],
            "aliases": [],
            "communities": [],
            "summary_views": [
                {
                    "schema_version": "paax.pckm.summary-view.v1",
                    "project_id": "PROJECT-A",
                    "snapshot_id": "SNAPSHOT-A1",
                    "view_kind": "LEVEL_OVERVIEW",
                    "grain": {"level_id": "LEVEL-1"},
                    "summary": {
                        "level_name": "Lantai 1",
                        "element_type_index": [],
                        "discipline_counts": [],
                        "stored_measurement_facts": [],
                    },
                    "quality": {
                        "confirmed_count": 5,
                        "ambiguous_binding_count": 0,
                        "conflict_count": 0,
                    },
                    "provenance": {
                        "summary_builder_version": "paax.pckm.summary-builder.v1",
                    },
                },
                {
                    "schema_version": "paax.pckm.summary-view.v1",
                    "project_id": "PROJECT-A",
                    "snapshot_id": "SNAPSHOT-A1",
                    "view_kind": "LEVEL_OVERVIEW",
                    "grain": {"level_id": "LEVEL-2"},
                    "summary": {
                        "level_name": "Lantai 2",
                        "element_type_index": [],
                        "discipline_counts": [],
                        "stored_measurement_facts": [],
                    },
                    "quality": {
                        "confirmed_count": 10,
                        "ambiguous_binding_count": 0,
                        "conflict_count": 0,
                    },
                    "provenance": {
                        "summary_builder_version": "paax.pckm.summary-builder.v1",
                    },
                }
            ],
        }

        created_snapshot1 = await client.post(
            "/projects/PROJECT-A/project-graph/snapshots",
            json=payload1,
            headers=headers,
        )
        assert created_snapshot1.status_code == 200

        # 3. Verify GET returns the two summary views of SNAPSHOT-A1
        get_views = await client.get(
            "/projects/PROJECT-A/project-graph/summary-views",
            headers=headers,
        )
        assert get_views.status_code == 200
        views_json = get_views.json()
        assert len(views_json) == 2
        # Verify correctness
        level_ids = {v["level_id"] for v in views_json}
        assert level_ids == {"LEVEL-1", "LEVEL-2"}
        for v in views_json:
            assert v["snapshot_id"] == "SNAPSHOT-A1"

        # 4. Verify filters view_kind and level_id work
        get_filtered = await client.get(
            "/projects/PROJECT-A/project-graph/summary-views?level_id=LEVEL-1",
            headers=headers,
        )
        assert get_filtered.status_code == 200
        filtered_json = get_filtered.json()
        assert len(filtered_json) == 1
        assert filtered_json[0]["level_id"] == "LEVEL-1"

        # 5. Create Snapshot 2 (supersedes Snapshot 1) with different summary views
        payload2 = {
            "snapshot_id": "SNAPSHOT-A2",
            "schema_version": "paax.pckm.graph.v1",
            "source_manifest_hash": "manifest-a2",
            "generation_metadata": {"run_id": "RUN-A2"},
            "nodes": [],
            "edges": [],
            "evidence": [],
            "node_evidence": [],
            "edge_evidence": [],
            "aliases": [],
            "communities": [],
            "summary_views": [
                {
                    "schema_version": "paax.pckm.summary-view.v1",
                    "project_id": "PROJECT-A",
                    "snapshot_id": "SNAPSHOT-A2",
                    "view_kind": "LEVEL_OVERVIEW",
                    "grain": {"level_id": "LEVEL-3"},
                    "summary": {
                        "level_name": "Lantai 3",
                        "element_type_index": [],
                        "discipline_counts": [],
                        "stored_measurement_facts": [],
                    },
                    "quality": {
                        "confirmed_count": 8,
                        "ambiguous_binding_count": 0,
                        "conflict_count": 0,
                    },
                    "provenance": {
                        "summary_builder_version": "paax.pckm.summary-builder.v1",
                    },
                }
            ],
        }

        created_snapshot2 = await client.post(
            "/projects/PROJECT-A/project-graph/snapshots",
            json=payload2,
            headers=headers,
        )
        assert created_snapshot2.status_code == 200

        # 6. Verify GET now ONLY returns views from SNAPSHOT-A2 (active), NOT SNAPSHOT-A1 (superseded)
        get_views_after = await client.get(
            "/projects/PROJECT-A/project-graph/summary-views",
            headers=headers,
        )
        assert get_views_after.status_code == 200
        views_after_json = get_views_after.json()
        assert len(views_after_json) == 1
        assert views_after_json[0]["snapshot_id"] == "SNAPSHOT-A2"
        assert views_after_json[0]["level_id"] == "LEVEL-3"
