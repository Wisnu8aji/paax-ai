import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from app.project_graph.synthesis_task import synthesize_and_post_snapshot_task
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
        assert ev["artifact_hash"] == "test-doc-hash"
        assert ev["dem_page_id"] in ["PAGE-ID-0", "PAGE-ID-1"]
        assert ev["project_id"] == project_id
        assert ev["run_id"] == run_id

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
