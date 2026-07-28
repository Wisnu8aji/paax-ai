import pytest
import pytest_asyncio
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
)


def _script_directory() -> ScriptDirectory:
    service_root = Path(__file__).resolve().parents[1]
    config = Config(str(service_root / "alembic.ini"))
    config.set_main_option("script_location", str(service_root / "alembic"))
    return ScriptDirectory.from_config(config)


def test_alembic_0033_is_single_head():
    script = _script_directory()
    heads = script.get_heads()
    assert len(heads) == 1
    assert heads[0] == "0033_contextual_foundation"

    rev = script.get_revision("0033_contextual_foundation")
    assert rev.down_revision == "0032_correction_status"
    source = Path(rev.path).read_text(encoding="utf-8")
    assert "raw_evidence_artifacts" in source
    assert "canonical_facts" in source
    assert "resolution_decisions" in source


def test_models_exist_and_have_tablename():
    assert RawEvidenceArtifactModel.__tablename__ == "raw_evidence_artifacts"
    assert EvidenceRegionModel.__tablename__ == "raw_evidence_regions"
    assert SourceAuthorityEntryModel.__tablename__ == "source_authority_entries"
    assert CanonicalFactModel.__tablename__ == "canonical_facts"
    assert CanonicalFactEvidenceLinkModel.__tablename__ == "canonical_fact_evidence_links"
    assert ResolutionDecisionModel.__tablename__ == "resolution_decisions"


from paax_schemas.contextual_evidence import (
    RawEvidenceArtifact,
    EvidenceRegion,
    SourceAuthorityEntry,
    CanonicalFact,
    PropagationScope,
    ResolutionDecision,
)
from paax_db import ContextualEvidenceRepository
from paax_db.models import Project, ProjectGraphSnapshot
from .conftest import TestSession


@pytest.mark.asyncio
async def test_repository_save_and_retrieve_lineage():
    async with TestSession() as session:
        proj_row = Project(
            id="proj_test_1",
            owner_id="user_1",
            name="Test Project",
        )
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
        art = RawEvidenceArtifact(
            schema_version="paax.contextual-evidence.v1",
            artifact_id="art_test_1",
            project_id="proj_test_1",
            document_id="doc_1",
            artifact_kind="dem_page",
            content_sha256="a"*64,
            storage_ref="s3://ref",
            media_type="image/png",
            byte_size=100,
            created_at="2026-07-28T10:00:00Z",
        )
        saved_art = await repo.save_raw_artifact(art)
        assert saved_art.artifact_id == "art_test_1"

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
        saved_auth = await repo.save_source_authority(auth)
        assert saved_auth.authority_id == "auth_test_1"

        fact = CanonicalFact(
            fact_id="fact_test_1",
            project_id="proj_test_1",
            snapshot_id="snap_test_1",
            fact_type="structural_dimension",
            subject_ref="K1",
            predicate="width_mm",
            value=300,
            status="candidate",
            evidence_refs=["art_test_1"],
            source_authority_id="auth_test_1",
            calculation_authority="none",
            created_by="pipeline",
            created_at="2026-07-28T10:03:00Z",
        )
        saved_fact = await repo.save_canonical_fact(fact)
        assert saved_fact.fact_id == "fact_test_1"
        assert saved_fact.calculation_authority == "none"

        res_fact, res_auth, res_arts, res_regs = await repo.get_fact_lineage("fact_test_1")
        assert res_fact.fact_id == "fact_test_1"
        assert res_auth.authority_id == "auth_test_1"
        assert len(res_arts) == 1
        assert res_arts[0].artifact_id == "art_test_1"

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
        saved_dec = await repo.save_resolution_decision(dec)
        assert saved_dec.decision_id == "dec_test_1"

        history = await repo.get_resolution_history("proj_test_1", "fact_test_1")
        assert len(history) == 1
        assert history[0].decision_id == "dec_test_1"

        active_facts = await repo.list_active_canonical_facts("proj_test_1", "snap_test_1")
        assert len(active_facts) == 1
        assert active_facts[0].fact_id == "fact_test_1"


