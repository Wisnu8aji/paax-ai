import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from app.project_graph.models import EdgeResolver, ProjectGraphEdge
from app.project_graph.synthesis_task import _edge_to_dict, synthesize_and_post_snapshot_task
from app.transcription.db_client import DemDbClient
from app.transcription.models import (
    DemGeneration,
    DemSource,
    DrawingEvidenceSheet,
    EvidenceItem,
    InterpretedValue,
    ObservationValue,
    SheetCompletion,
    SheetIdentity,
    ValueWithEvidence,
)

def _create_synthetic_sheet(page_index: int, code: str, level: str | None = None) -> DrawingEvidenceSheet:
    observations = {
        "element_labels": [
            ObservationValue(
                raw=code,
                normalized=code,
                bbox=(10.0, 10.0, 20.0, 20.0),
                confidence=0.95,
                evidence_refs=[f"EV-{page_index}-LABEL"],
            )
        ],
        "spaces": [
            ObservationValue(
                raw="Ruang A",
                normalized="Ruang A",
                bbox=(24.0, 10.0, 34.0, 20.0),
                confidence=0.9,
                evidence_refs=[f"EV-{page_index}-SPACE"],
            )
        ]
    }
    if level is not None:
        observations["levels"] = [
            ObservationValue(
                raw=level,
                normalized=level,
                bbox=(24.0, 30.0, 34.0, 40.0),
                confidence=0.9,
                evidence_refs=[f"EV-{page_index}-LEVEL"],
            )
        ]

    evidence_ids = [f"EV-{page_index}-LABEL", f"EV-{page_index}-SPACE"]
    if level is not None:
        evidence_ids.append(f"EV-{page_index}-LEVEL")

    evidence = [
        EvidenceItem(
            evidence_id=ev_id,
            kind="text",
            raw=ev_id,
            bbox=(10.0, 20.0, 30.0, 40.0),
            confidence=0.9,
        )
        for ev_id in evidence_ids
    ]

    return DrawingEvidenceSheet(
        run_id="RUN-TEST",
        document_id="DOC-TEST",
        project_id="PROJECT-TEST",
        source=DemSource(
            document_hash="test-doc-hash",
            file_name="synthetic.pdf",
            page_index=page_index,
            page_number=page_index + 1,
            render_uri=f"memory://page-{page_index}",
            width_px=1000,
            height_px=700,
        ),
        generation=DemGeneration(
            provider="test-provider",
            model_alias="test-model",
            prompt_version="test-prompt-v1",
            started_at="2026-07-15T00:00:00Z",
        ),
        sheet_identity=SheetIdentity(
            sheet_number=ValueWithEvidence(
                value=f"S-{page_index + 1:02d}",
                confidence=0.9,
            ),
            title=ValueWithEvidence(value="Synthetic Sheet", confidence=0.9),
            discipline=InterpretedValue(
                value="Arsitektur",
                confidence=0.9,
                status="extracted",
            ),
        ),
        observations=observations,
        evidence=evidence,
        completion=SheetCompletion(
            sections_expected=1,
            sections_completed=1,
            is_complete=True,
        )
    )

@pytest.mark.asyncio
async def test_synthesize_and_post_snapshot_task_success():
    run_id = "RUN-TEST"
    project_id = "PROJECT-TEST"
    
    # 2 pages: page 0 (level L1, col-1), page 1 (level L2, col-2)
    sheet1 = _create_synthetic_sheet(0, "COL-1", level="L1")
    sheet2 = _create_synthetic_sheet(1, "COL-2", level="L2")
    
    run_status = {
        "project_id": project_id,
        "status": "dem_complete",
        "pages": [
            {"page_index": 0, "status": "complete", "id": "PAGE-ID-0", "result": sheet1.model_dump()},
            {"page_index": 1, "status": "complete", "id": "PAGE-ID-1", "result": sheet2.model_dump()},
        ]
    }
    
    # Mock db client
    mock_db_client = MagicMock(spec=DemDbClient)
    mock_db_client.update_run_status = AsyncMock()
    mock_db_client.get_active_sheet_revisions = AsyncMock(return_value=[])
    
    # Mock httpx Client context manager
    mock_client_in_context = AsyncMock()
    mock_client_in_context.post = AsyncMock()
    
    # Mock response
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"status": "success"}
    mock_client_in_context.post.return_value = mock_response
    
    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client_in_context)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    
    # Setup client context manager mock
    async def async_client_context():
        return mock_client
    mock_db_client._client = async_client_context
    mock_db_client._headers.return_value = {"Authorization": "Bearer token"}
    
    # Run task
    await synthesize_and_post_snapshot_task(run_id, project_id, run_status, mock_db_client)
    
    # Verify run status updated to synthesis_complete
    mock_db_client.update_run_status.assert_called_once_with(run_id, "synthesis_complete")
    
    # Inspect payload sent to POST
    mock_client_in_context.post.assert_called_once()
    call_args = mock_client_in_context.post.call_args
    post_url = call_args[0][0]
    post_json = call_args[1]["json"]
    
    assert post_url == f"/projects/{project_id}/project-graph/snapshots"
    
    # Assert on payload fields
    assert post_json["snapshot_id"] is not None
    assert post_json["schema_version"] == "paax.pckm.graph.v1"
    
    # Manifest hash should be sha256 of combined doc hashes
    assert post_json["source_manifest_hash"].startswith("sha256:")
    
    # Verify nodes & level_id mapping
    nodes = post_json["nodes"]
    assert len(nodes) > 0
    # Node types
    types = {n["node_type"] for n in nodes}
    assert "level" in types
    
    # Check that level_id is not None for level-associated nodes/occurrences
    level_nodes = [n for n in nodes if n["node_type"] == "level"]
    assert len(level_nodes) == 2  # L1 and L2
    
    # Verify evidence items
    evidence = post_json["evidence"]
    assert len(evidence) > 0
    
    evidence_ids = {ev["evidence_id"] for ev in evidence}
    
    for ev in evidence:
        # Check that we populated full fields, not placeholders
        assert ev["raw_text"] == ev["raw_content"]
        assert ev["bbox"] == [10.0, 20.0, 30.0, 40.0]
        assert ev["bbox_source"] == [10.0, 20.0, 30.0, 40.0]
        assert ev["bbox_normalized"] == [10.0, 20.0, 30.0, 40.0]
        assert ev["extractor"]["provider"] == "test-provider"
        assert ev["extractor"]["model"] == "test-model"
        assert ev["source_document_hash"] == "test-doc-hash"
        assert ev["dem_page_id"] in ["PAGE-ID-0", "PAGE-ID-1"]

    # Verify node_evidence mapping
    node_evidence = post_json["node_evidence"]
    assert len(node_evidence) > 0
    for ne in node_evidence:
        assert ne["evidence_id"] in evidence_ids
        assert ne["role"] == "primary"

    # Verify aliases mapping
    aliases = post_json["aliases"]
    assert len(aliases) > 0
    for alias in aliases:
        assert "alias_normalized" in alias
        assert "alias_raw" in alias
        assert "node_id" in alias
        assert alias["confidence"] > 0
        
    # Verify communities mapping
    communities = post_json["communities"]
    assert len(communities) > 0
    for comm in communities:
        assert comm["community_id"].startswith("community-")
        assert comm["member_count"] > 0


@pytest.mark.asyncio
async def test_synthesize_tags_evidence_with_active_sheet_revision_and_declares_effective_scope():
    run_id = "RUN-TEST"
    project_id = "PROJECT-TEST"

    sheet1 = _create_synthetic_sheet(0, "COL-1", level="L1")

    run_status = {
        "project_id": project_id,
        "status": "dem_complete",
        "pages": [
            {"page_index": 0, "status": "complete", "id": "PAGE-ID-0", "result": sheet1.model_dump()},
        ]
    }

    mock_db_client = MagicMock(spec=DemDbClient)
    mock_db_client.update_run_status = AsyncMock()
    mock_db_client.get_active_sheet_revisions = AsyncMock(return_value=[
        {"revision_id": "REV-S01-B", "document_id": "DOC-TEST", "sheet_id": "S-01"},
    ])

    mock_client_in_context = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"status": "success"}
    mock_client_in_context.post = AsyncMock(return_value=mock_response)

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client_in_context)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    async def async_client_context():
        return mock_client
    mock_db_client._client = async_client_context
    mock_db_client._headers.return_value = {"Authorization": "Bearer token"}

    await synthesize_and_post_snapshot_task(run_id, project_id, run_status, mock_db_client)

    post_json = mock_client_in_context.post.call_args[1]["json"]
    assert post_json["effective_sheet_revision_ids"] == ["REV-S01-B"]
    for ev in post_json["evidence"]:
        assert ev["revision_id"] == "REV-S01-B"
        assert ev["project_id"] == project_id
        assert ev["run_id"] == run_id


@pytest.mark.asyncio
async def test_synthesize_quarantines_dangling_evidence_reference_instead_of_fabricating_it():
    """A node/edge referencing an evidence_id that no sheet actually produced
    must not get a synthetic 'fallback' evidence row (that would make a
    dangling reference look structurally valid without real source backing).
    It must instead be excluded from evidence/node_evidence and the citing
    node/edge downgraded to a review status."""
    from app.project_graph import synthesis_task as synthesis_task_module

    run_id = "RUN-TEST"
    project_id = "PROJECT-TEST"
    sheet1 = _create_synthetic_sheet(0, "COL-1", level="L1")
    run_status = {
        "project_id": project_id,
        "status": "dem_complete",
        "pages": [
            {"page_index": 0, "status": "complete", "id": "PAGE-ID-0", "result": sheet1.model_dump()},
        ]
    }

    mock_db_client = MagicMock(spec=DemDbClient)
    mock_db_client.update_run_status = AsyncMock()
    mock_db_client.get_active_sheet_revisions = AsyncMock(return_value=[])

    mock_client_in_context = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"status": "success"}
    mock_client_in_context.post = AsyncMock(return_value=mock_response)

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client_in_context)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    async def async_client_context():
        return mock_client
    mock_db_client._client = async_client_context
    mock_db_client._headers.return_value = {"Authorization": "Bearer token"}

    original_synthesize = synthesis_task_module.synthesize_project_graph
    captured_node_id = {}

    def _synthesize_with_dangling_reference(sheets):
        result = original_synthesize(sheets)
        target_node = result.snapshot.nodes[0]
        target_node.source_refs = list(target_node.source_refs) + [
            target_node.source_refs[0].model_copy(update={"evidence_refs": ["EV-DOES-NOT-EXIST"]})
        ]
        captured_node_id["value"] = target_node.node_id
        return result

    with patch.object(synthesis_task_module, "synthesize_project_graph", side_effect=_synthesize_with_dangling_reference):
        await synthesize_and_post_snapshot_task(run_id, project_id, run_status, mock_db_client)

    post_json = mock_client_in_context.post.call_args[1]["json"]
    evidence_ids = {ev["evidence_id"] for ev in post_json["evidence"]}
    assert "EV-DOES-NOT-EXIST" not in evidence_ids
    assert all(ne["evidence_id"] != "EV-DOES-NOT-EXIST" for ne in post_json["node_evidence"])

    quarantined_node = next(n for n in post_json["nodes"] if n["node_id"] == captured_node_id["value"])
    assert quarantined_node["verification_status"] == "ambiguous"


@pytest.mark.asyncio
async def test_synthesize_raises_on_cross_page_evidence_id_collision():
    """Two pages that (bypassing the extraction-time namespacing) end up with
    the exact same evidence_id must not silently first-wins-drop the second
    page's evidence -- that would bind a node/edge to the wrong page's
    evidence with no error at all."""
    run_id = "RUN-TEST"
    project_id = "PROJECT-TEST"

    sheet1 = _create_synthetic_sheet(0, "COL-1", level="L1")
    sheet2 = _create_synthetic_sheet(1, "COL-2", level="L2")
    # Force a real collision: page 1's evidence reuses page 0's raw ids,
    # simulating a model that emitted the same local id on both pages.
    for ev in sheet2.evidence:
        ev.evidence_id = ev.evidence_id.replace("EV-1-", "EV-0-")

    run_status = {
        "project_id": project_id,
        "status": "dem_complete",
        "pages": [
            {"page_index": 0, "status": "complete", "id": "PAGE-ID-0", "result": sheet1.model_dump()},
            {"page_index": 1, "status": "complete", "id": "PAGE-ID-1", "result": sheet2.model_dump()},
        ]
    }

    mock_db_client = MagicMock(spec=DemDbClient)
    mock_db_client.update_run_status = AsyncMock()
    mock_db_client.get_active_sheet_revisions = AsyncMock(return_value=[])

    await synthesize_and_post_snapshot_task(run_id, project_id, run_status, mock_db_client)

    # The task catches all exceptions internally and marks the run failed --
    # it must not silently succeed with dropped/misattributed evidence.
    mock_db_client.update_run_status.assert_called_once_with(run_id, "synthesis_failed")


@pytest.mark.asyncio
async def test_synthesize_records_typed_observation_audit_signal_without_blocking():
    """The typed DEM v2 adapter (typed_observations.py) is wired in as a
    best-effort audit signal, not a hard gate -- a sheet that fails the
    stricter v2 evidence-by-status contract must still synthesize
    successfully, with the failure recorded in generation_metadata."""
    run_id = "RUN-TEST"
    project_id = "PROJECT-TEST"

    good_sheet = _create_synthetic_sheet(0, "COL-1", level="L1")

    bad_sheet = _create_synthetic_sheet(1, "COL-2", level="L2")
    # status='ai_interpreted' fails TypedObservationBase's validator (v2-only:
    # requires interpretation_method), while v1's ObservationValue has no such
    # field/requirement -- this isolates a genuine v2-only rejection instead
    # of one v1 would already have caught at DrawingEvidenceSheet parse time.
    bad_sheet.observations.spaces[0].status = "ai_interpreted"

    run_status = {
        "project_id": project_id,
        "status": "dem_complete",
        "pages": [
            {"page_index": 0, "status": "complete", "id": "PAGE-ID-0", "result": good_sheet.model_dump()},
            {"page_index": 1, "status": "complete", "id": "PAGE-ID-1", "result": bad_sheet.model_dump()},
        ]
    }

    mock_db_client = MagicMock(spec=DemDbClient)
    mock_db_client.update_run_status = AsyncMock()
    mock_db_client.get_active_sheet_revisions = AsyncMock(return_value=[])

    mock_client_in_context = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"status": "success"}
    mock_client_in_context.post = AsyncMock(return_value=mock_response)

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client_in_context)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    async def async_client_context():
        return mock_client
    mock_db_client._client = async_client_context
    mock_db_client._headers.return_value = {"Authorization": "Bearer token"}

    await synthesize_and_post_snapshot_task(run_id, project_id, run_status, mock_db_client)

    # Not blocked: synthesis still completed successfully.
    mock_db_client.update_run_status.assert_called_once_with(run_id, "synthesis_complete")

    post_json = mock_client_in_context.post.call_args[1]["json"]
    audit = post_json["generation_metadata"]["typed_observation_audit"]
    assert audit["sheets_passed"] == 1
    assert audit["sheets_failed"] == 1
    assert audit["failures"][0]["page_index"] == 1


def test_edge_to_dict_persists_the_full_resolver_audit_payload():
    """A prior audit found only resolver.method/model survived persistence,
    dropping candidates_considered/score_breakdown/passed_constraints/
    failed_constraints/rejected_candidate_ids/confidence_calibration -- the
    exact data a human reviewer needs to trust or contest an inferred edge."""
    edge = ProjectGraphEdge(
        edge_id="EDGE-1",
        source="NODE-A",
        target="NODE-B",
        relation="CONNECTED_TO",
        confidence_class="CROSS_SHEET_INFERRED",
        confidence=0.7,
        resolver=EdgeResolver(
            method="nearest_neighbor",
            model="cross-sheet-resolver-v2",
            resolver_version="2.1.0",
            candidates_considered=5,
            score_breakdown={"distance": 0.8, "label_match": 0.6},
            passed_constraints=["same_level"],
            failed_constraints=["same_discipline"],
            rejected_candidate_ids=["NODE-C", "NODE-D"],
            confidence_calibration={"raw_score": 0.72, "calibrated": 0.7},
        ),
    )

    result = _edge_to_dict(edge)

    assert result["properties"]["resolver"] == {
        "method": "nearest_neighbor",
        "model": "cross-sheet-resolver-v2",
        "resolver_version": "2.1.0",
        "candidates_considered": 5,
        "score_breakdown": {"distance": 0.8, "label_match": 0.6},
        "passed_constraints": ["same_level"],
        "failed_constraints": ["same_discipline"],
        "rejected_candidate_ids": ["NODE-C", "NODE-D"],
        "confidence_calibration": {"raw_score": 0.72, "calibrated": 0.7},
    }
