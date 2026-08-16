import pytest
import pytest_asyncio
from datetime import datetime, timezone
from pathlib import Path
from alembic.config import Config
from alembic.script import ScriptDirectory

from paax_db.models import (
    RawEvidenceArtifactModel,
    EvidenceRegionModel,
    SourceAuthorityEntryModel,
    CanonicalFactModel,
    CanonicalFactEvidenceLinkModel,
    ResolutionDecisionModel,
    ResolutionDecisionFactLinkModel,
    Project,
    ProjectGraphSnapshot,
)
from paax_schemas.contextual_evidence import (
    RawEvidenceArtifact,
    EvidenceRegion,
    SourceAuthorityEntry,
    CanonicalFact,
    PropagationScope,
    ResolutionDecision,
)
from paax_db import (
    ContextualEvidenceRepository,
    ContextualEvidenceConflict,
    ContextualEvidenceIntegrityError,
)
from paax_db.contextual_evidence_repository import _parse_dt
from .conftest import TestSession


def _script_directory() -> ScriptDirectory:
    service_root = Path(__file__).resolve().parents[1]
    config = Config(str(service_root / "alembic.ini"))
    config.set_main_option("script_location", str(service_root / "alembic"))
    return ScriptDirectory.from_config(config)


def test_alembic_0036_is_single_head():
    script = _script_directory()
    heads = script.get_heads()
    assert len(heads) == 1
    assert heads[0].startswith(("0036", "0039", "0041"))

    rev_0036 = script.get_revision("0036")
    assert isinstance(rev_0036.down_revision, str)
    assert rev_0036.down_revision == "0035_calculation_authority"

    rev_0035 = script.get_revision("0035_calculation_authority")
    assert rev_0035.down_revision == "0034_contextual_integrity"

    source_0036 = Path(rev_0036.path).read_text(encoding="utf-8")
    assert "project_references" in source_0036
    assert "actor_workspace_head" in source_0036


def test_models_exist_and_have_tablename():
    assert RawEvidenceArtifactModel.__tablename__ == "raw_evidence_artifacts"
    assert EvidenceRegionModel.__tablename__ == "raw_evidence_regions"
    assert SourceAuthorityEntryModel.__tablename__ == "source_authority_entries"
    assert CanonicalFactModel.__tablename__ == "canonical_facts"
    assert CanonicalFactEvidenceLinkModel.__tablename__ == "canonical_fact_evidence_links"
    assert ResolutionDecisionModel.__tablename__ == "resolution_decisions"
    assert ResolutionDecisionFactLinkModel.__tablename__ == "resolution_decision_fact_links"


@pytest.mark.asyncio
async def test_repository_append_idempotency_and_lineage():
    async with TestSession() as session:
        proj_row = Project(id="proj_test_1", owner_id="user_1", name="Test Project")
        session.add(proj_row)

        snap_row = ProjectGraphSnapshot(
            snapshot_id="snap_test_1",
            project_id="proj_test_1",
            schema_version="paax.pckm.graph.v1",
            status="active",
            source_manifest_hash="hash_1",
            generation_metadata={},
            effective_sheet_revision_ids=[],
        )
        session.add(snap_row)
        await session.flush()

        repo = ContextualEvidenceRepository(session)

        # 1. Append artifact
        art = RawEvidenceArtifact(
            schema_version="paax.contextual-evidence.v1",
            artifact_id="art_test_1",
            project_id="proj_test_1",
            document_id="doc_1",
            artifact_kind="dem_page",
            content_sha256="a" * 64,
            storage_ref="s3://ref",
            media_type="image/png",
            byte_size=100,
            created_at="2026-07-28T10:00:00Z",
        )
        res1 = await repo.append_raw_evidence_bundle(art)
        assert res1.status == "inserted"

        # Identical retry -> existing
        res1_retry = await repo.append_raw_evidence_bundle(art)
        assert res1_retry.status == "existing"

        # Conflicting retry -> raises ContextualEvidenceConflict
        art_conflict = RawEvidenceArtifact(
            schema_version="paax.contextual-evidence.v1",
            artifact_id="art_test_1",
            project_id="proj_test_1",
            document_id="doc_1",
            artifact_kind="dem_page",
            content_sha256="b" * 64,  # different SHA
            storage_ref="s3://ref",
            media_type="image/png",
            byte_size=100,
            created_at="2026-07-28T10:00:00Z",
        )
        with pytest.raises(ContextualEvidenceConflict):
            await repo.append_raw_evidence_bundle(art_conflict)

        # 2. Append region
        reg = EvidenceRegion(
            region_id="reg_test_1",
            artifact_id="art_test_1",
            project_id="proj_test_1",
            page_index=0,
            bbox_space="normalized_page",
            bbox=[0.1, 0.1, 0.5, 0.5],
            created_at="2026-07-28T10:01:00Z",
        )
        saved_reg = await repo.save_evidence_region(reg)
        assert saved_reg.region_id == "reg_test_1"

        # 3. Append authority
        auth = SourceAuthorityEntry(
            authority_id="auth_test_1",
            project_id="proj_test_1",
            source_kind="dem_sheet",
            source_ref="S-01",
            version="v1",
            evidence_refs=["art_test_1"],
            created_by="user_1",
            created_at="2026-07-28T10:02:00Z",
        )
        res_auth = await repo.append_source_authority(auth)
        assert res_auth.status == "inserted"

        # 4. Append fact
        fact = CanonicalFact(
            fact_id="fact_test_1",
            project_id="proj_test_1",
            snapshot_id="snap_test_1",
            fact_type="structural_dimension",
            subject_ref="K1",
            predicate="width_mm",
            value=300,
            status="candidate",
            evidence_refs=["reg_test_1"],
            source_authority_id="auth_test_1",
            calculation_authority="none",
            created_by="pipeline",
            created_at="2026-07-28T10:03:00Z",
        )
        res_fact = await repo.append_canonical_fact(fact)
        assert res_fact.status == "inserted"

        # Lineage retrieval
        lineage = await repo.get_canonical_fact_lineage("proj_test_1", "fact_test_1")
        assert lineage.fact.fact_id == "fact_test_1"
        assert lineage.authority is not None and lineage.authority.authority_id == "auth_test_1"
        assert len(lineage.artifacts) == 1
        assert lineage.artifacts[0].artifact_id == "art_test_1"

        # 5. Append decision
        dec = ResolutionDecision(
            decision_id="dec_test_1",
            project_id="proj_test_1",
            snapshot_id="snap_test_1",
            target_fact_ids=["fact_test_1"],
            selected_fact_id="fact_test_1",
            status="approved",
            scope=PropagationScope(project_id="proj_test_1", match_mode="exact"),
            rationale="Approved by engineer",
            decided_by="eng_1",
            calculation_authority="none",
            created_at="2026-07-28T10:04:00Z",
        )
        res_dec = await repo.append_resolution_decision(dec)
        assert res_dec.status == "inserted"

        # Resolution history
        history = await repo.get_resolution_history("proj_test_1", "fact_test_1")
        assert len(history) == 1
        assert history[0].decision_id == "dec_test_1"


@pytest.mark.asyncio
async def test_repository_rejects_cross_project_and_orphans():
    async with TestSession() as session:
        proj1 = Project(id="proj_A", owner_id="u1", name="Project A")
        proj2 = Project(id="proj_B", owner_id="u1", name="Project B")
        session.add_all([proj1, proj2])

        snap1 = ProjectGraphSnapshot(
            snapshot_id="snap_A", project_id="proj_A", schema_version="v1", status="active",
            source_manifest_hash="h1", generation_metadata={}, effective_sheet_revision_ids=[]
        )
        session.add(snap1)
        await session.flush()

        repo = ContextualEvidenceRepository(session)

        art = RawEvidenceArtifact(
            schema_version="paax.contextual-evidence.v1", artifact_id="art_A", project_id="proj_A",
            document_id="doc1", artifact_kind="dem_page", content_sha256="c"*64, storage_ref="s3://ref",
            media_type="image/png", byte_size=10, created_at="2026-07-28T10:00:00Z"
        )
        await repo.append_raw_evidence_bundle(art)

        # Cross-project region -> raises ContextualEvidenceIntegrityError
        reg_cross = EvidenceRegion(
            region_id="reg_cross", artifact_id="art_A", project_id="proj_B", page_index=0, created_at="2026-07-28T10:00:00Z"
        )
        with pytest.raises(ContextualEvidenceIntegrityError):
            await repo.save_evidence_region(reg_cross)


@pytest.mark.asyncio
async def test_append_only_models_reject_update_and_delete():
    async with TestSession() as session:
        dt = _parse_dt("2026-07-28T10:00:00Z")
        art_row = RawEvidenceArtifactModel(
            artifact_id="art_immut", project_id="p1", document_id="d1", artifact_kind="dem_page",
            content_sha256="f"*64, storage_ref="ref", media_type="image/png", byte_size=10, created_at=dt
        )
        session.add(art_row)
        await session.flush()

        art_row.document_id = "d2_updated"
        with pytest.raises(ValueError, match="append-only"):
            await session.flush()
