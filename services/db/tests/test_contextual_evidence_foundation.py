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
