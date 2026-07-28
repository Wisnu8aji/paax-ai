import pytest
from app.project_graph.contextual_evidence_adapter import (
    ContextualEvidenceAdapter,
    ContextualEvidenceBundleResult,
    ContextualFactProposalResult,
)
from paax_schemas.contextual_evidence import CanonicalFact, RawEvidenceArtifact, EvidenceRegion, SourceAuthorityEntry


def test_contextual_evidence_adapter_materialization():
    adapter = ContextualEvidenceAdapter()

    page_data = {
        "document_id": "doc_abc_123",
        "document_revision_id": "doc_rev_01",
        "page_index": 0,
        "sheet_id": "sheet_A2_102",
        "sheet_revision_id": "sheet_rev_01",
        "view_id": "view_fl_01",
        "file_name": "A2-102_FloorPlan.pdf",
        "media_type": "application/pdf",
        "content_bytes": b"sample raw page content",
        "drawing_type": "Floor Plan",
        "discipline": "STR",
        "observations": [
            {
                "subject_ref": "COL-K1-001",
                "fact_type": "structural_dimension",
                "predicate": "section_dimensions",
                "value": {"width_mm": 300, "depth_mm": 600, "token_ref": "P1"},
                "bbox_space": "normalized_page",
                "bbox": [0.1, 0.2, 0.3, 0.4],
                "confidence": 0.95,
            }
        ]
    }

    art, reg, auth, facts = adapter.materialize_page_evidence(
        project_id="proj_demo_01",
        snapshot_id="snap_pckm_001",
        page_data=page_data,
        creator="pipeline_dem"
    )

    assert isinstance(art, RawEvidenceArtifact)
    assert art.artifact_id.startswith("art_")
    assert art.artifact_kind == "dem_page"
    assert len(art.content_sha256) == 64

    assert isinstance(reg, EvidenceRegion)
    assert reg.artifact_id == art.artifact_id
    assert reg.page_index == 0

    assert isinstance(auth, SourceAuthorityEntry)
    assert auth.source_kind == "dem_sheet_drawing"
    assert auth.source_ref == "sheet_A2_102"

    assert len(facts) == 1
    fact = facts[0]
    assert isinstance(fact, CanonicalFact)
    assert fact.fact_id.startswith("fact_")
    assert fact.calculation_authority == "none"
    assert fact.subject_ref == "COL-K1-001"
    assert fact.source_authority_id == auth.authority_id


@pytest.mark.asyncio
async def test_contextual_evidence_adapter_fail_closed_without_repo():
    adapter = ContextualEvidenceAdapter(repository=None)
    art = RawEvidenceArtifact(
        schema_version="paax.contextual-evidence.v1",
        artifact_id="art_1",
        project_id="p1",
        document_id="d1",
        artifact_kind="dem_page",
        content_sha256="a" * 64,
        storage_ref="s3://ref",
        media_type="image/png",
        byte_size=10,
        created_at="2026-07-28T10:00:00Z",
    )
    res = await adapter.validate_and_persist_bundle(art)
    assert res.bundle_status == "rejected"
    assert "Repository is not configured" in res.error
